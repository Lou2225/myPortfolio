"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { shouldReduceMotion } from "@/lib/appearance";
import { BadgeCounter, BadgeCounterProps } from "@/components/ui/BadgeCounter";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: React.ReactNode;
  badge?: number | string;
  badgeVariant?: BadgeCounterProps["variant"];
  isAlertBadge?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  variant?: "accent" | "surface";
  size?: "sm" | "md" | "dock";
  dockSurface?: "floating" | "inline";
  layout?: "auto" | "equal" | "fill";
  className?: string;
  trackClassName?: string;
  tabClassName?: string;
}

/**
 * Reusable Animated Tabs Component
 * Mirrors the sculpted vertical sidebar indicator sideways using GPU-only
 * `translate3d` + `scaleX` spring physics (`back.out`), unified `BadgeCounter`,
 * seamless hidden-scrollbar horizontal track with auto-centering,
 * and full WAI-ARIA `tablist` keyboard arrow navigation.
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel = "Tabs",
  variant = "accent",
  size = "sm",
  dockSurface = "floating",
  layout = "auto",
  className,
  trackClassName,
  tabClassName,
}: TabsProps<T>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const indicatorVisualRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const prevValueRef = useRef<T | null>(null);
  const activeValueRef = useRef<T>(value);
  const isVisibleRef = useRef(false);
  const lastPillRectRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const animatingUntilRef = useRef<number>(0);
  const pillAnimationRef = useRef<Animation | null>(null);
  const dragStateRef = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    dragged: false,
  });

  useEffect(() => {
    activeValueRef.current = value;
  }, [value]);

  const tabIdsSignature = useMemo(
    () => items.map((item) => item.id).join("|"),
    [items]
  );

  const itemsSignature = useMemo(
    () =>
      items
        .map(
          (item) =>
            `${item.id}:${item.label}:${item.shortLabel ?? ""}:${item.badge ?? ""}:${Boolean(item.disabled)}`
        )
        .join("|"),
    [items]
  );

  const syncIndicatorToValue = useCallback(
    (targetId: T, animate: boolean) => {
      const pill = indicatorRef.current;
      const pillVisual = indicatorVisualRef.current;
      const btn = tabRefs.current[targetId];
      if (!pill || !btn) return;

      const nextX = btn.offsetLeft;
      const nextY = btn.offsetTop;
      const nextWidth = btn.offsetWidth;
      const nextHeight = btn.offsetHeight;
      if (nextWidth <= 0 || nextHeight <= 0) return;

      const last = lastPillRectRef.current;
      if (!animate && last) {
        const dx = Math.abs(last.x - nextX);
        const dy = Math.abs(last.y - nextY);
        const dw = Math.abs(last.width - nextWidth);
        const dh = Math.abs(last.height - nextHeight);

        // Ignore redundant ResizeObserver ticks or tiny mid-flight ticks so the
        // spring bounce transition is never aborted prematurely.
        if (dx < 0.5 && dy < 0.5 && dw < 0.5 && dh < 0.5) {
          return;
        }
        if (performance.now() < animatingUntilRef.current && dw <= 1 && dh <= 1) {
          return;
        }
      }

      lastPillRectRef.current = {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      };

      const prefersReducedMotion = shouldReduceMotion();
      const shouldAnimate = animate && !prefersReducedMotion;

      if (shouldAnimate) {
        animatingUntilRef.current = performance.now() + 520;
        pill.style.transition =
          "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1), width 380ms cubic-bezier(0.34, 1.56, 0.64, 1), height 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease";

        if (pillVisual && typeof pillVisual.animate === "function") {
          pillAnimationRef.current?.cancel();
          pillAnimationRef.current = pillVisual.animate(
            [
              { transform: "scale(1, 1)" },
              { transform: "scale(1.06, 0.94)" },
              { transform: "scale(0.98, 1.03)" },
              { transform: "scale(1, 1)" },
            ],
            {
              duration: 440,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            }
          );
        }
      } else {
        pill.style.transition = "none";
      }

      pill.style.width = `${nextWidth}px`;
      pill.style.height = `${nextHeight}px`;
      pill.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      pill.style.opacity = "1";

      const container = scrollContainerRef.current;
      if (
        container &&
        typeof container.scrollTo === "function" &&
        container.scrollWidth > container.clientWidth + 2
      ) {
        const targetScrollLeft =
          nextX - container.clientWidth / 2 + nextWidth / 2;
        container.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: shouldAnimate ? "smooth" : "auto",
        });
      }
    },
    []
  );

  useEffect(() => {
    const isInitialMount = prevValueRef.current === null;
    const didTabChange =
      !isInitialMount && prevValueRef.current !== value;
    prevValueRef.current = value;

    if (isVisibleRef.current) {
      syncIndicatorToValue(value, didTabChange);
    }
  }, [value, itemsSignature, syncIndicatorToValue]);

  // Initial reveal observer (runs once until visible so item re-renders never reset transition)
  useEffect(() => {
    const trackEl = trackRef.current;
    if (!trackEl || isVisibleRef.current) return;

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                isVisibleRef.current = true;
                syncIndicatorToValue(activeValueRef.current, false);
                io?.disconnect();
              }
            },
            { rootMargin: "240px 0px", threshold: 0.01 }
          )
        : null;

    if (io) {
      io.observe(trackEl);
    } else {
      isVisibleRef.current = true;
      syncIndicatorToValue(activeValueRef.current, false);
    }

    return () => {
      io?.disconnect();
    };
  }, [syncIndicatorToValue]);

  // Layout resize observer keyed strictly on tab IDs rather than volatile array references
  useEffect(() => {
    const trackEl = trackRef.current;
    if (!trackEl || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (!isVisibleRef.current) return;
      syncIndicatorToValue(activeValueRef.current, false);
    });

    observer.observe(trackEl);
    for (const id of tabIdsSignature.split("|").filter(Boolean)) {
      const btn = tabRefs.current[id];
      if (btn) observer.observe(btn);
    }

    return () => {
      observer.disconnect();
    };
  }, [tabIdsSignature, syncIndicatorToValue]);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    const enabledIndices = items
      .map((item, idx) => (!item.disabled ? idx : -1))
      .filter((idx) => idx !== -1);
    if (enabledIndices.length <= 1) return;

    const pos = enabledIndices.indexOf(currentIndex);
    let targetIdx: number | null = null;

    if (e.key === "ArrowRight") {
      targetIdx = enabledIndices[(pos + 1) % enabledIndices.length];
    } else if (e.key === "ArrowLeft") {
      targetIdx =
        enabledIndices[
          (pos - 1 + enabledIndices.length) % enabledIndices.length
        ];
    } else if (e.key === "Home") {
      targetIdx = enabledIndices[0];
    } else if (e.key === "End") {
      targetIdx = enabledIndices[enabledIndices.length - 1];
    }

    if (targetIdx === null) return;
    e.preventDefault();
    const targetItem = items[targetIdx];
    if (!targetItem) return;
    onChange(targetItem.id);
    tabRefs.current[targetItem.id]?.focus();
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.stopPropagation();
      container.scrollLeft += e.deltaY;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    dragStateRef.current = {
      isDown: true,
      startX: e.clientX,
      scrollLeft: container.scrollLeft,
      dragged: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    const container = scrollContainerRef.current;
    if (!state.isDown || !container) return;
    const dx = e.clientX - state.startX;
    if (Math.abs(dx) > 5) {
      state.dragged = true;
      container.scrollLeft = state.scrollLeft - dx;
    }
  };

  const handlePointerEnd = () => {
    dragStateRef.current.isDown = false;
  };

  const isDock = size === "dock";
  const isCompactDock = isDock && items.length <= 5;

  return (
    <div
      ref={scrollContainerRef}
      data-lenis-prevent
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className={cn(
        "border border-(--border-subtle) select-none no-scrollbar touch-pan-x",
        isDock
          ? dockSurface === "inline"
            ? "overflow-hidden rounded-(--radius-card) bg-(--bg-surface) p-1.5"
            : "overflow-hidden rounded-2xl bg-(--bg-surface)/95 backdrop-blur-2xl border-(--border-strong) shadow-[0_12px_36px_rgba(0,0,0,0.45)] p-1 sm:p-1.5"
          : layout === "fill"
            ? "block w-full max-w-full overflow-x-auto rounded-sm bg-(--bg-surface-2) p-1 cursor-grab active:cursor-grabbing"
            : "block max-w-full overflow-x-auto rounded-sm bg-(--bg-surface-2) p-1 cursor-grab active:cursor-grabbing",
        className
      )}
    >
      <div
        ref={trackRef}
        role="tablist"
        aria-label={ariaLabel}
        style={
          layout === "equal"
            ? {
                gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))`,
              }
            : undefined
        }
        className={cn(
          "relative shrink-0",
          isDock ? "rounded-xl" : "rounded-sm",
          layout === "equal"
            ? "grid gap-0.5 w-full"
            : layout === "fill"
              ? "flex items-center gap-1 min-w-full w-max"
              : "inline-flex items-center gap-1 min-w-max",
          trackClassName
        )}
      >
        {/* Shared GPU-Accelerated Sideways Gliding & Bouncing Indicator Pill */}
        <div
          ref={indicatorRef}
          aria-hidden="true"
          style={{ transformOrigin: "left center" }}
          className="pointer-events-none absolute top-0 left-0 z-0 opacity-0 will-change-transform"
        >
          <div
            ref={indicatorVisualRef}
            className={cn(
              "w-full h-full will-change-transform",
              isDock ? "rounded-xl" : "rounded-(--radius-control)",
              variant === "accent"
                ? "bg-brand-solid shadow-[0_4px_14px_var(--accent-glow)]"
                : "bg-(--bg-surface) border border-brand/40 shadow-[0_4px_14px_rgba(0,0,0,0.2)]"
            )}
          />
        </div>

        {items.map((item, idx) => {
          const isActive = value === item.id;
          const displayLabel = isDock && item.shortLabel ? item.shortLabel : item.label;

          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[item.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={item.ariaLabel || undefined}
              aria-current={isDock && isActive ? "page" : undefined}
              disabled={item.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={(e) => {
                if (dragStateRef.current.dragged) {
                  e.preventDefault();
                  dragStateRef.current.dragged = false;
                  return;
                }
                onChange(item.id);
              }}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={cn(
                "relative z-10 inline-flex items-center justify-center font-mono uppercase transition-[color,transform] duration-200 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0",
                layout === "fill" && "flex-auto",
                isDock
                  ? isCompactDock
                    ? "min-w-0 py-2 px-1 rounded-xl flex-col gap-1 tracking-wider"
                    : "min-w-0 py-1.5 px-0.5 sm:px-1 rounded-xl flex-col gap-1 tracking-normal min-[390px]:tracking-wider"
                  : size === "md"
                    ? "h-9.5 px-3.5 sm:px-4 rounded-(--radius-control) gap-2 text-[0.75rem] tracking-wider"
                    : "h-8 px-3 rounded-(--radius-control) gap-1.5 text-[0.6875rem] tracking-wider",
                isActive
                  ? variant === "accent"
                    ? "text-brand-contrast font-semibold"
                    : "text-(--text-accent) font-semibold"
                  : "text-(--text-secondary) hover:text-(--text-primary)",
                tabClassName
              )}
            >
              {item.icon && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                    isActive ? (isDock ? "scale-110" : "scale-105") : "scale-100"
                  )}
                >
                  {item.icon}
                </span>
              )}

              <span
                className={cn(
                  isDock &&
                    (isCompactDock
                      ? "text-[0.625rem] leading-none truncate max-w-full"
                      : "text-[0.5rem] min-[390px]:text-[0.5625rem] leading-none truncate max-w-full")
                )}
              >
                {displayLabel}
              </span>

              {item.badge !== undefined && (
                <BadgeCounter
                  count={item.badge}
                  size="xs"
                  floating={isDock}
                  onAccentSurface={isActive && variant === "accent"}
                  variant={
                    isActive
                      ? item.isAlertBadge
                        ? "alert"
                        : "neutral"
                      : item.badgeVariant ??
                        (item.isAlertBadge ? "alert" : "surface")
                  }
                  className={
                    isDock
                      ? isCompactDock
                        ? "top-1 right-1.5 sm:right-2.5"
                        : "top-1 right-1"
                      : undefined
                  }
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
