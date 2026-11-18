"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { usePresenceTransition } from "@/lib/usePresenceTransition";
import { cn, measureStickyCeilingPx } from "@/lib/utils";

export interface DropdownPopoverProps {
  trigger: (props: { isOpen: boolean; toggle: () => void }) => React.ReactNode;
  children: (props: { close: () => void }) => React.ReactNode;
  align?: "start" | "center" | "end";
  widthClassName?: string;
  className?: string;
  disabled?: boolean;
  /** Render floating menu into document.body top layer so inputs/accordions never clip or overlap it */
  portal?: boolean;
  /** Minimum dropdown width (px) in portal mode */
  minWidth?: number;
  /** Initial height estimate (px) before live DOM ResizeObserver measures exact height */
  estimatedHeight?: number;
  /** How outer panel handles viewport height constraint ("auto" | "clip" for inner scrollareas | "none") */
  overflowMode?: "auto" | "clip" | "none";
  onOpenChange?: (isOpen: boolean) => void;
}

const POPOVER_EXIT_MS = 180;
const VIEWPORT_EDGE_PAD_PX = 12;
const FLIP_HYSTERESIS_PX = 28;

/**
 * Reusable Accessible Dropdown / Popover Container.
 * Zero-shake viewport tracking: updates portal DOM geometry synchronously in
 * the active Lenis / scroll tick without React state lag, uses 28px flip
 * hysteresis and ResizeObserver auto-flip (`top` <-> `bottom`).
 */
export function DropdownPopover({
  trigger,
  children,
  align = "end",
  widthClassName = "w-72 sm:w-80",
  className,
  disabled = false,
  portal = false,
  minWidth = 256,
  estimatedHeight = 290,
  overflowMode = "auto",
  onOpenChange,
}: DropdownPopoverProps) {
  const { subscribeScroll } = useSmoothScroll();
  const [isOpen, setIsOpen] = useState(false);
  const [portalPlacement, setPortalPlacement] = useState<"bottom" | "top">(
    "bottom"
  );
  const [inlinePlacement, setInlinePlacement] = useState<"bottom" | "top">(
    "bottom"
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const portalPanelRef = useRef<HTMLDivElement>(null);
  const inlinePanelRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef<"bottom" | "top">("bottom");

  const { mounted: portalMounted, visible: portalVisible } =
    usePresenceTransition(portal && isOpen, POPOVER_EXIT_MS, portalPanelRef);

  const close = useCallback(() => {
    if (!isOpen) return;
    setIsOpen(false);
    onOpenChange?.(false);
  }, [isOpen, onOpenChange]);

  const toggle = useCallback(() => {
    if (disabled) return;
    const next = !isOpen;
    setIsOpen(next);
    onOpenChange?.(next);
  }, [disabled, isOpen, onOpenChange]);

  const syncPortalGeometry = useCallback(
    (allowImmediateFlip: boolean) => {
      const triggerEl = containerRef.current;
      const panelEl = portalPanelRef.current;
      if (!triggerEl || !panelEl || typeof window === "undefined") return;

      const rect = triggerEl.getBoundingClientRect();
      const desiredW = Math.max(rect.width, minWidth);
      const maxW = window.innerWidth - VIEWPORT_EDGE_PAD_PX * 2;
      const width = Math.min(desiredW, maxW);

      let left = rect.left;
      if (align === "end") {
        left = rect.right - width;
      } else if (align === "center") {
        left = rect.left + (rect.width - width) / 2;
      }
      const clampedLeft = Math.max(
        VIEWPORT_EDGE_PAD_PX,
        Math.min(window.innerWidth - width - VIEWPORT_EDGE_PAD_PX, left)
      );

      const insideModal = Boolean(triggerEl.closest("[role='dialog']"));
      const insideHeader = Boolean(
        triggerEl.closest("header, [data-sticky-ceiling='true']")
      );
      panelEl.style.zIndex = insideModal
        ? "140"
        : insideHeader
          ? "110"
          : "15";

      const ceilingY =
        insideModal || insideHeader
          ? VIEWPORT_EDGE_PAD_PX
          : measureStickyCeilingPx();

      // Measure unconstrained intrinsic height from first inner block to avoid
      // ResizeObserver oscillation when maxHeight caps outer portal height.
      const innerEl = panelEl.firstElementChild as HTMLElement | null;
      const measuredH = innerEl ? innerEl.scrollHeight : panelEl.scrollHeight;
      const panelH = measuredH > 40 ? measuredH : estimatedHeight;

      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_EDGE_PAD_PX;
      const spaceAbove = rect.top - ceilingY;

      let nextPlacement = placementRef.current;
      if (allowImmediateFlip) {
        if (spaceBelow >= panelH) {
          nextPlacement = "bottom";
        } else if (spaceAbove >= panelH || spaceAbove > spaceBelow) {
          nextPlacement = "top";
        } else {
          nextPlacement = "bottom";
        }
      } else {
        // Hysteresis during active scrolling so crossing threshold never oscillates
        if (
          nextPlacement === "bottom" &&
          spaceBelow < Math.min(panelH, 200) &&
          spaceAbove > spaceBelow + FLIP_HYSTERESIS_PX
        ) {
          nextPlacement = "top";
        } else if (
          nextPlacement === "top" &&
          spaceAbove < Math.min(panelH, 200) &&
          spaceBelow > spaceAbove + FLIP_HYSTERESIS_PX
        ) {
          nextPlacement = "bottom";
        }
      }

      const availableSpace = Math.max(0, nextPlacement === "top" ? spaceAbove : spaceBelow);
      const topPx = nextPlacement === "bottom" ? rect.bottom + 8 : rect.top - 8;

      // Apply coordinates directly to DOM node for 0-frame-lag lockstep with Lenis scroll
      panelEl.style.top = `${topPx.toFixed(2)}px`;
      panelEl.style.left = `${clampedLeft.toFixed(2)}px`;
      panelEl.style.width = `${Math.round(width)}px`;

      const clampedSpace = Math.max(150, Math.floor(availableSpace));
      if (overflowMode === "clip") {
        // Subtract 2px panel border so child ScrollArea / listbox never exceeds inner box
        const innerMaxH = Math.max(120, clampedSpace - 2);
        panelEl.style.setProperty("--dropdown-max-h", `${innerMaxH}px`);
        panelEl.style.maxHeight = `${clampedSpace}px`;
        panelEl.style.overflowX = "hidden";
        panelEl.style.overflowY = "hidden";
      } else if (overflowMode === "auto" && panelH > availableSpace) {
        panelEl.style.removeProperty("--dropdown-max-h");
        panelEl.style.maxHeight = `${clampedSpace}px`;
        panelEl.style.overflowX = "hidden";
        panelEl.style.overflowY = "auto";
      } else if (overflowMode === "auto") {
        panelEl.style.removeProperty("--dropdown-max-h");
        panelEl.style.maxHeight = "";
        panelEl.style.overflowX = "hidden";
        panelEl.style.overflowY = "hidden";
      } else {
        panelEl.style.removeProperty("--dropdown-max-h");
        panelEl.style.maxHeight = "";
        panelEl.style.overflowX = "";
        panelEl.style.overflowY = "";
      }

      if (nextPlacement !== placementRef.current) {
        placementRef.current = nextPlacement;
        setPortalPlacement(nextPlacement);
      }

      // Auto-dismiss once the scrolled trigger disappears completely behind sticky bars or viewport bottom
      if (
        !allowImmediateFlip &&
        !insideModal &&
        !insideHeader &&
        (rect.bottom <= ceilingY - 10 || rect.top >= window.innerHeight - 6)
      ) {
        close();
      }
    },
    [align, close, estimatedHeight, minWidth, overflowMode]
  );

  // Synchronously position portal panel before paint when mounted, and track ResizeObserver / scroll / resize
  useLayoutEffect(() => {
    if (!portal || !portalMounted) return;

    syncPortalGeometry(true);

    if (!isOpen) return;

    const panelEl = portalPanelRef.current;
    const innerEl = (panelEl?.firstElementChild as HTMLElement | null) || panelEl;
    const observer =
      innerEl && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => syncPortalGeometry(true))
        : null;
    if (innerEl && observer) {
      observer.observe(innerEl);
    }

    const handleScrollSync = () => syncPortalGeometry(false);
    const handleResizeSync = () => syncPortalGeometry(true);

    const unsubscribeLenis = subscribeScroll(handleScrollSync);
    window.addEventListener("scroll", handleScrollSync, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", handleResizeSync, { passive: true });

    return () => {
      observer?.disconnect();
      unsubscribeLenis();
      window.removeEventListener("scroll", handleScrollSync, { capture: true });
      window.removeEventListener("resize", handleResizeSync);
    };
  }, [portal, portalMounted, isOpen, subscribeScroll, syncPortalGeometry]);

  // Smart auto-flip for non-portaled inline popovers too
  useEffect(() => {
    if (portal || !isOpen) return;
    const rafId = requestAnimationFrame(() => {
      const el = containerRef.current;
      const panelEl = inlinePanelRef.current;
      if (!el || typeof window === "undefined") return;
      const rect = el.getBoundingClientRect();
      const panelH = panelEl?.offsetHeight || estimatedHeight;
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_EDGE_PAD_PX;
      const spaceAbove = rect.top - measureStickyCeilingPx();
      setInlinePlacement(
        spaceBelow < panelH && spaceAbove > spaceBelow ? "top" : "bottom"
      );
    });
    return () => cancelAnimationFrame(rafId);
  }, [portal, isOpen, estimatedHeight]);

  // Outside pointer & Escape key dismissal (accounts for portaled menu DOM)
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insidePortal = portalPanelRef.current?.contains(target);
      if (!insideTrigger && !insidePortal) {
        close();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, close]);

  const alignStyles = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  };

  return (
    <div ref={containerRef} className={cn("relative inline-flex", className)}>
      {trigger({ isOpen, toggle })}

      {portal ? (
        portalMounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={portalPanelRef}
            aria-hidden={!isOpen}
            style={{
              transform:
                portalPlacement === "top"
                  ? portalVisible
                    ? "translate3d(0, -100%, 0) scale(1)"
                    : "translate3d(0, calc(-100% + 6px), 0) scale(0.97)"
                  : portalVisible
                    ? "translate3d(0, 0, 0) scale(1)"
                    : "translate3d(0, -6px, 0) scale(0.97)",
            }}
            className={cn(
              "fixed z-15 rounded-xl bg-(--bg-surface) border border-(--border-subtle) shadow-[0_18px_50px_rgba(0,0,0,0.5)] transition-[transform,opacity] duration-180 ease-out will-change-transform",
              overflowMode === "clip" && "overflow-hidden",
              overflowMode === "auto" && "lou-scrollarea overflow-x-hidden",
              portalPlacement === "top" ? "origin-bottom" : "origin-top",
              portalVisible
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            )}
          >
            {children({ close })}
          </div>,
          document.body
        )
      ) : (
        <div
          ref={inlinePanelRef}
          aria-hidden={!isOpen}
          className={cn(
            "absolute z-110 rounded-xl bg-(--bg-surface) border border-(--border-subtle) shadow-[0_18px_50px_rgba(0,0,0,0.45)] transition-all duration-200 ease-out",
            inlinePlacement === "top" ? "bottom-full mb-2.5" : "top-full mt-2.5",
            alignStyles[align],
            widthClassName,
            isOpen
              ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
              : inlinePlacement === "top"
                ? "opacity-0 scale-95 translate-y-1.5 pointer-events-none"
                : "opacity-0 scale-95 -translate-y-1.5 pointer-events-none"
          )}
        >
          {children({ close })}
        </div>
      )}
    </div>
  );
}
