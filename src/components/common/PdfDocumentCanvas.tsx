"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Loader2 } from "lucide-react";
import { fetchResumePdfBytes } from "@/lib/resumeCache";
import { cn } from "@/lib/utils";

const PDF_WORKER_URL = "/api/pdf-worker";

export interface PdfDocumentCanvasProps {
  open: boolean;
  pdfUrl: string;
  fullName: string;
  zoomPercent: number;
  isFullscreen: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onDocumentLoaded: (info: { numPages: number }) => void;
  onFirstPageRendered: () => void;
  onActivePageChange: (page: number) => void;
  onLoadError: (message: string) => void;
}

interface PdfPageSheetProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  totalPages: number;
  targetWidthPx: number;
  fullName: string;
  onRendered?: (pageNumber: number) => void;
}

function isCancelledRenderError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "RenderingCancelledException" || name === "AbortException";
}

/**
 * Renders a single PDF page onto a Retina-scaled HTML5 Canvas with sequential
 * render cancellation so rapid zoom/resize changes never collide on the same canvas.
 */
function PdfPageSheet({
  doc,
  pageNumber,
  totalPages,
  targetWidthPx,
  fullName,
  onRendered,
}: PdfPageSheetProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeTaskRef = useRef<RenderTask | null>(null);
  const onRenderedRef = useRef(onRendered);
  const [renderedSize, setRenderedSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    onRenderedRef.current = onRendered;
  }, [onRendered]);

  useEffect(() => {
    if (targetWidthPx <= 0) return;

    let cancelled = false;

    const renderPage = async () => {
      // Wait for any in-flight render task on this canvas to cancel cleanly first
      if (activeTaskRef.current) {
        const prevTask = activeTaskRef.current;
        prevTask.cancel();
        try {
          await prevTask.promise;
        } catch {
          // Expected when cancelling an in-flight render
        }
        if (activeTaskRef.current === prevTask) {
          activeTaskRef.current = null;
        }
      }

      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        if (baseViewport.width <= 0 || baseViewport.height <= 0) return;

        const cssScale = targetWidthPx / baseViewport.width;
        const viewport = page.getViewport({ scale: cssScale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2.25);

        const cssWidth = Math.max(1, Math.floor(viewport.width));
        const cssHeight = Math.max(1, Math.floor(viewport.height));
        const pixelWidth = Math.max(1, Math.floor(viewport.width * dpr));
        const pixelHeight = Math.max(1, Math.floor(viewport.height * dpr));

        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const renderTask = page.render({
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          background: "#ffffff",
        });

        activeTaskRef.current = renderTask;
        await renderTask.promise;

        if (activeTaskRef.current === renderTask) {
          activeTaskRef.current = null;
        }

        if (!cancelled) {
          setRenderedSize({ width: cssWidth, height: cssHeight });
          onRenderedRef.current?.(pageNumber);
        }
      } catch (err) {
        if (!isCancelledRenderError(err)) {
          // Non-cancellation page render failure: still notify first page so UI doesn't stay stuck
          if (!cancelled && pageNumber === 1) {
            onRenderedRef.current?.(pageNumber);
          }
        }
      }
    };

    const canvas = canvasRef.current;
    void renderPage();

    return () => {
      cancelled = true;
      if (activeTaskRef.current) {
        activeTaskRef.current.cancel();
      }
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [doc, pageNumber, targetWidthPx]);

  const estimatedHeight = Math.round(targetWidthPx * 1.414);

  return (
    <article
      data-pdf-page={pageNumber}
      aria-label={`${fullName} Resume — Page ${pageNumber} of ${totalPages}`}
      className="flex flex-col items-center gap-2 shrink-0"
    >
      <div
        style={{
          width: renderedSize ? `${renderedSize.width}px` : `${targetWidthPx}px`,
          minHeight: renderedSize
            ? `${renderedSize.height}px`
            : `${estimatedHeight}px`,
        }}
        className={cn(
          "relative bg-white rounded-sm shadow-[0_14px_40px_rgba(0,0,0,0.42)] ring-1 ring-black/15 overflow-hidden transition-opacity duration-200"
        )}
      >
        {!renderedSize && (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/95 text-neutral-500"
          >
            <Loader2 className="w-5 h-5 animate-spin text-(--text-accent)" />
            <span className="text-[11px] font-mono uppercase tracking-[0.16em]">
              Rendering Page {pageNumber} of {totalPages}
            </span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="block select-none"
          aria-label={`Resume page ${pageNumber}`}
        />
      </div>

      {totalPages > 1 && (
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted) select-none">
          Page {pageNumber} of {totalPages}
        </span>
      )}
    </article>
  );
}

/**
 * Multi-page in-app PDF.js canvas reader that renders every page of the Resume PDF
 * smoothly across Desktop, iOS Safari, iPadOS, Android Chrome, and PWA standalone mode.
 * Dynamically imports `pdfjs-dist` only when opened so initial homepage bundle stays at 0 KB overhead.
 */
export function PdfDocumentCanvas({
  open,
  pdfUrl,
  fullName,
  zoomPercent,
  isFullscreen,
  scrollContainerRef,
  onDocumentLoaded,
  onFirstPageRendered,
  onActivePageChange,
  onLoadError,
}: PdfDocumentCanvasProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [stageWidth, setStageWidth] = useState(0);

  const callbacksRef = useRef({
    onDocumentLoaded,
    onFirstPageRendered,
    onActivePageChange,
    onLoadError,
  });

  useEffect(() => {
    callbacksRef.current = {
      onDocumentLoaded,
      onFirstPageRendered,
      onActivePageChange,
      onLoadError,
    };
  }, [onDocumentLoaded, onFirstPageRendered, onActivePageChange, onLoadError]);

  // Measure scrollable stage width for responsive page fit (resize + fullscreen transitions)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!open || !el) return;

    const updateWidth = (rawWidth: number) => {
      const next = Math.floor(rawWidth);
      if (next <= 0) return;
      setStageWidth((prev) => (Math.abs(prev - next) >= 4 ? next : prev));
    };

    const rafId = requestAnimationFrame(() => updateWidth(el.clientWidth));

    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(rafId);
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) updateWidth(width);
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [open, isFullscreen, scrollContainerRef]);

  // Load PDF document via dynamic pdfjs-dist import and self-hosted worker
  useEffect(() => {
    if (!open || !pdfUrl) return;

    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    let resolvedDoc: PDFDocumentProxy | null = null;

    const loadDocument = async () => {
      try {
        const [pdfjs, bytes] = await Promise.all([
          import("pdfjs-dist/legacy/build/pdf.mjs"),
          fetchResumePdfBytes(pdfUrl),
        ]);

        if (cancelled) return;

        if (pdfjs.GlobalWorkerOptions.workerSrc !== PDF_WORKER_URL) {
          pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        }

        const task = pdfjs.getDocument({
          data: bytes,
          useSystemFonts: true,
        });
        loadingTask = task;

        const doc = await task.promise;
        resolvedDoc = doc;
        if (cancelled) {
          await task.destroy();
          return;
        }

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        callbacksRef.current.onDocumentLoaded({ numPages: doc.numPages });
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "Unable to render multi-page PDF preview.";
          callbacksRef.current.onLoadError(message);
        }
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      if (resolvedDoc) {
        void resolvedDoc.cleanup().catch(() => {});
      }
      setPdfDoc(null);
      setNumPages(0);
      if (loadingTask) {
        void loadingTask.destroy().catch(() => {});
      }
    };
  }, [open, pdfUrl]);

  // Observe visible pages to keep toolbar "Page X / N" synced live during scrolling
  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!open || !root || numPages <= 1) return;

    const pageEls = Array.from(
      root.querySelectorAll<HTMLElement>("[data-pdf-page]")
    );
    if (pageEls.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const ratios = new Map<number, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number(entry.target.getAttribute("data-pdf-page"));
          if (Number.isFinite(pageNum) && pageNum > 0) {
            ratios.set(pageNum, entry.intersectionRatio);
          }
        }

        let bestPage = 1;
        let bestRatio = -1;
        for (const [pageNum, ratio] of ratios.entries()) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = pageNum;
          }
        }

        if (bestRatio > 0) {
          callbacksRef.current.onActivePageChange(bestPage);
        }
      },
      {
        root,
        threshold: [0.1, 0.25, 0.45, 0.65, 0.85],
      }
    );

    for (const el of pageEls) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [open, numPages, scrollContainerRef]);

  if (!pdfDoc || numPages <= 0) {
    return null;
  }

  const horizontalPadding = stageWidth < 520 ? 24 : 56;
  const maxFitWidth = isFullscreen ? 1140 : 880;
  const baseFitWidth = Math.max(
    240,
    Math.min(
      (stageWidth > 0 ? stageWidth : 820) - horizontalPadding,
      maxFitWidth
    )
  );
  const targetWidthPx = Math.max(
    220,
    Math.round((baseFitWidth * zoomPercent) / 100)
  );

  const pageNumbers = Array.from({ length: numPages }, (_, idx) => idx + 1);

  return (
    <div className="w-fit min-w-full flex flex-col items-center gap-5 sm:gap-6 px-3 sm:px-7 py-4 sm:py-6">
      {pageNumbers.map((pageNumber) => (
        <PdfPageSheet
          key={`${pdfUrl}-page-${pageNumber}`}
          doc={pdfDoc}
          pageNumber={pageNumber}
          totalPages={numPages}
          targetWidthPx={targetWidthPx}
          fullName={fullName}
          onRendered={
            pageNumber === 1
              ? () => callbacksRef.current.onFirstPageRendered()
              : undefined
          }
        />
      ))}
    </div>
  );
}
