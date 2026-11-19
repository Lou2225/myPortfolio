"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileDown,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Magnetic } from "@/components/motion/Magnetic";
import { MonogramBadge } from "@/components/common/MonogramBadge";
import { cn } from "@/lib/utils";
import type { ImageTransform } from "@/types/portfolio";

export interface ResumeViewerModalProps {
  open: boolean;
  onClose: () => void;
  resumeUrl: string;
  fullName: string;
  headline: string;
  monogram: string;
  monogramImageUrl?: string;
  monogramTransform?: ImageTransform;
  onDownload?: () => void;
}

function resolveResumeTargets(rawUrl: string): {
  viewerSrc: string;
  downloadHref: string;
} {
  const trimmed = (rawUrl || "").trim();
  const driveMatch =
    /^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i.exec(trimmed) ||
    /^https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i.exec(trimmed);

  if (driveMatch?.[1]) {
    const fileId = driveMatch[1];
    return {
      viewerSrc: `https://drive.google.com/file/d/${fileId}/preview`,
      downloadHref: `https://drive.google.com/uc?export=download&id=${fileId}`,
    };
  }

  const versionTag = encodeURIComponent(trimmed);
  return {
    viewerSrc: `/api/resume?v=${versionTag}#toolbar=1&navpanes=0&view=FitH`,
    downloadHref: `/api/resume?download=1&v=${versionTag}`,
  };
}

function buildSafeFilename(fullName: string): string {
  const slug = (fullName || "Portfolio")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "Portfolio"}-Resume.pdf`;
}

/**
 * Architectural document skeleton shown while the PDF streams into the embedded reader.
 */
function ResumeDocumentSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading resume preview"
      className="absolute inset-0 z-20 bg-(--bg-canvas) p-4 sm:p-6 flex flex-col items-center gap-4 overflow-hidden"
    >
      {/* Mock PDF Reader Toolbar */}
      <div className="w-full max-w-4xl h-11 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) px-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Skeleton variant="rect" className="w-5 h-5 rounded-sm shrink-0" />
          <Skeleton variant="text" className="h-3.5 w-36 sm:w-52" />
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Skeleton variant="pill" className="h-6 w-14" />
          <Skeleton variant="pill" className="h-6 w-20" />
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-(--text-accent) shrink-0">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Loading PDF</span>
        </div>
      </div>

      {/* Mock A4 Resume Page */}
      <div className="w-full max-w-3xl flex-1 min-h-0 rounded-(--radius-card) bg-(--bg-surface) border border-(--border-subtle) p-6 sm:p-10 space-y-6 shadow-xl overflow-hidden">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-(--border-subtle)">
          <div className="flex items-center gap-4">
            <Skeleton variant="circle" className="w-14 h-14 shrink-0" />
            <div className="space-y-2">
              <Skeleton variant="text" className="h-5 w-48 sm:w-64" />
              <Skeleton variant="text" className="h-3.5 w-40 sm:w-52" />
              <Skeleton variant="text" className="h-3 w-32" />
            </div>
          </div>
          <Skeleton variant="rect" className="w-20 h-20 rounded-sm hidden sm:block shrink-0" />
        </div>

        {/* Section Banner */}
        <Skeleton variant="rect" className="h-6 w-full" />

        {/* Content Blocks */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton variant="text" className="h-4 w-44" />
            <Skeleton variant="text" className="h-3.5 w-full" />
            <Skeleton variant="text" className="h-3.5 w-11/12" />
            <Skeleton variant="text" className="h-3.5 w-4/5" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Skeleton variant="text" className="h-4 w-36" />
              <Skeleton variant="text" className="h-3 w-full" />
              <Skeleton variant="text" className="h-3 w-5/6" />
              <Skeleton variant="text" className="h-3 w-3/4" />
            </div>
            <div className="space-y-2">
              <Skeleton variant="text" className="h-4 w-36" />
              <Skeleton variant="text" className="h-3 w-full" />
              <Skeleton variant="text" className="h-3 w-11/12" />
              <Skeleton variant="text" className="h-3 w-2/3" />
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Skeleton variant="text" className="h-4 w-48" />
            <Skeleton variant="text" className="h-3.5 w-full" />
            <Skeleton variant="text" className="h-3.5 w-5/6" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * In-app Resume / CV modal viewer with fullscreen toggle and document skeleton
 * so visitors inspect and download the PDF inside the portfolio UI without leaving the tab.
 */
export function ResumeViewerModal({
  open,
  onClose,
  resumeUrl,
  fullName,
  headline,
  monogram,
  monogramImageUrl,
  monogramTransform,
  onDownload,
}: ResumeViewerModalProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { viewerSrc, downloadHref } = useMemo(
    () => resolveResumeTargets(resumeUrl),
    [resumeUrl]
  );

  const downloadFilename = useMemo(
    () => buildSafeFilename(fullName),
    [fullName]
  );

  const iframeLoaded = loadedSrc === viewerSrc;

  useEffect(() => {
    if (!open) {
      const id = requestAnimationFrame(() => {
        setLoadedSrc(null);
        setIsFullscreen(false);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      ariaLabelledBy="resume-viewer-title"
      backdropClassName={isFullscreen ? "p-0 z-145" : undefined}
      maxWidthClassName={isFullscreen ? "max-w-none" : "max-w-5xl"}
      panelClassName={
        isFullscreen
          ? "bg-(--bg-surface) rounded-none border-0 h-dvh max-h-dvh sm:max-h-dvh w-screen"
          : "bg-(--bg-surface)"
      }
    >
      <div
        className={cn(
          "flex flex-col overflow-hidden",
          isFullscreen ? "h-dvh max-h-dvh" : "h-[88dvh] max-h-[90dvh]"
        )}
      >
        {/* Modal Header */}
        <div className="px-3.5 sm:px-6 py-3 border-b border-(--border-subtle) flex items-center justify-between gap-2.5 sm:gap-3 bg-(--bg-surface) shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <MonogramBadge
              monogram={monogram}
              imageUrl={monogramImageUrl}
              transform={monogramTransform}
              alt={`${fullName} monogram`}
              className="w-[2.125rem] h-[2.125rem] sm:w-[2.25rem] sm:h-[2.25rem] rounded-full border border-(--border-strong) font-bold text-[0.75rem] tracking-wider shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[0.625rem] font-mono uppercase tracking-[0.18em] text-(--text-accent)">
                <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">CH // CV · Curriculum Vitae</span>
              </div>
              <h2
                id="resume-viewer-title"
                className="font-display text-[clamp(1rem,0.9rem+0.5vw,1.25rem)] uppercase tracking-tight text-(--text-primary) truncate leading-tight"
              >
                {fullName} — Resume
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Magnetic strength={0.18}>
              <a
                href={downloadHref}
                download={downloadFilename}
                onClick={onDownload}
                className="btn-primary bg-brand-solid text-brand-contrast hover:bg-brand-solid-hover hover:shadow-[0_6px_24px_var(--accent-glow)] active:scale-[0.98] rounded-full h-[2.125rem] px-3 sm:px-4 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand whitespace-nowrap"
              >
                <FileDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden min-[440px]:inline">Download PDF</span>
                <span className="min-[440px]:hidden">PDF</span>
              </a>
            </Magnetic>

            <Button
              type="button"
              variant="outline"
              size="icon"
              shape="pill"
              onClick={() => setIsFullscreen((prev) => !prev)}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-(--text-accent)" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              shape="pill"
              onClick={onClose}
              aria-label="Close resume viewer"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Embedded Document Frame + Skeleton Overlay */}
        <div className="relative flex-1 min-h-0 bg-(--bg-canvas)">
          {!iframeLoaded && <ResumeDocumentSkeleton />}

          {open && resumeUrl && (
            <iframe
              key={viewerSrc}
              title={`${fullName} Resume PDF`}
              src={viewerSrc}
              onLoad={() => setLoadedSrc(viewerSrc)}
              className={cn(
                "relative z-10 w-full h-full border-0 bg-white transition-opacity duration-200",
                iframeLoaded ? "opacity-100" : "opacity-0"
              )}
            />
          )}
        </div>

        {/* Compact Footer Strip */}
        <div className="px-3.5 sm:px-6 py-2.5 border-t border-(--border-subtle) bg-(--bg-surface) flex items-center justify-between gap-2 text-[0.6875rem] font-mono text-(--text-muted) shrink-0">
          <span className="truncate">{headline}</span>
          <a
            href={downloadHref}
            download={downloadFilename}
            onClick={onDownload}
            className="text-(--text-accent) hover:underline shrink-0"
          >
            Direct PDF Download ↓
          </a>
        </div>
      </div>
    </ModalShell>
  );
}
