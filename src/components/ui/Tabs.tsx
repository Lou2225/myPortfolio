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
  layout?: "auto" | "equal";
  className?: string;
  trackClassName?: string;
  tabClassName?: string;
}

/**
 * Reusable Animated Tabs Component
 * Mirrors the sculpted vertical sidebar indicator sideways using GPU-only
 * `translate3d` + `scaleX` spring physics (`back.out`), unified `BadgeCounter`,
 * and full WAI-ARIA `tablist` keyboard arrow navigation.
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel = "Tabs",
  variant = "accent",
  size = "sm",
  layout = "auto",
  className,
  trackClassName,
  tabClassName,
}: TabsProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const prevValueRef = useRef<T | null>(null);
  const activeValueRef = useRef<T>(value);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    activeValueRef.current = value;
  }, [value]);

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
      const btn = tabRefs.current[targetId];
      if (!pill || !btn) return;

      const nextX = btn.offsetLeft;
      const nextY = btn.offsetTop;
      const nextWidth = btn.offsetWidth;
      const nextHeight = btn.offsetHeight;
      if (nextWidth <= 0 || nextHeight <= 0) return;

      const prefersReducedMotion = shouldReduceMotion();

      pill.style.transition =
        !animate || prefersReducedMotion
          ? "none"
          : "transform 380ms cubic-bezier(0.34, 1.45, 0.64, 1), width 260ms cubic-bezier(0.22, 1, 0.36, 1), height 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease";

      pill.style.width = `${nextWidth}px`;
      pill.style.height = `${nextHeight}px`;
      pill.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      pill.style.opacity = "1";
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

  useEffect(() => {
    const trackEl = trackRef.current;
    if (!trackEl) return;

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

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (!isVisibleRef.current) return;
            syncIndicatorToValue(activeValueRef.current, false);
          })
        : null;

    if (observer) {
      observer.observe(trackEl);
      for (const item of items) {
        const btn = tabRefs.current[item.id];
        if (btn) observer.observe(btn);
      }
    }

    return () => {
      io?.disconnect();
      observer?.disconnect();
    };
  }, [items, syncIndicatorToValue]);

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

  const isDock = size === "dock";

  return (
    <div
      className={cn(
        "border border-(--border-subtle) select-none",
        isDock
          ? "rounded-2xl bg-(--bg-surface)/95 backdrop-blur-2xl border-(--border-strong) shadow-[0_12px_36px_rgba(0,0,0,0.45)] p-1.5"
          : "inline-flex max-w-full overflow-x-auto rounded-sm bg-(--bg-surface-2) p-1",
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
          "relative overflow-hidden",
          isDock ? "rounded-xl" : "rounded-sm",
          layout === "equal"
            ? "grid gap-0.5 w-full"
            : "inline-flex items-center gap-1 min-w-max",
          trackClassName
        )}
      >
        {/* Shared GPU-Accelerated Sideways Gliding Indicator Pill */}
        <div
          ref={indicatorRef}
          aria-hidden="true"
          style={{ transformOrigin: "left center" }}
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-0 opacity-0 will-change-transform",
            isDock ? "rounded-xl" : "rounded-(--radius-control)",
            variant === "accent"
              ? isDock
                ? "bg-brand-solid shadow-[0_4px_14px_var(--accent-glow)]"
                : "bg-brand-solid shadow-[0_4px_14px_var(--accent-glow)]"
              : "bg-(--bg-surface) border border-brand/40 shadow-[0_4px_14px_rgba(0,0,0,0.2)]"
          )}
        />

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
              onClick={() => onChange(item.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={cn(
                "relative z-10 inline-flex items-center justify-center font-mono uppercase transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap",
                isDock
                  ? "py-2 px-1 rounded-xl flex-col gap-1 tracking-wider"
                  : size === "md"
                    ? "h-9.5 px-4 rounded-(--radius-control) gap-2 text-xs tracking-wider"
                    : "h-8 px-3 rounded-(--radius-control) gap-1.5 text-[11px] tracking-wider",
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
                    "shrink-0 transition-transform duration-300",
                    isActive ? (isDock ? "scale-110" : "scale-105") : "scale-100"
                  )}
                >
                  {item.icon}
                </span>
              )}

              <span
                className={cn(
                  isDock && "text-[9px] leading-none truncate max-w-full"
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
                  className={isDock ? "top-1 right-1" : undefined}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
