"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SwipeRevealAction {
  id: string;
  label: string;
  ariaLabel?: string;
  icon: React.ReactNode;
  intent?: "neutral" | "accent" | "warning" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}

export interface SwipeRevealRowProps {
  actions: readonly SwipeRevealAction[];
  /** Disable swipe gesture cleanly on desktop or single-action guards while still rendering children */
  enabled?: boolean;
  /** Temporarily abort horizontal swipe when parent drag-to-reorder takes over */
  swipeBlocked?: boolean;
  /** Layout for behind-tray actions: `"stacked"` for multi-line cards, `"inline"` for single-line fields */
  actionLayout?: "stacked" | "inline";
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

const ACTION_TILE_STACKED_WIDTH_PX = 68;
const ACTION_TILE_INLINE_WIDTH_PX = 96;
const INLINE_TRAY_LEADING_GAP_PX = 8;
const INLINE_TRAY_ITEM_GAP_PX = 6;

/**
 * Reusable iOS / Messenger-style horizontal swipe-left reveal wrapper.
 * Tracks pointer movement directly via GPU `translate3d` for 120fps touch feedback,
 * avoids interfering with focused `<input>` cursor selection or vertical scroll, and
 * auto-closes when tapping outside or choosing an action.
 */
export function SwipeRevealRow({
  actions,
  enabled = true,
  swipeBlocked = false,
  actionLayout = "stacked",
  className,
  contentClassName,
  children,
}: SwipeRevealRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const slidingRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    baseOffset: number;
    currentOffset: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
    mode: "pending" | "horizontal" | "aborted";
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    baseOffset: 0,
    currentOffset: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    mode: "pending",
  });

  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInlinePill = actionLayout === "inline";
  const tileWidthPx = isInlinePill
    ? ACTION_TILE_INLINE_WIDTH_PX
    : ACTION_TILE_STACKED_WIDTH_PX;
  const trayWidth =
    actions.length * tileWidthPx +
    (isInlinePill
      ? INLINE_TRAY_LEADING_GAP_PX +
        Math.max(0, actions.length - 1) * INLINE_TRAY_ITEM_GAP_PX
      : 0);
  const activeSwipe = enabled && actions.length > 0;

  // Abort horizontal swipe tracking immediately if parent drag-to-reorder activates
  useEffect(() => {
    if (!swipeBlocked) return;
    dragStateRef.current.active = false;
    dragStateRef.current.mode = "aborted";
    const rafId = requestAnimationFrame(() => {
      setIsDragging(false);
    });
    return () => cancelAnimationFrame(rafId);
  }, [swipeBlocked]);

  // Close cleanly when clicking/tapping anywhere outside an open swipe row
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && !containerRef.current?.contains(target)) {
        setIsOpen(false);
        if (slidingRef.current) {
          slidingRef.current.style.transform = "translate3d(0px, 0, 0)";
        }
      }
    };
    document.addEventListener("pointerdown", handleOutside, true);
    return () => document.removeEventListener("pointerdown", handleOutside, true);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (suppressTimerRef.current) {
        clearTimeout(suppressTimerRef.current);
      }
    };
  }, []);

  const snapTo = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    const targetX = nextOpen ? -trayWidth : 0;
    dragStateRef.current.currentOffset = targetX;
    if (slidingRef.current) {
      slidingRef.current.style.transform = `translate3d(${targetX}px, 0, 0)`;
    }
  };

  if (!activeSwipe) {
    return <div className={className}>{children}</div>;
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (swipeBlocked || e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-drag-handle='true']")) {
      return;
    }

    // Preserve native cursor movement/selection when user already focused an input inside this row
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      if (document.activeElement === target) {
        return;
      }
    }

    const baseOffset = isOpen ? -trayWidth : 0;
    const now = performance.now();
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseOffset,
      currentOffset: baseOffset,
      lastX: e.clientX,
      lastTime: now,
      velocityX: 0,
      mode: "pending",
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.active || e.pointerId !== state.pointerId) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    if (state.mode === "aborted") return;

    if (state.mode === "pending") {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        state.mode = "aborted";
        state.active = false;
        return;
      }

      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        // Ignore rightward drag when row is already closed
        if (!isOpen && dx > 0) {
          state.mode = "aborted";
          state.active = false;
          return;
        }
        state.mode = "horizontal";
        setIsDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Ignore synthetic pointer capture warnings
        }
      } else {
        return;
      }
    }

    const now = performance.now();
    const dt = Math.max(1, now - state.lastTime);
    state.velocityX = (e.clientX - state.lastX) / dt;
    state.lastX = e.clientX;
    state.lastTime = now;

    const raw = state.baseOffset + dx;
    let nextX = Math.min(0, raw);
    if (nextX < -trayWidth) {
      const excess = -trayWidth - nextX;
      nextX = -trayWidth - Math.min(26, excess * 0.25);
    }

    state.currentOffset = nextX;
    if (slidingRef.current) {
      slidingRef.current.style.transform = `translate3d(${nextX}px, 0, 0)`;
    }
  };

  const finishSwipe = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.active || e.pointerId !== state.pointerId) return;
    state.active = false;

    if (state.mode !== "horizontal") return;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }

    setIsDragging(false);
    suppressClickRef.current = true;
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false;
    }, 120);

    const shouldOpen =
      state.currentOffset < -trayWidth * 0.42 || state.velocityX < -0.35;
    snapTo(shouldOpen);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden touch-pan-y select-none",
        !isInlinePill && "rounded-(--radius-control)",
        className
      )}
    >
      {/* Underlying iOS / Messenger Action Tray */}
      <div
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={cn(
          "absolute inset-y-0 right-0 flex z-0 transition-opacity",
          isInlinePill ? "items-center gap-1.5 pl-2" : "items-stretch",
          isOpen || isDragging
            ? "opacity-100 duration-75 delay-0"
            : "opacity-0 pointer-events-none duration-200 delay-75"
        )}
      >
        {actions.map((action) => {
          const tileIntent = isInlinePill
            ? action.intent === "danger"
              ? "bg-rose-500/14 hover:bg-rose-500/24 active:bg-rose-500/30 border border-rose-500/45 hover:border-rose-500/70 text-rose-400 hover:text-rose-300"
              : action.intent === "warning"
                ? "bg-amber-500/14 hover:bg-amber-500/24 border border-amber-500/45 text-amber-400"
                : action.intent === "accent"
                  ? "bg-(--bg-badge-highlight) border border-(--border-brand) text-(--text-accent)"
                  : "bg-(--bg-surface-2) hover:bg-(--bg-surface) border border-(--border-strong) text-(--text-primary)"
            : action.intent === "danger"
              ? "bg-rose-600 hover:bg-rose-500 text-white"
              : action.intent === "warning"
                ? "bg-amber-500 hover:bg-amber-400 text-black"
                : action.intent === "accent"
                  ? "bg-brand-solid hover:bg-brand-solid-hover text-brand-contrast"
                  : "bg-(--bg-surface-2) hover:bg-(--bg-surface) text-(--text-primary) border-l border-(--border-subtle)";

          return (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              tabIndex={isOpen ? 0 : -1}
              aria-label={action.ariaLabel || action.label}
              onClick={() => {
                if (action.disabled) return;
                snapTo(false);
                action.onSelect();
              }}
              style={{ width: tileWidthPx }}
              className={cn(
                "flex items-center justify-center font-mono uppercase tracking-wider font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                isInlinePill
                  ? "h-10.5 rounded-full px-3 flex-row gap-1.5 text-[10.5px]"
                  : "px-2 flex-col gap-1 text-[10px]",
                tileIntent
              )}
            >
              {action.icon}
              <span className="truncate max-w-full">{action.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sliding Foreground Content */}
      <div
        ref={slidingRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          const target = e.target as HTMLElement | null;
          if (isOpen && !target?.closest("button, a")) {
            e.preventDefault();
            e.stopPropagation();
            snapTo(false);
          }
        }}
        style={{
          transform: isOpen
            ? `translate3d(-${trayWidth}px, 0, 0)`
            : "translate3d(0px, 0, 0)",
        }}
        className={cn(
          "relative z-10 bg-(--bg-surface) will-change-transform",
          !isDragging &&
            "transition-transform duration-240 ease-[cubic-bezier(0.22,1,0.36,1)]",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
