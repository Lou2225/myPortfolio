"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Crop,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ImageAspectPreset, ImageTransform } from "@/types/portfolio";
import {
  ImageEditorShape,
  computeImageStageMatrix,
  createDefaultImageTransform,
  defaultAspectForShape,
  defaultFitForShape,
  isIdentityImageTransform,
  sanitizeImageTransform,
} from "@/lib/imageTransform";
import { ModalShell } from "@/components/ui/ModalShell";
import { cn } from "@/lib/utils";

export interface ImageCropModalProps {
  open: boolean;
  imageSrc: string;
  originalFile?: File | null;
  initialTransform?: ImageTransform | null;
  defaultShape?: ImageEditorShape;
  title?: string;
  submitLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onApplyTransform: (payload: {
    transform: ImageTransform;
    originalFile: File | null;
  }) => Promise<void> | void;
}

const ASPECT_OPTIONS: { id: ImageAspectPreset; label: string }[] = [
  { id: "1:1", label: "1:1" },
  { id: "3:4", label: "3:4" },
  { id: "4:3", label: "4:3" },
  { id: "16:9", label: "16:9" },
  { id: "original", label: "Original" },
];

const MAX_STAGE_DIM = 248;

function computeCropFrameSize(
  aspect: ImageAspectPreset,
  natW: number,
  natH: number,
  rotation: number
): { width: number; height: number } {
  const effW = rotation % 180 === 0 ? natW : natH;
  const effH = rotation % 180 === 0 ? natH : natW;

  let ratio = 1;
  switch (aspect) {
    case "1:1":
      ratio = 1;
      break;
    case "3:4":
      ratio = 3 / 4;
      break;
    case "4:3":
      ratio = 4 / 3;
      break;
    case "16:9":
      ratio = 16 / 9;
      break;
    case "original":
      ratio = effW > 0 && effH > 0 ? effW / effH : 1;
      break;
  }

  if (ratio >= 1) {
    return {
      width: MAX_STAGE_DIM,
      height: Math.max(112, Math.round(MAX_STAGE_DIM / ratio)),
    };
  }
  return {
    width: Math.max(112, Math.round(MAX_STAGE_DIM * ratio)),
    height: MAX_STAGE_DIM,
  };
}

const CONTROL_PILL_CLASS =
  "h-8 w-full px-2 rounded-sm text-[11px] font-mono border inline-flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

/**
 * Compact 2-column non-destructive resize, zoom, pan & rotation editor.
 * Preserves the original image untouched and updates only transform framing
 * on the form placeholder until Save & Publish commits changes live.
 */
export function ImageCropModal({
  open,
  imageSrc,
  originalFile = null,
  initialTransform = null,
  defaultShape = "squircle",
  title = "Resize & Frame Image",
  submitLabel = "Save to Draft",
  loading = false,
  onClose,
  onApplyTransform,
}: ImageCropModalProps) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originXPercent: number;
    originYPercent: number;
  } | null>(null);

  const [natSize, setNatSize] = useState<{ src: string; w: number; h: number }>({
    src: "",
    w: 0,
    h: 0,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetPercent, setOffsetPercent] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [rotation, setRotation] = useState(0);
  const [fit, setFit] = useState<"cover" | "contain">(() =>
    defaultFitForShape(defaultShape)
  );
  const [aspect, setAspect] = useState<ImageAspectPreset>(() =>
    defaultAspectForShape(defaultShape)
  );
  const [clipCircle, setClipCircle] = useState(defaultShape === "circle");
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (!open) return;
    const rafId = requestAnimationFrame(() => {
      const seed = sanitizeImageTransform(initialTransform, defaultShape);
      setZoom(seed.zoom);
      setOffsetPercent({ x: seed.offsetXPercent, y: seed.offsetYPercent });
      setRotation(seed.rotation);
      setFit(seed.fit);
      setAspect(seed.aspect);
      setClipCircle(seed.clipCircle);
      setLoadError(null);
    });
    return () => cancelAnimationFrame(rafId);
  }, [open, imageSrc, initialTransform, defaultShape]);

  const revertToOriginal = useCallback(() => {
    const def = createDefaultImageTransform(defaultShape);
    setZoom(def.zoom);
    setOffsetPercent({ x: def.offsetXPercent, y: def.offsetYPercent });
    setRotation(def.rotation);
    setFit(def.fit);
    setAspect(def.aspect);
    setClipCircle(def.clipCircle);
  }, [defaultShape]);

  const handleImageElementRef = useCallback(
    (node: HTMLImageElement | null) => {
      if (
        node &&
        imageSrc &&
        node.complete &&
        node.naturalWidth > 0 &&
        node.naturalHeight > 0
      ) {
        setNatSize((prev) =>
          prev.src === imageSrc &&
          prev.w === node.naturalWidth &&
          prev.h === node.naturalHeight
            ? prev
            : { src: imageSrc, w: node.naturalWidth, h: node.naturalHeight }
        );
      }
    },
    [imageSrc]
  );

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    setNatSize({
      src: imageSrc,
      w: target.naturalWidth || 512,
      h: target.naturalHeight || 512,
    });
    setLoadError(null);
  };

  const activeNat =
    natSize.src === imageSrc && natSize.w > 0
      ? natSize
      : { w: 0, h: 0 };

  const cropFrame = computeCropFrameSize(
    aspect,
    activeNat.w,
    activeNat.h,
    rotation
  );

  const currentTransform: ImageTransform = sanitizeImageTransform(
    {
      zoom,
      offsetXPercent: offsetPercent.x,
      offsetYPercent: offsetPercent.y,
      rotation,
      fit,
      aspect,
      clipCircle,
    },
    defaultShape
  );

  const matrix = computeImageStageMatrix({
    containerWidth: cropFrame.width,
    containerHeight: cropFrame.height,
    naturalWidth: activeNat.w,
    naturalHeight: activeNat.h,
    transform: currentTransform,
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeNat.w === 0 || loadError || loading || savingDraft) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originXPercent: offsetPercent.x,
      originYPercent: offsetPercent.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dxPct = ((e.clientX - drag.startX) / cropFrame.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / cropFrame.height) * 100;
    setOffsetPercent({
      x: Number(
        Math.min(120, Math.max(-120, drag.originXPercent + dxPct)).toFixed(2)
      ),
      y: Number(
        Math.min(120, Math.max(-120, drag.originYPercent + dyPct)).toFixed(2)
      ),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (activeNat.w === 0 || loadError) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((prev) =>
      Number(Math.min(3, Math.max(0.4, prev + delta)).toFixed(2))
    );
  };

  const handleApplyToDraft = async () => {
    if (activeNat.w === 0) return;
    setSavingDraft(true);
    try {
      await onApplyTransform({
        transform: currentTransform,
        originalFile,
      });
    } finally {
      setSavingDraft(false);
    }
  };

  const isBusy = loading || savingDraft;
  const isAtOriginal = isIdentityImageTransform(currentTransform, defaultShape);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeDisabled={isBusy}
      ariaLabelledBy="image-crop-modal-title"
      maxWidthClassName="max-w-3xl"
    >
      {/* Compact Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-(--border-subtle) flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-(--radius-control) bg-brand/12 border border-brand/35 flex items-center justify-center shrink-0">
            <Crop className="w-4 h-4 text-(--text-accent)" />
          </span>
          <div className="min-w-0">
            <h3
              id="image-crop-modal-title"
              className="font-display text-lg uppercase tracking-tight text-(--text-primary) truncate"
            >
              {title}
            </h3>
            <p className="text-[11px] font-mono text-(--text-muted) truncate">
              Drag to reposition · Scroll or slide to resize
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          aria-label="Close image editor"
          className="h-8 w-8 rounded-sm text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-surface-2) inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2-Column Compact Landscape Body */}
      <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-[264px_1fr] gap-4 sm:gap-5 items-center flex-1 min-h-0 overflow-y-auto lou-scrollarea">
        {/* Left: Non-Destructive Live Stage */}
        <div className="flex flex-col items-center justify-center bg-(--bg-surface-2) border border-(--border-subtle) rounded-lg p-3 shrink-0">
          <div className="w-62 h-62 max-w-full flex items-center justify-center">
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              style={{
                width: cropFrame.width,
                height: cropFrame.height,
                backgroundImage:
                  "linear-gradient(45deg, rgba(128,128,128,0.12) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.12) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.12) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.12) 75%)",
                backgroundSize: "14px 14px",
                backgroundPosition: "0 0, 0 7px, 7px -7px, -7px 0px",
              }}
              className={cn(
                "relative overflow-hidden border-2 border-brand/80 shadow-inner select-none touch-none cursor-grab active:cursor-grabbing",
                clipCircle && aspect === "1:1" ? "rounded-full" : "rounded-md"
              )}
            >
              {imageSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={imageSrc}
                  ref={handleImageElementRef}
                  src={imageSrc}
                  alt="Non-destructive resize target"
                  onLoad={handleImageLoad}
                  onError={() =>
                    setLoadError(
                      "Unable to load this image URL. Check that the path is valid or upload a local file."
                    )
                  }
                  draggable={false}
                  style={{
                    width: activeNat.w || undefined,
                    height: activeNat.h || undefined,
                    maxWidth: "none",
                    maxHeight: "none",
                    transform: `translate(-50%, -50%) translate3d(${matrix.translateX}px, ${matrix.translateY}px, 0) rotate(${matrix.rotationDeg}deg) scale(${matrix.scale})`,
                  }}
                  className={cn(
                    "absolute left-1/2 top-1/2 pointer-events-none select-none will-change-transform",
                    activeNat.w === 0 && "opacity-0"
                  )}
                />
              )}

              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 border border-white/20"
              >
                <div className="absolute inset-x-0 top-1/3 border-t border-white/15" />
                <div className="absolute inset-x-0 top-2/3 border-t border-white/15" />
                <div className="absolute inset-y-0 left-1/3 border-l border-white/15" />
                <div className="absolute inset-y-0 left-2/3 border-l border-white/15" />
              </div>

              {activeNat.w === 0 && !loadError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-(--text-accent)" />
                </div>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-mono text-(--text-muted)">
            {activeNat.w > 0 && (
              <span>
                Source {activeNat.w}×{activeNat.h}
              </span>
            )}
            <span>·</span>
            <span className="text-(--text-accent)">
              {Math.round(zoom * 100)}% ({fit === "contain" ? "Fit" : "Fill"})
            </span>
          </div>
        </div>

        {/* Right: Uniform Configuration Panel */}
        <div className="space-y-4 min-w-0">
          {loadError && (
            <p
              role="alert"
              className="text-xs font-mono text-(--text-accent) bg-brand/10 border border-brand/30 rounded-(--radius-control) px-3 py-2"
            >
              {loadError}
            </p>
          )}

          {/* Zoom Slider & Quick Transform Toolbar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.16em] text-(--text-muted)">
              <span>Zoom / Resize Scale</span>
              <span className="text-(--text-primary) font-semibold tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Number(Math.max(0.4, z - 0.1).toFixed(2)))
                }
                aria-label="Zoom out"
                className="h-8 w-8 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) text-(--text-muted) hover:text-(--text-primary) inline-flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <input
                type="range"
                min={0.4}
                max={3}
                step={0.02}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                aria-label="Image zoom level"
                className="flex-1 accent-brand cursor-pointer"
              />

              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Number(Math.min(3, z + 0.1).toFixed(2)))
                }
                aria-label="Zoom in"
                className="h-8 w-8 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) text-(--text-muted) hover:text-(--text-primary) inline-flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setFit("contain");
                  setZoom(1);
                  setOffsetPercent({ x: 0, y: 0 });
                }}
                disabled={activeNat.w === 0 || isBusy}
                className={cn(
                  CONTROL_PILL_CLASS,
                  fit === "contain"
                    ? "bg-brand/15 border-brand text-(--text-accent) font-semibold"
                    : "bg-(--bg-surface-2) hover:bg-(--bg-badge-highlight) border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary)"
                )}
              >
                <Minimize2 className="w-3 h-3 shrink-0" />
                <span>Fit</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFit("cover");
                  setZoom(1);
                  setOffsetPercent({ x: 0, y: 0 });
                }}
                disabled={activeNat.w === 0 || isBusy}
                className={cn(
                  CONTROL_PILL_CLASS,
                  fit === "cover"
                    ? "bg-brand/15 border-brand text-(--text-accent) font-semibold"
                    : "bg-(--bg-surface-2) hover:bg-(--bg-badge-highlight) border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary)"
                )}
              >
                <Maximize2 className="w-3 h-3 shrink-0" />
                <span>Fill</span>
              </button>

              <button
                type="button"
                onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                disabled={activeNat.w === 0 || isBusy}
                aria-label="Rotate left 90 degrees"
                title="Rotate left 90°"
                className={cn(
                  CONTROL_PILL_CLASS,
                  "bg-(--bg-surface-2) hover:bg-(--bg-badge-highlight) border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary)"
                )}
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                disabled={activeNat.w === 0 || isBusy}
                aria-label="Rotate right 90 degrees"
                title="Rotate right 90°"
                className={cn(
                  CONTROL_PILL_CLASS,
                  "bg-(--bg-surface-2) hover:bg-(--bg-badge-highlight) border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary)"
                )}
              >
                <RotateCw className="w-3.5 h-3.5 shrink-0" />
              </button>

              <button
                type="button"
                onClick={revertToOriginal}
                disabled={activeNat.w === 0 || isBusy || isAtOriginal}
                title="Revert resize, zoom, pan and rotation back to original"
                className={cn(
                  CONTROL_PILL_CLASS,
                  "bg-(--bg-surface-2) hover:border-brand/50 border-(--border-subtle) text-(--text-secondary) hover:text-(--text-accent)"
                )}
              >
                <span>Original</span>
              </button>
            </div>
          </div>

          {/* Frame Aspect Ratio Preview */}
          <div className="space-y-1.5 pt-2 border-t border-(--border-subtle)">
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-(--text-muted) block">
              Frame Aspect Preview
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setAspect(opt.id);
                    setOffsetPercent({ x: 0, y: 0 });
                    if (opt.id !== "1:1") {
                      setClipCircle(false);
                    }
                  }}
                  className={cn(
                    CONTROL_PILL_CLASS,
                    aspect === opt.id
                      ? "bg-brand/15 border-brand text-(--text-accent) font-semibold"
                      : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary)"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stable-Height Circle Mask Option */}
          <div className="h-9 px-3 rounded-sm bg-(--bg-surface-2)/60 border border-(--border-subtle) flex items-center">
            {aspect === "1:1" ? (
              <label className="flex items-center gap-2 text-xs text-(--text-secondary) cursor-pointer select-none w-full">
                <input
                  type="checkbox"
                  checked={clipCircle}
                  onChange={(e) => setClipCircle(e.target.checked)}
                  className="accent-brand w-4 h-4 rounded cursor-pointer shrink-0"
                />
                <span className="truncate">
                  Mask frame as circular badge &amp; browser favicon
                </span>
              </label>
            ) : (
              <span className="text-[11px] font-mono text-(--text-muted) truncate">
                Switch to 1:1 frame aspect to enable circular badge masking.
              </span>
            )}
          </div>

          {/* Non-Destructive Draft Notice */}
          <div className="px-3 py-2 rounded-(--radius-control) bg-brand/8 border border-brand/25 text-[11px] font-mono text-(--text-secondary)">
            Original pixels are never overwritten — you can revert anytime. Changes preview in the placeholder until you click <strong className="text-(--text-primary)">Save &amp; Publish</strong>.
          </div>
        </div>
      </div>

      {/* Consistent Footer Buttons */}
      <div className="px-4 sm:px-5 py-3 bg-(--bg-surface-2) border-t border-(--border-subtle) flex flex-wrap items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={revertToOriginal}
          disabled={isBusy || activeNat.w === 0 || isAtOriginal}
          className="h-9.5 px-4 rounded-(--radius-control) border border-(--border-strong) bg-(--bg-surface) hover:bg-(--bg-badge-highlight) text-xs font-mono uppercase tracking-wider text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3.5 h-3.5 text-(--text-accent)" />
          <span>Revert to Original</span>
        </button>

        <div className="flex items-center gap-2.5 ml-auto">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="h-9.5 px-4 rounded-(--radius-control) border border-(--border-strong) bg-(--bg-surface) hover:bg-(--bg-badge-highlight) text-xs font-mono uppercase tracking-wider text-(--text-primary) transition-colors cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void handleApplyToDraft()}
            disabled={isBusy || activeNat.w === 0 || Boolean(loadError)}
            className="h-9.5 px-5 rounded-(--radius-control) bg-brand hover:bg-brand-hover text-brand-contrast text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>{isBusy ? "Applying..." : submitLabel}</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
