"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { VaultDocument } from "@/types/vault";
import { ModalShell } from "@/components/ui/ModalShell";
import { StatusPill } from "@/components/ui/StatusPill";
import { PdfDocumentCanvas } from "@/components/common/PdfDocumentCanvas";
import {
  Download,
  FileArchive,
  FileText,
  HardDrive,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export interface VaultViewerModalProps {
  document: VaultDocument | null;
  open: boolean;
  onClose: () => void;
}

const MIN_ZOOM = 60;
const MAX_ZOOM = 200;
const ZOOM_STEP = 20;

export function VaultViewerModal({
  document,
  open,
  onClose,
}: VaultViewerModalProps) {
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!document) return null;

  const fileStreamUrl = `/api/admin/vault/file/${document.id}`;
  const downloadUrl = `/api/admin/vault/file/${document.id}?download=true`;

  const originalName = document.originalFilename || document.originalFileName || "document";
  const fileSizeNum = document.fileSize ?? document.fileSizeBytes ?? 0;

  const isPdf =
    document.fileType === "pdf" ||
    document.mimeType === "application/pdf" ||
    originalName.toLowerCase().endsWith(".pdf");

  const isImage =
    document.fileType === "image" ||
    document.mimeType.startsWith("image/");

  const isArchive =
    document.fileType === "archive" ||
    document.mimeType.includes("zip") ||
    document.mimeType.includes("compressed");

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getCategoryVariant = (cat: VaultDocument["category"]) => {
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
  };

  const handleZoom = (delta: number) => {
    setZoomPercent((prev) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta))
    );
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClassName={
        isFullscreen ? "max-w-[98vw] w-[98vw] h-[96vh]" : "max-w-5xl"
      }
      ariaLabelledBy="vault-viewer-title"
    >
      <div className="flex flex-col h-[85vh] max-h-[92vh] bg-(--bg-surface) rounded-(--radius-card) border border-(--border-subtle) shadow-2xl overflow-hidden">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-(--border-subtle) bg-(--bg-surface-2) shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-full bg-brand/15 border border-brand/35 flex items-center justify-center text-(--text-accent) shrink-0">
              <HardDrive className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusPill
                  label={document.category}
                  variant={getCategoryVariant(document.category)}
                  size="xs"
                />
                <span className="text-[11px] font-mono text-(--text-muted) truncate">
                  {formatBytes(fileSizeNum)} · {document.mimeType}
                </span>
              </div>
              <h3
                id="vault-viewer-title"
                className="text-sm sm:text-base font-semibold text-(--text-primary) truncate mt-0.5"
              >
                {document.title}
              </h3>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isPdf && (
              <div className="hidden sm:flex items-center gap-1 mr-2 px-2 py-1 bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control)">
                <button
                  type="button"
                  onClick={() => handleZoom(-ZOOM_STEP)}
                  disabled={zoomPercent <= MIN_ZOOM}
                  className="w-6 h-6 flex items-center justify-center text-(--text-muted) hover:text-(--text-primary) disabled:opacity-40"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono w-10 text-center text-(--text-primary)">
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={() => handleZoom(ZOOM_STEP)}
                  disabled={zoomPercent >= MAX_ZOOM}
                  className="w-6 h-6 flex items-center justify-center text-(--text-muted) hover:text-(--text-primary) disabled:opacity-40"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <a
              href={downloadUrl}
              download={originalName}
              className="inline-flex items-center h-8 px-2.5 text-xs gap-1.5 text-(--text-primary) border border-(--border-subtle) rounded-(--radius-control) bg-(--bg-surface) hover:border-(--border-strong) transition-colors"
              aria-label="Download document"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>

            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-surface) transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-surface) transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto bg-(--bg-canvas) relative p-4 flex items-center justify-center"
        >
          {isPdf ? (
            <div className="w-full h-full flex flex-col items-center">
              <PdfDocumentCanvas
                open={open}
                pdfUrl={fileStreamUrl}
                fullName={document.title}
                zoomPercent={zoomPercent}
                isFullscreen={isFullscreen}
                scrollContainerRef={scrollContainerRef}
                onDocumentLoaded={(info) => {
                  setTotalPages(info.numPages);
                }}
                onFirstPageRendered={() => {}}
                onActivePageChange={setActivePage}
                onLoadError={() => {}}
              />
            </div>
          ) : isImage ? (
            <div className="relative max-w-full max-h-full flex items-center justify-center">
              {/* Image viewer with subtle border and responsive container */}
              <div className="relative max-h-[70vh] max-w-4xl rounded-lg overflow-hidden border border-(--border-subtle) shadow-2xl">
                <Image
                  src={fileStreamUrl}
                  alt={document.title}
                  width={1600}
                  height={1200}
                  className="object-contain max-h-[70vh] w-auto h-auto"
                  unoptimized
                />
              </div>
            </div>
          ) : (
            <div className="max-w-md w-full p-8 text-center bg-(--bg-surface) rounded-(--radius-card) border border-(--border-subtle) shadow-xl space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/25 mx-auto flex items-center justify-center text-(--text-accent)">
                {isArchive ? (
                  <FileArchive className="w-8 h-8" />
                ) : (
                  <FileText className="w-8 h-8" />
                )}
              </div>
              <div>
                <h4 className="text-base font-semibold text-(--text-primary)">
                  {document.title}
                </h4>
                <p className="text-xs text-(--text-muted) font-mono mt-1">
                  {originalName} ({formatBytes(fileSizeNum)})
                </p>
              </div>

              {document.notes && (
                <div className="p-3 bg-(--bg-surface-2) rounded-(--radius-control) text-xs text-(--text-secondary) text-left">
                  <span className="font-semibold text-(--text-primary) block mb-0.5 font-mono text-[10px] uppercase">
                    Document Notes:
                  </span>
                  {document.notes}
                </div>
              )}

              {document.tags && document.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center">
                  {document.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-(--bg-surface-2) border border-(--border-subtle) text-(--text-muted)"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              <a
                href={downloadUrl}
                download={originalName}
                className="inline-flex items-center justify-center w-full gap-2 text-xs h-10 px-4 font-semibold rounded-(--radius-control) bg-brand text-brand-contrast hover:brightness-110 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download Secure Copy</span>
              </a>
            </div>
          )}
        </div>

        {/* Footer Info Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-(--border-subtle) bg-(--bg-surface-2) text-xs text-(--text-muted) shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="font-mono text-[11px] truncate">
              Original: {originalName}
            </span>
            {isPdf && totalPages > 1 && (
              <span className="font-mono text-[11px] text-(--text-primary)">
                · Page {activePage} of {totalPages}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono">
              Uploaded {new Date(document.uploadedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
