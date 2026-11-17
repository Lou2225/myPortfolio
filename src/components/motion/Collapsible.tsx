"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { cn, measureStickyCeilingPx } from "@/lib/utils";
import { shouldReduceMotion } from "@/lib/appearance";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";

export interface CollapsibleProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** Optional outer section container ref (e.g. header + body card) used to frame the whole section cleanly on expand */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Smoothly follow the expanded section fields in real time as the accordion opens (PSGC parity) */
  followOnOpen?: boolean;
  /** Release `overflow-hidden` -> `overflow-visible` after expand animation completes so nested popovers never clip */
  allowOverflowWhenOpen?: boolean;
  /** Stagger internal `[data-collapsible-panel], section` blocks on open */
  staggerChildren?: boolean;
  /** Incrementing trigger to re-follow an already-open section (e.g. validation jump) */
  followSignal?: number;
  id?: string;
}

const COLLAPSIBLE_DURATION_MS = 300;
const COLLAPSIBLE_SETTLE_MS = 320;
const FOLLOW_SCROLL_DURATION_MS = 460;

/**
 * Reusable 60–120 FPS Accordion / Expandable Container.
 * Standardizes the exact PSGC animation curve (`duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`),
 * GPU slide (`translate-y-0` / `-translate-y-2`), optional overflow release for popovers,
 * Lenis height re-measurement, and synchronized viewport following as sections expand.
 */
export function Collapsible({
  open,
  children,
  className,
  contentClassName,
  containerRef,
  followOnOpen = false,
  allowOverflowWhenOpen = false,
  staggerChildren = false,
  followSignal = 0,
  id,
}: CollapsibleProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(open);
  const prevSignalRef = useRef(followSignal);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overflowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followRafRef = useRef<number | null>(null);
  const cancelFollowRef = useRef<(() => void) | null>(null);
  const [overflowSettled, setOverflowSettled] = useState(false);

  const { scrollTo, refreshScroll } = useSmoothScroll();

  const startSynchronizedFollow = useCallback((): (() => void) | undefined => {
    const triggerEl = containerRef?.current ?? rootRef.current;
    const panelEl = panelRef.current;
    if (!triggerEl || !panelEl) return undefined;

    const computeDesiredY = () => {
      const topClearance = measureStickyCeilingPx(164, 12);
      const bottomClearance = 28;
      const viewportHeight = window.innerHeight;
      const currentScrollY = window.scrollY;

      const triggerRect = triggerEl.getBoundingClientRect();
      const panelRect = panelEl.getBoundingClientRect();
      const fullPanelHeight = Math.max(panelRect.height, panelEl.scrollHeight);

      const sectionTopAbs = triggerRect.top + currentScrollY;
      const panelTopAbs = panelRect.top + currentScrollY;
      const panelBottomAbs = panelTopAbs + fullPanelHeight;

      const availableHeight = viewportHeight - topClearance - bottomClearance;
      const combinedHeight = panelBottomAbs - sectionTopAbs;

      let targetY: number;
      if (combinedHeight <= availableHeight) {
        targetY = sectionTopAbs - topClearance;
      } else if (fullPanelHeight <= availableHeight) {
        const extraSpace = Math.max(
          0,
          Math.floor((availableHeight - fullPanelHeight) / 2)
        );
        targetY = panelTopAbs - (topClearance + extraSpace);
      } else {
        targetY = sectionTopAbs - topClearance;
      }

      return Math.max(0, Math.round(targetY));
    };

    if (shouldReduceMotion()) {
      refreshScroll();
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      scrollTo(Math.min(computeDesiredY(), maxScroll), { immediate: true });
      return undefined;
    }

    let cancelled = false;
    const manualScrollKeys = new Set([
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ]);

    const handleUserAbort = () => {
      cancelled = true;
      cleanupListeners();
    };
    const handleKeyAbort = (e: KeyboardEvent) => {
      if (manualScrollKeys.has(e.key)) {
        handleUserAbort();
      }
    };
    const cleanupListeners = () => {
      window.removeEventListener("wheel", handleUserAbort);
      window.removeEventListener("touchstart", handleUserAbort);
      window.removeEventListener("keydown", handleKeyAbort);
    };

    const startY = window.scrollY;
    const startTime = performance.now();
    const easeOutExpand = (t: number) => 1 - Math.pow(1 - t, 4);

    // Attach user-override listeners on next frame so activation click/Enter doesn't self-cancel
    const listenerTimer = setTimeout(() => {
      if (cancelled) return;
      window.addEventListener("wheel", handleUserAbort, {
        passive: true,
        once: true,
      });
      window.addEventListener("touchstart", handleUserAbort, {
        passive: true,
        once: true,
      });
      window.addEventListener("keydown", handleKeyAbort, { passive: true });
    }, 30);

    const step = (now: number) => {
      if (cancelled) return;

      const elapsed = now - startTime;
      const t = Math.min(elapsed / FOLLOW_SCROLL_DURATION_MS, 1);
      const eased = easeOutExpand(t);

      const targetY = computeDesiredY();
      const maxScrollNow = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const interpolated = startY + (targetY - startY) * eased;
      const nextY = Math.max(
        0,
        Math.min(t === 1 ? Math.round(interpolated) : interpolated, maxScrollNow)
      );

      if (Math.abs(targetY - startY) >= 4) {
        scrollTo(nextY, { immediate: true });
      }

      if (t < 1) {
        followRafRef.current = requestAnimationFrame(step);
      } else {
        followRafRef.current = null;
        cleanupListeners();
        refreshScroll();
      }
    };

    followRafRef.current = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      clearTimeout(listenerTimer);
      cleanupListeners();
      if (followRafRef.current !== null) {
        cancelAnimationFrame(followRafRef.current);
        followRafRef.current = null;
      }
    };
  }, [containerRef, refreshScroll, scrollTo]);

  // Handle overflow release after expand transition settles (for dropdowns inside panels)
  useEffect(() => {
    if (overflowTimerRef.current) {
      clearTimeout(overflowTimerRef.current);
      overflowTimerRef.current = null;
    }

    if (!allowOverflowWhenOpen || !open) {
      const rafId = requestAnimationFrame(() => setOverflowSettled(false));
      return () => cancelAnimationFrame(rafId);
    }

    overflowTimerRef.current = setTimeout(() => {
      setOverflowSettled(true);
    }, COLLAPSIBLE_DURATION_MS + 10);

    return () => {
      if (overflowTimerRef.current) {
        clearTimeout(overflowTimerRef.current);
        overflowTimerRef.current = null;
      }
    };
  }, [open, allowOverflowWhenOpen]);

  // Handle viewport scroll-follow on expand, Lenis height refresh on collapse, and optional panel stagger
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    const signalChanged = followSignal !== prevSignalRef.current;
    prevOpenRef.current = open;
    prevSignalRef.current = followSignal;

    const didOpen = !wasOpen && open;
    const didClose = wasOpen && !open;

    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (cancelFollowRef.current) {
      cancelFollowRef.current();
      cancelFollowRef.current = null;
    }

    if (didClose) {
      settleTimerRef.current = setTimeout(() => {
        refreshScroll();
      }, COLLAPSIBLE_SETTLE_MS);
    } else if (followOnOpen && open && (didOpen || signalChanged)) {
      cancelFollowRef.current = startSynchronizedFollow() ?? null;
    }

    let ctx: gsap.Context | null = null;
    if (staggerChildren && didOpen) {
      const el = panelRef.current;

      if (el && !shouldReduceMotion()) {
        const panels = el.querySelectorAll<HTMLElement>(
          "[data-collapsible-panel], section"
        );
        if (panels.length > 0) {
          ctx = gsap.context(() => {
            gsap.fromTo(
              panels,
              { opacity: 0.45, y: 12 },
              {
                opacity: 1,
                y: 0,
                duration: 0.34,
                stagger: 0.04,
                delay: 0.02,
                ease: "power2.out",
                force3D: true,
                clearProps: "transform,opacity",
              }
            );
          }, el);
        }
      }
    }

    return () => {
      ctx?.revert();
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (cancelFollowRef.current) {
        cancelFollowRef.current();
        cancelFollowRef.current = null;
      }
    };
  }, [
    open,
    followOnOpen,
    followSignal,
    staggerChildren,
    startSynchronizedFollow,
    refreshScroll,
  ]);

  const effectiveOverflowVisible =
    allowOverflowWhenOpen && open && overflowSettled;

  return (
    <div
      ref={rootRef}
      id={id}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        open
          ? "grid-rows-[1fr] opacity-100"
          : "grid-rows-[0fr] opacity-0 pointer-events-none",
        className
      )}
    >
      <div
        aria-hidden={!open}
        inert={!open}
        data-collapsed={open ? undefined : "true"}
        className={cn(
          "min-h-0",
          effectiveOverflowVisible ? "overflow-visible" : "overflow-hidden"
        )}
      >
        <div
          ref={panelRef}
          className={cn(
            "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
            open ? "translate-y-0" : "-translate-y-2",
            contentClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
