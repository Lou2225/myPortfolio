"use client";

import React from "react";
import Image from "next/image";
import { VaultCategory, VaultDocument } from "@/types/vault";
import { StatusPill } from "@/components/ui/StatusPill";
import { IconActionButton } from "@/components/ui/ActionButtons";
import {
  Briefcase,
  Download,
  Edit2,
  Eye,
  FileArchive,
  FileText,
  GraduationCap,
  Landmark,
  Lock,
  Pin,
  Scale,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface VaultDocumentCardProps {
  document: VaultDocument;
  onPreview: (doc: VaultDocument) => void;
  onEdit: (doc: VaultDocument) => void;
  onTogglePin: (doc: VaultDocument) => void;
  onDelete: (doc: VaultDocument) => void;
  formatBytes: (bytes: number) => string;
}

export function getCategoryVariant(cat: VaultCategory) {
  switch (cat) {
    case "academic":
      return "warning" as const;
    case "government":
      return "danger" as const;
    case "career":
      return "accent" as const;
    case "legal":
      return "solid" as const;
    case "personal":
    default:
      return "neutral" as const;
  }
}

export function getCategoryIcon(cat: VaultCategory, className = "w-3.5 h-3.5") {
  switch (cat) {
    case "academic":
      return <GraduationCap className={className} aria-hidden="true" />;
    case "government":
      return <Landmark className={className} aria-hidden="true" />;
    case "career":
      return <Briefcase className={className} aria-hidden="true" />;
    case "legal":
      return <Scale className={className} aria-hidden="true" />;
    case "personal":
    default:
      return <Lock className={className} aria-hidden="true" />;
  }
}

export function VaultDocumentCard({
  document,
  onPreview,
  onEdit,
  onTogglePin,
  onDelete,
  formatBytes,
}: VaultDocumentCardProps) {
  const docFilename =
    document.originalFilename ?? document.originalFileName ?? "";
  const isPdf =
    document.fileType === "pdf" ||
    document.mimeType.startsWith("application/pdf") ||
    docFilename.toLowerCase().endsWith(".pdf");
  const isImage =
    document.fileType === "image" || document.mimeType.startsWith("image/");

  return (
    <article className="group relative flex flex-col justify-between bg-(--bg-surface) border border-(--border-subtle) hover:border-(--border-strong) rounded-(--radius-card) overflow-hidden shadow-xs hover:shadow-md transition-all duration-300">
      {/* 16:10 Thumbnail Preview Area */}
      <div
        onClick={() => onPreview(document)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPreview(document);
          }
        }}
        aria-label={`Preview ${document.title}`}
        className="relative aspect-16/10 w-full bg-(--bg-surface-2) border-b border-(--border-subtle) cursor-pointer overflow-hidden flex items-center justify-center select-none"
      >
        {isImage ? (
          <Image
            src={`/api/admin/vault/file/${document.id}`}
            alt={document.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <span className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/25 flex items-center justify-center text-(--text-accent) mb-2 transition-transform duration-300 group-hover:scale-110">
              {isPdf ? (
                <FileText className="w-6 h-6" />
              ) : (
                <FileArchive className="w-6 h-6" />
              )}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted)">
              {isPdf ? "PDF Document" : document.mimeType || "Binary File"}
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 pointer-events-none">
          <StatusPill
            label={document.category}
            variant={getCategoryVariant(document.category)}
            size="xs"
          />
          {document.pinned && (
            <span className="p-1 rounded-(--radius-control) bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-xs">
              <Pin className="w-3 h-3 text-amber-400 fill-current" />
            </span>
          )}
        </div>

        {/* Hover Inspect Sheen Overlay */}
        <div className="absolute inset-0 bg-(--bg-canvas)/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-(--radius-control) bg-brand text-brand-contrast font-mono text-[11px] font-semibold uppercase tracking-wider shadow-lg">
            <Eye className="w-3.5 h-3.5" /> Preview
          </span>
        </div>
      </div>

      {/* Details & Metadata */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-(--text-muted) font-mono">
            <span>
              {formatBytes(document.fileSize ?? document.fileSizeBytes ?? 0)}
            </span>
            <span>{new Date(document.uploadedAt).toLocaleDateString()}</span>
          </div>

          <h4
            onClick={() => onPreview(document)}
            className="text-sm font-semibold text-(--text-primary) line-clamp-2 leading-snug cursor-pointer hover:text-(--text-accent) transition-colors"
          >
            {document.title}
          </h4>

          <p className="text-[11px] text-(--text-muted) truncate font-mono">
            {docFilename}
          </p>

          {document.tags && document.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {document.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-(--bg-surface-2) border border-(--border-subtle) text-(--text-muted)"
                >
                  #{tag}
                </span>
              ))}
              {document.tags.length > 3 && (
                <span className="text-[10px] font-mono text-(--text-muted)">
                  +{document.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer Action Icons */}
        <div className="pt-2.5 border-t border-(--border-subtle) flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <IconActionButton
              label={document.pinned ? "Unpin Document" : "Pin Document"}
              size="compact"
              onClick={() => onTogglePin(document)}
              className={
                document.pinned
                  ? "border-amber-400/50 bg-amber-500/10 text-amber-400"
                  : undefined
              }
              icon={
                <Pin
                  className={cn(
                    "w-3.5 h-3.5",
                    document.pinned && "fill-current"
                  )}
                />
              }
            />

            <IconActionButton
              label="Edit Info"
              size="compact"
              onClick={() => onEdit(document)}
              icon={<Edit2 className="w-3.5 h-3.5" />}
            />

            <a
              href={`/api/admin/vault/file/${document.id}?download=true`}
              download={docFilename || "document"}
              className="h-8.5 w-8.5 rounded-full inline-flex items-center justify-center bg-(--bg-surface-2) hover:bg-(--bg-badge-highlight) border border-(--border-strong) hover:border-brand text-(--text-muted) hover:text-(--text-accent) transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              title="Download Document"
              aria-label="Download Document"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          </div>

          <IconActionButton
            label="Delete from Vault"
            size="compact"
            intent="danger"
            onClick={() => onDelete(document)}
            icon={<Trash2 className="w-3.5 h-3.5" />}
          />
        </div>
      </div>
    </article>
  );
}
