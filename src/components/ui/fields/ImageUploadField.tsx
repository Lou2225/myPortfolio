"use client";

import React, { useEffect, useId, useState } from "react";
import {
  Crop,
  FileImage,
  ImageIcon,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { ImageTransform } from "@/types/portfolio";
import {
  createDefaultImageTransform,
  isIdentityImageTransform,
  sanitizeImageTransform,
} from "@/lib/imageTransform";
import { UrlField } from "./UrlField";
import { FieldWrapper } from "./FieldWrapper";
import { FIELD_SLOT_BUTTON_CLASS, getFieldControlClassName } from "./inputStyles";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ImageCropModal } from "@/components/ui/ImageCropModal";
import {
  ActionMenuButton,
  type ActionMenuItem,
} from "@/components/ui/ActionMenuButton";
import { Magnetic } from "@/components/motion/Magnetic";
import { TransformedImage } from "@/components/ui/TransformedImage";
import { TruncatedText } from "@/components/ui/Tooltip";
import { IMAGE_FILE_ACCEPT, validateImageFile } from "@/lib/validation";
import {
  registerInstantImage,
  resolveInstantImageUrl,
  useInstantImageUrl,
} from "@/lib/instantImageCache";
import {
  useOfflineStatus,
  isNetworkOffline,
} from "@/components/pwa/OfflineManager";
import { cn } from "@/lib/utils";

interface CropSession {
  src: string;
  originalFile: File | null;
  initialTransform: ImageTransform;
  isObjectUrl: boolean;
}

export interface ImageUploadFieldProps {
  id?: string;
  label: string;
  value: string;
  transform?: ImageTransform;
  pendingFile?: File | null;
  onChange: (url: string) => void;
  onTransformChange?: (transform: ImageTransform) => void;
  onPendingFileChange?: (file: File | null) => void;
  onRevertToSaved?: () => void;
  folder: "hero" | "monogram" | "projects";
  placeholder?: string;
  required?: boolean;
  allowRelativePath?: boolean;
  forceTouched?: boolean;
  hint?: string;
  previewShape?: "circle" | "squircle" | "landscape";
  previewSize?: "md" | "lg";
  previewFit?: "cover" | "contain";
  previewAlt?: string;
  editable?: boolean;
  isDraftModified?: boolean;
  className?: string;
  onAssetSaved?: (url: string) => Promise<void> | void;
  onUploadError?: (message: string) => void;
}

/**
 * Reusable image path & upload field with strict image filtering, non-destructive
 * resize/framing modal, staged draft preview in placeholder, and confirmation before removal.
 */
export function ImageUploadField({
  id,
  label,
  value,
  transform,
  pendingFile = null,
  onChange,
  onTransformChange,
  onPendingFileChange,
  onRevertToSaved,
  folder,
  placeholder = "/assets/...",
  required = false,
  allowRelativePath = true,
  forceTouched = false,
  hint,
  previewShape = "squircle",
  previewSize = "lg",
  previewFit = "cover",
  previewAlt = "Uploaded image preview",
  editable = true,
  isDraftModified = false,
  className,
  onAssetSaved,
  onUploadError,
}: ImageUploadFieldProps) {
  const autoId = useId();
  const fieldId = id || `image-field-${autoId}`;
  const { isOnline } = useOfflineStatus();
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [cropSession, setCropSession] = useState<CropSession | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(
    null
  );
  const displayPreviewSrc = useInstantImageUrl(value);

  useEffect(() => {
    if (!pendingFile || typeof URL === "undefined") {
      const raf = requestAnimationFrame(() => setPendingPreviewUrl(null));
      return () => cancelAnimationFrame(raf);
    }
    const blobUrl = URL.createObjectURL(pendingFile);
    const raf = requestAnimationFrame(() => setPendingPreviewUrl(blobUrl));
    return () => {
      cancelAnimationFrame(raf);
      URL.revokeObjectURL(blobUrl);
    };
  }, [pendingFile]);

  const reportError = (msg: string) => {
    setLocalError(msg);
    onUploadError?.(msg);
  };

  const closeCropSession = () => {
    if (cropSession?.isObjectUrl) {
      URL.revokeObjectURL(cropSession.src);
    }
    setCropSession(null);
  };

  const uploadFileImmediately = async (file: File) => {
    if (isNetworkOffline(isOnline)) {
      reportError("Offline — Reconnect to upload image assets.");
      return;
    }

    setLocalError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to upload image.");
      }
      if (data.url) {
        registerInstantImage(data.url, file);
        onChange(data.url);
        if (onAssetSaved) {
          await onAssetSaved(data.url);
        }
      }
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : "Failed to upload image."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const fileCheck = validateImageFile(file);
    if (!fileCheck.valid) {
      reportError(
        fileCheck.error ||
        "Only image files (.png, .jpg, .webp, .avif, .svg, .ico) are permitted."
      );
      return;
    }

    setLocalError(null);

    if (editable) {
      const objectUrl = URL.createObjectURL(file);
      setCropSession({
        src: objectUrl,
        originalFile: file,
        initialTransform: createDefaultImageTransform(previewShape),
        isObjectUrl: true,
      });
      return;
    }

    if (onPendingFileChange) {
      onPendingFileChange(file);
      onTransformChange?.(createDefaultImageTransform(previewShape));
    } else {
      await uploadFileImmediately(file);
    }
  };

  const handleOpenExistingEditor = () => {
    if (!editable || uploading) return;
    if (pendingFile) {
      const objectUrl = URL.createObjectURL(pendingFile);
      setLocalError(null);
      setCropSession({
        src: objectUrl,
        originalFile: pendingFile,
        initialTransform: sanitizeImageTransform(transform, previewShape),
        isObjectUrl: true,
      });
      return;
    }

    if (!value) return;
    setLocalError(null);
    setCropSession({
      src: resolveInstantImageUrl(value),
      originalFile: null,
      initialTransform: sanitizeImageTransform(transform, previewShape),
      isObjectUrl: false,
    });
  };

  const handleApplyTransform = async ({
    transform: nextTransform,
    originalFile,
  }: {
    transform: ImageTransform;
    originalFile: File | null;
  }) => {
    if (originalFile) {
      if (onPendingFileChange) {
        onPendingFileChange(originalFile);
      } else {
        await uploadFileImmediately(originalFile);
      }
    }
    onTransformChange?.(nextTransform);
    closeCropSession();
  };

  const activePreviewSrc = pendingPreviewUrl || displayPreviewSrc;
  const hasAnyImage = Boolean(activePreviewSrc);
  const hasCustomTransform = !isIdentityImageTransform(transform, previewShape);
  const showPendingPill = Boolean(pendingFile) || isDraftModified;

  const isLarge = previewSize === "lg";
  const previewFrameClass =
    previewShape === "circle"
      ? isLarge
        ? "w-24 h-24 sm:w-28 sm:h-28 rounded-full"
        : "w-16 h-16 rounded-full"
      : previewShape === "landscape"
        ? isLarge
          ? "w-32 h-24 rounded-sm"
          : "w-24 h-16 rounded-sm"
        : isLarge
          ? "w-24 h-24 sm:w-28 sm:h-28 rounded-2xl"
          : "w-16 h-16 rounded-xl";

  const menuItems: ActionMenuItem[] = [];
  if (editable && hasAnyImage) {
    menuItems.push({
      id: "crop",
      label: "Resize & Frame",
      icon: <Crop className="w-3.5 h-3.5 text-(--text-accent)" aria-hidden="true" />,
      disabled: uploading,
      onSelect: handleOpenExistingEditor,
    });
  }
  if (
    (pendingFile || isDraftModified || hasCustomTransform) &&
    onRevertToSaved
  ) {
    menuItems.push({
      id: "revert",
      label: "Revert to Saved",
      intent: "warning",
      icon: <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />,
      disabled: uploading,
      onSelect: onRevertToSaved,
    });
  }
  if (!required && hasAnyImage) {
    menuItems.push({
      id: "remove",
      label: "Remove Image",
      intent: "danger",
      icon: <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />,
      disabled: uploading,
      onSelect: () => setConfirmClearOpen(true),
    });
  }

  const actionSlot = (
    <div className="flex items-center gap-2 sm:gap-1.5 w-full sm:w-auto min-w-0 max-w-full">
      <div className="flex-1 min-w-0 sm:flex-initial">
        <Magnetic strength={0.18} fullWidth className="sm:w-auto">
          <label
            className={cn(
              FIELD_SLOT_BUTTON_CLASS,
              "w-full sm:w-auto justify-center"
            )}
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-(--text-accent)" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-(--text-accent)" />
            )}
            <span>{uploading ? "Uploading..." : "Upload"}</span>
            <input
              type="file"
              accept={IMAGE_FILE_ACCEPT}
              disabled={uploading}
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </Magnetic>
      </div>

      {menuItems.length > 0 && (
        <ActionMenuButton
          label={`Actions for ${label}`}
          size="square"
          disabled={uploading}
          items={menuItems}
        />
      )}
    </div>
  );

  return (
    <div className={cn("space-y-2.5 min-w-0", className)}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3.5 sm:gap-5 min-w-0">
        {/* Placeholder Preview Frame (centered showcase stage on mobile, inline left on sm+) */}
        <div className="flex items-center justify-center py-3 px-4 rounded-(--radius-control) bg-(--bg-surface-2)/35 border border-(--border-subtle)/60 sm:block sm:p-0 sm:bg-transparent sm:border-0 sm:rounded-none shrink-0">
          <div
            style={
              hasAnyImage && previewFit === "contain"
                ? {
                  backgroundImage:
                    "linear-gradient(45deg, rgba(128,128,128,0.12) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.12) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.12) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.12) 75%)",
                  backgroundSize: "12px 12px",
                  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
                }
                : undefined
            }
            className={cn(
              "shrink-0 bg-(--bg-surface-2) border shadow-inner overflow-hidden flex items-center justify-center relative group",
              showPendingPill
                ? "border-amber-400/70"
                : "border-(--border-strong)",
              previewFrameClass
            )}
          >
            {hasAnyImage ? (
              <>
                <TransformedImage
                  src={activePreviewSrc}
                  alt={previewAlt}
                  transform={transform}
                  defaultFit={previewFit}
                  defaultPosition={previewShape === "squircle" ? "top" : "center"}
                  className="w-full h-full"
                />
                {editable && (
                  <button
                    type="button"
                    onClick={handleOpenExistingEditor}
                    disabled={uploading}
                    aria-label={`Resize and frame ${label}`}
                    className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white cursor-pointer"
                  >
                    <Crop className="w-4 h-4 text-(--text-accent)" />
                    <span className="text-[9px] font-mono uppercase tracking-wider">
                      Resize / Edit
                    </span>
                  </button>
                )}
              </>
            ) : (
              <ImageIcon className="w-7 h-7 text-(--text-muted)" />
            )}
          </div>
        </div>

        {/* URL Input or Staged Local File Readout + Action Row (never overflows half-width cards) */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {pendingFile ? (
            <FieldWrapper
              id={fieldId}
              label={label}
              required={required}
              touched={false}
              valid
              showCounter={false}
            >
              <div className="relative w-full min-w-0">
                <div
                  className={getFieldControlClassName({
                    hasError: false,
                    hasLeftIcon: true,
                    className:
                      "flex items-center gap-2 pr-3.5 overflow-hidden border-amber-400/50 bg-amber-500/8",
                  })}
                >
                  <FileImage className="w-4 h-4 text-amber-300 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <TruncatedText
                    text={pendingFile.name}
                    className="text-xs font-medium text-(--text-primary) block flex-1 min-w-0"
                  />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 shrink-0">
                    Staged
                  </span>
                </div>
              </div>
            </FieldWrapper>
          ) : (
            <UrlField
              id={fieldId}
              label={label}
              value={value}
              onChange={(nextUrl) => {
                setLocalError(null);
                onPendingFileChange?.(null);
                onChange(nextUrl);
              }}
              placeholder={placeholder}
              required={required}
              allowRelativePath={allowRelativePath}
              forceTouched={forceTouched}
            />
          )}

          {actionSlot}

          {(pendingFile
            ? hint ||
            "Staged in draft placeholder — click Save & Publish at the top to upload & apply sitewide."
            : hint) && (
              <p className="text-[11px] text-(--text-muted) leading-relaxed">
                {pendingFile
                  ? hint ||
                  "Staged in draft placeholder — click Save & Publish at the top to upload & apply sitewide."
                  : hint}
              </p>
            )}
        </div>
      </div>

      {localError && (
        <p role="alert" className="text-[11px] font-mono text-(--text-accent)">
          {localError}
        </p>
      )}

      <ImageCropModal
        open={Boolean(cropSession)}
        imageSrc={cropSession?.src || ""}
        originalFile={cropSession?.originalFile}
        initialTransform={cropSession?.initialTransform}
        defaultShape={previewShape}
        title={`Edit ${label}`}
        submitLabel="Save to Draft"
        loading={uploading}
        onClose={closeCropSession}
        onApplyTransform={handleApplyTransform}
      />

      <ConfirmModal
        open={confirmClearOpen}
        variant="danger"
        title={`Remove ${label}?`}
        description="This clears the uploaded image path from your draft. If this is your monogram logo, your portfolio and browser tab icon will fall back to your monogram initials until you Save & Publish."
        confirmLabel="Remove Image"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          setLocalError(null);
          onPendingFileChange?.(null);
          onTransformChange?.(createDefaultImageTransform(previewShape));
          onChange("");
          setConfirmClearOpen(false);
        }}
      />
    </div>
  );
}
