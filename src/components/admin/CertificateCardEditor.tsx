"use client";

import React from "react";
import { Certificate } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import { IconActionButton } from "@/components/ui/ActionButtons";
import {
  ActionMenuButton,
  buildReorderMenuItems,
} from "@/components/ui/ActionMenuButton";
import { TransformedImage } from "@/components/ui/TransformedImage";
import { StatusPill } from "@/components/ui/StatusPill";
import { useInstantImageUrl } from "@/lib/instantImageCache";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Star,
} from "lucide-react";

export interface CertificateCardEditorProps {
  certificate: Certificate;
  index: number;
  totalCount: number;
  errors?: string[];
  isDirty?: boolean;
  pendingFile: File | null;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onTogglePublished: () => void;
  onToggleFeatured: () => void;
}

/**
 * Certificate Summary Card inside the Certificates CMS Hub.
 * Matches `ProjectCardEditor` layout and design system tokens identically.
 */
export function CertificateCardEditor({
  certificate,
  index,
  totalCount,
  errors = [],
  isDirty = false,
  pendingFile,
  onEdit,
  onMoveUp,
  onMoveDown,
  onDelete,
  onTogglePublished,
  onToggleFeatured,
}: CertificateCardEditorProps) {
  const isPublished = certificate.published !== false;
  const thumbSrc = useInstantImageUrl(certificate.thumbnailUrl || certificate.fileUrl);
  const isPdf =
    certificate.fileType === "pdf" ||
    certificate.fileUrl.toLowerCase().endsWith(".pdf");

  const getCategoryVariant = (cat: Certificate["category"]) => {
    switch (cat) {
      case "academic":
        return "warning" as const;
      case "analytics":
        return "accent" as const;
      case "fullstack":
        return "solid" as const;
      case "industry":
      default:
        return "success" as const;
    }
  };

  return (
    <article
      className={cn(
        "bg-(--bg-surface) border rounded-(--radius-card) overflow-hidden transition-all shadow-sm hover:border-(--border-strong)",
        errors.length > 0
          ? "border-brand/60"
          : isPublished
          ? "border-(--border-subtle)"
          : "border-(--border-subtle) opacity-85"
      )}
    >
      <div className="p-3.5 sm:px-5 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-3 sm:gap-3.5 text-left min-w-0 flex-1 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-(--radius-control)"
        >
          {/* Compact 16:10 Preview Thumbnail */}
          <div
            className={cn(
              "w-20 aspect-16/10 sm:w-22 rounded-(--radius-control) overflow-hidden border bg-(--bg-surface-2) shrink-0 flex items-center justify-center relative",
              pendingFile || isDirty
                ? "border-amber-400/70"
                : "border-(--border-strong)"
            )}
          >
            {thumbSrc && !isPdf ? (
              <TransformedImage
                src={thumbSrc}
                alt={certificate.title || "Certificate preview"}
                defaultFit="cover"
                className="w-full h-full"
              />
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full text-(--text-muted) bg-brand/5">
                <FileText className="w-5 h-5 text-(--text-accent)" aria-hidden="true" />
              </div>
            )}
            {pendingFile && (
              <span
                title="File staged in draft"
                className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400 shadow"
              />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span className="text-(--text-accent) font-semibold tabular-nums">
                #{String(index + 1).padStart(2, "0")}
              </span>
              <StatusPill
                label={certificate.category}
                variant={getCategoryVariant(certificate.category)}
                size="xs"
              />
              {certificate.featured && (
                <span className="text-(--text-accent) uppercase tracking-wider text-[10px]">
                  · Featured
                </span>
              )}
              {pendingFile && (
                <span className="text-cyan-400 uppercase tracking-wider text-[10px]">
                  · File Staged
                </span>
              )}
              {errors.length > 0 && (
                <span className="text-rose-400 uppercase tracking-wider text-[10px]">
                  · {errors.length} {errors.length === 1 ? "Issue" : "Issues"}
                </span>
              )}
            </div>

            <h3 className="font-display text-lg sm:text-xl lg:text-2xl uppercase tracking-tight leading-[1.12] text-(--text-primary) group-hover:text-(--text-accent) transition-colors line-clamp-2 sm:truncate">
              {certificate.title || "Untitled Credential"}
            </h3>

            <p className="text-[11px] font-mono text-(--text-muted) leading-snug whitespace-normal sm:truncate">
              {certificate.issuer || "Issuing Body"} · {certificate.issueDate || "Date"}
              {certificate.credentialId ? ` · ID: ${certificate.credentialId}` : ""}
            </p>
          </div>
        </button>

        {/* Card Action Bar */}
        <div className="flex items-center justify-between lg:justify-end gap-2 pt-2.5 border-t border-(--border-subtle)/60 lg:border-t-0 lg:pt-0 shrink-0 w-full lg:w-auto">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={isPublished ? "secondary" : "outline"}
              size="sm"
              onClick={onTogglePublished}
              className={cn(
                "h-9 px-3 font-mono text-[11px]",
                isPublished
                  ? "border-emerald-500/35 bg-emerald-500/10 text-(--text-success) hover:text-(--text-success) hover:border-emerald-500/60"
                  : "text-(--text-muted)"
              )}
              aria-label={
                isPublished
                  ? `Set ${certificate.title} to Draft`
                  : `Publish ${certificate.title} Live`
              }
            >
              {isPublished ? (
                <>
                  <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Live</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Draft</span>
                </>
              )}
            </Button>

            <IconActionButton
              label={
                certificate.featured
                  ? `Unmark ${certificate.title || "credential"} as featured`
                  : `Mark ${certificate.title || "credential"} as featured`
              }
              size="compact"
              onClick={onToggleFeatured}
              className={
                certificate.featured
                  ? "border-brand/55 bg-(--bg-badge-highlight) text-(--text-accent)"
                  : undefined
              }
              icon={
                <Star
                  className={cn(
                    "w-3.5 h-3.5",
                    certificate.featured && "fill-current"
                  )}
                  aria-hidden="true"
                />
              }
            />
          </div>

          <div className="flex items-center gap-1.5">
            <ActionMenuButton
              label={`Actions for certificate ${index + 1}`}
              size="compact"
              items={buildReorderMenuItems({
                index,
                total: totalCount,
                onMoveUp,
                onMoveDown,
                removeLabel: "Delete Credential",
                canRemove: totalCount > 1,
                onRemove: onDelete,
              })}
            />

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onEdit}
              aria-label={`Edit ${certificate.title || `certificate ${index + 1}`}`}
              className="h-9 pl-3.5 pr-2.5 gap-1 font-mono text-[11px] leading-none border-(--border-strong)"
            >
              <span>Edit</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
