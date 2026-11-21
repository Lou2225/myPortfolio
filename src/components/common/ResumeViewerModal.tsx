"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Magnetic } from "@/components/motion/Magnetic";
import { MonogramBadge } from "@/components/common/MonogramBadge";
import { PdfDocumentCanvas } from "@/components/common/PdfDocumentCanvas";
import {
  buildSafeResumeFilename,
  resolveResumeTargets,
} from "@/lib/resumeCache";
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

const MIN_ZOOM = 60;
const MAX_ZOOM = 200;
const ZOOM_STEP = 20;

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
 * In-app multi-page Resume / CV modal viewer with full PDF.js page-stack rendering,
 * live page navigation, zoom controls, fullscreen toggle, and automatic fallback
 * so all pages render cleanly across Desktop, iOS Safari, iPadOS, and Android.
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [fallbackForSrc, setFallbackForSrc] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [zoomPercent, setZoomPercent] = useState(100);

  const targets = useMemo(() => resolveResumeTargets(resumeUrl), [resumeUrl]);
  const downloadFilename = useMemo(
    () => buildSafeResumeFilename(fullName),
    [fullName]
  );

  const useNativeIframe =
    targets.isGoogleDrive || fallbackForSrc === targets.apiSrc;
  const activeSrc = useNativeIframe ? targets.iframeSrc : targets.apiSrc;
  const documentReady = loadedSrc === activeSrc;

  useEffect(() => {
    if (!open) {
      const id = requestAnimationFrame(() => {
        setLoadedSrc(null);
        setFallbackForSrc(null);
        setIsFullscreen(false);
        setNumPages(0);
        setActivePage(1);
        setZoomPercent(100);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const handleDocumentLoaded = useCallback(
    ({ numPages: total }: { numPages: number }) => {
      setNumPages(total);
      setActivePage(1);
    },
    []
  );

  const handleFirstPageRendered = useCallback(() => {
    setLoadedSrc(targets.apiSrc);
  }, [targets.apiSrc]);

  const handlePdfJsError = useCallback(() => {
    setFallbackForSrc(targets.apiSrc);
    setLoadedSrc(null);
  }, [targets.apiSrc]);

  const scrollToPage = useCallback((pageNum: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const clamped = Math.max(1, Math.min(numPages || 1, pageNum));
    const targetEl = container.querySelector<HTMLElement>(
      `[data-pdf-page="${clamped}"]`
    );
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      setActivePage(clamped);
    }
  }, [numPages]);

  const handleZoomOut = () =>
    setZoomPercent((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  const handleZoomIn = () =>
    setZoomPercent((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  const handleZoomReset = () => setZoomPercent(100);

  const showPdfToolbar = !useNativeIframe && numPages > 0;
  const quickPageButtons =
    numPages > 1 && numPages <= 8
      ? Array.from({ length: numPages }, (_, idx) => idx + 1)
      : [];

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
          "flex flex-col flex-1 min-h-0 overflow-hidden",
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
                <span className="truncate">
                  CH // CV · Curriculum Vitae
                  {numPages > 0 ? ` · ${numPages} ${numPages === 1 ? "Page" : "Pages"}` : ""}
                </span>
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
                href={targets.downloadHref}
                download={downloadFilename}
                onClick={onDownload}
                className="btn-primary bg-brand-solid text-brand-contrast hover:bg-brand-solid-hover hover:shadow-[0_6px_24px_var(--accent-glow)] active:scale-[0.98] rounded-full h-[2.125rem] px-3 sm:px-4 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand whitespace-nowrap"
              >
                <FileDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden min-[440px]:inline">Download PDF</span>
                <span className="min-[440px]:hidden">PDF</span>
              </a>
            </Magnetic>

            <a
              href={targets.openTabHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open resume PDF in new tab"
              title="Open in new tab"
              className="hidden sm:inline-flex items-center justify-center w-[2.125rem] h-[2.125rem] rounded-full border border-(--border-strong) bg-(--bg-surface-2)/70 text-(--text-secondary) hover:text-(--text-primary) hover:border-brand/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>

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

        {/* Multi-Page Reader Toolbar (Page Jump + Zoom) */}
        {showPdfToolbar && (
          <div className="px-3.5 sm:px-6 py-2 border-b border-(--border-subtle) bg-(--bg-surface-2)/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
            {/* Page Navigation */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={activePage <= 1}
                onClick={() => scrollToPage(activePage - 1)}
                aria-label="Previous resume page"
                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary) hover:border-brand/50 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-(--text-primary) tabular-nums px-1">
                Page {activePage} / {numPages}
              </span>

              <button
                type="button"
                disabled={activePage >= numPages}
                onClick={() => scrollToPage(activePage + 1)}
                aria-label="Next resume page"
                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary) hover:border-brand/50 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              {quickPageButtons.length > 0 && (
                <div
                  role="group"
                  aria-label="Jump to resume page"
                  className="hidden sm:flex items-center gap-1 pl-1.5 ml-1 border-l border-(--border-subtle)"
                >
                  {quickPageButtons.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => scrollToPage(p)}
                      aria-label={`Jump to page ${p}`}
                      aria-current={activePage === p ? "page" : undefined}
                      className={cn(
                        "h-6 min-w-6 px-1.5 rounded-full text-[10px] font-mono tabular-nums transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                        activePage === p
                          ? "bg-brand-solid text-brand-contrast font-semibold"
                          : "bg-(--bg-surface) text-(--text-muted) border border-(--border-subtle) hover:text-(--text-primary) hover:border-brand/40"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={zoomPercent <= MIN_ZOOM}
                onClick={handleZoomOut}
                aria-label="Zoom out resume"
                title="Zoom out"
                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary) hover:border-brand/50 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={handleZoomReset}
                aria-label="Reset resume zoom to fit width"
                title="Fit width (100%)"
                className="h-7 min-w-12 px-2 rounded-full border border-(--border-subtle) bg-(--bg-surface) text-[11px] font-mono text-(--text-primary) hover:border-brand/50 tabular-nums transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {zoomPercent}%
              </button>

              <button
                type="button"
                disabled={zoomPercent >= MAX_ZOOM}
                onClick={handleZoomIn}
                aria-label="Zoom in resume"
                title="Zoom in"
                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary) hover:border-brand/50 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Document Stage + Skeleton Overlay */}
        <div className="relative flex-1 min-h-0 bg-(--bg-canvas)">
          {!documentReady && <ResumeDocumentSkeleton />}

          {open && resumeUrl && (
            useNativeIframe ? (
              <iframe
                key={targets.iframeSrc}
                title={`${fullName} Resume PDF`}
                src={targets.iframeSrc}
                onLoad={() => setLoadedSrc(targets.iframeSrc)}
                className={cn(
                  "absolute inset-0 z-10 w-full h-full border-0 bg-white transition-opacity duration-200",
                  documentReady ? "opacity-100" : "opacity-0"
                )}
              />
            ) : (
              <div
                ref={scrollContainerRef}
                data-lenis-prevent
                tabIndex={0}
                aria-label={`${fullName} Resume Document Viewer`}
                className={cn(
                  "absolute inset-0 z-10 w-full h-full overflow-y-auto overflow-x-auto overscroll-contain [scrollbar-gutter:stable] focus:outline-none transition-opacity duration-200",
                  documentReady ? "opacity-100" : "opacity-0"
                )}
              >
                <PdfDocumentCanvas
                  open={open}
                  pdfUrl={targets.apiSrc}
                  fullName={fullName}
                  zoomPercent={zoomPercent}
                  isFullscreen={isFullscreen}
                  scrollContainerRef={scrollContainerRef}
                  onDocumentLoaded={handleDocumentLoaded}
                  onFirstPageRendered={handleFirstPageRendered}
                  onActivePageChange={setActivePage}
                  onLoadError={handlePdfJsError}
                />
              </div>
            )
          )}
        </div>

        {/* Compact Footer Strip */}
        <div className="px-3.5 sm:px-6 py-2.5 border-t border-(--border-subtle) bg-(--bg-surface) flex items-center justify-between gap-2 text-[0.6875rem] font-mono text-(--text-muted) shrink-0">
          <span className="truncate">{headline}</span>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={targets.openTabHref}
              target="_blank"
              rel="noopener noreferrer"
              className="sm:hidden text-(--text-secondary) hover:text-(--text-primary) hover:underline"
            >
              Open Tab ↗
            </a>
            <a
              href={targets.downloadHref}
              download={downloadFilename}
              onClick={onDownload}
              className="text-(--text-accent) hover:underline"
            >
              Direct PDF Download ↓
            </a>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
