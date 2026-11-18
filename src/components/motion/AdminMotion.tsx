"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { shouldReduceMotion } from "@/lib/appearance";
import { useIsomorphicLayoutEffect } from "@/lib/searchMotion";
import { cn } from "@/lib/utils";

function collectTopLevelCascadeTargets(root: HTMLElement): HTMLElement[] {
  const targets: HTMLElement[] = [];

  const pushVisible = (node: HTMLElement) => {
    if (node.closest("[data-collapsed='true']")) return;
    if (node.offsetHeight <= 0) return;
    targets.push(node);
  };

  for (const child of Array.from(root.children) as HTMLElement[]) {
    if (child.hasAttribute("data-cascade")) {
      pushVisible(child);
      continue;
    }

    const explicitInside = Array.from(
      child.querySelectorAll<HTMLElement>("[data-cascade]")
    ).filter((node) => {
      if (node.closest("[data-collapsed='true']")) return false;
      const parentCascade = node.parentElement?.closest("[data-cascade]");
      return !parentCascade || !child.contains(parentCascade);
    });

    if (explicitInside.length > 0) {
      explicitInside.forEach(pushVisible);
      continue;
    }

    const semanticInside = Array.from(
      child.querySelectorAll<HTMLElement>("section, .cascade-card")
    ).filter((node) => !node.closest("[data-collapsed='true']"));

    if (semanticInside.length > 0) {
      semanticInside.forEach(pushVisible);
      continue;
    }

    if (child.children.length > 1) {
      (Array.from(child.children) as HTMLElement[]).forEach(pushVisible);
    } else {
      pushVisible(child);
    }
  }

  return targets;
}

/**
 * 1. Reusable Staggered Cascade Container for CMS Modules, TabPanels & Form Sections
 * Animates top-level child cards, panels, and field groups sequentially on navigation.
 */
export function AdminCascade({
  activeKey,
  children,
  className,
  staggerSec = 0.048,
  distance = 18,
  skipInitial = false,
}: {
  activeKey: string;
  children: React.ReactNode;
  className?: string;
  staggerSec?: number;
  distance?: number;
  skipInitial?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevKeyRef = useRef(activeKey);

  useEffect(() => {
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = activeKey;

    if (skipInitial && prevKey === activeKey) return;

    const el = containerRef.current;
    if (!el) return;

    if (shouldReduceMotion()) return;

    const ctx = gsap.context(() => {
      const targets = collectTopLevelCascadeTargets(el);
      if (targets.length === 0) return;

      gsap.fromTo(
        targets,
        {
          opacity: 0,
          y: distance,
          scale: 0.992,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.44,
          stagger: staggerSec,
          ease: "power3.out",
          force3D: true,
          clearProps: "transform,opacity",
        }
      );
    }, el);

    return () => ctx.revert();
  }, [activeKey, staggerSec, distance, skipInitial]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}

/**
 * 1b. Directional Horizontal Slide Transition (`forward` from right / `back` from left)
 * Built with synchronous `useIsomorphicLayoutEffect` so incoming content never flashes
 * before GSAP sets its starting GPU `translate3d` offset.
 */
export function AdminSlideView({
  activeKey,
  direction = "forward",
  children,
  className,
  distancePx = 36,
  duration = 0.36,
  skipInitial = true,
}: {
  activeKey: string;
  direction?: "forward" | "back";
  children: React.ReactNode;
  className?: string;
  distancePx?: number;
  duration?: number;
  skipInitial?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevKeyRef = useRef(activeKey);

  useIsomorphicLayoutEffect(() => {
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = activeKey;

    if (skipInitial && prevKey === activeKey) return;

    const el = containerRef.current;
    if (!el || shouldReduceMotion()) return;

    const fromX = direction === "forward" ? distancePx : -distancePx;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, x: fromX },
        {
          opacity: 1,
          x: 0,
          duration,
          ease: "power3.out",
          force3D: true,
          clearProps: "transform,opacity",
        }
      );
    }, el);

    return () => ctx.revert();
  }, [activeKey, direction, distancePx, duration, skipInitial]);

  return (
    <div ref={containerRef} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}

/**
 * 2. Reusable 60-120 FPS Tabular Number Counter (`0 -> value`)
 */
export function AnimatedCounter({
  value,
  durationMs = 950,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    if (shouldReduceMotion() || target === 0) {
      const id = requestAnimationFrame(() => setDisplayValue(target));
      return () => cancelAnimationFrame(id);
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(target * eased));

      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setDisplayValue(target);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {displayValue.toLocaleString()}
      {suffix}
    </span>
  );
}

/**
 * 3. Reusable GPU-Accelerated Horizontal Chart / Funnel Bar (`scaleX(0 -> pct)`)
 */
export function AnimatedBar({
  percentage,
  delayMs = 80,
  heightClassName = "h-2.5",
  trackClassName,
  barClassName,
}: {
  percentage: number;
  delayMs?: number;
  heightClassName?: string;
  trackClassName?: string;
  barClassName?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const clamped = Math.max(0, Math.min(100, percentage));

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { scaleX: 0 },
        {
          scaleX: clamped / 100,
          duration: 0.85,
          delay: delayMs / 1000,
          ease: "expo.out",
        }
      );
    });

    return () => ctx.revert();
  }, [clamped, delayMs]);

  return (
    <div
      className={cn(
        "w-full bg-(--bg-surface-2) rounded-full overflow-hidden",
        heightClassName,
        trackClassName
      )}
    >
      <div
        ref={barRef}
        style={{ transformOrigin: "left center", transform: "scaleX(0)" }}
        className={cn(
          "h-full w-full rounded-full bg-linear-to-r from-brand to-brand/70 will-change-transform",
          barClassName
        )}
      />
    </div>
  );
}

/**
 * 4. Reusable GPU-Accelerated Mini Vertical Sparkline Bars for KPI Cards
 * Renders real proportional telemetry bars (0 values render as flat baseline ticks).
 */
export function AnimatedSparkBars({
  values,
  labels,
  delayMs = 80,
  staggerSec = 0.045,
  className,
}: {
  values: number[];
  labels?: string[];
  delayMs?: number;
  staggerSec?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const max = Math.max(...values, 1);
  const peakValue = Math.max(...values, 0);
  const valuesKey = values.join(",");

  useEffect(() => {
    const el = containerRef.current;
    if (!el || shouldReduceMotion()) return;

    const bars = el.querySelectorAll("[data-spark-bar]");
    const ctx = gsap.context(() => {
      gsap.fromTo(
        bars,
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 0.65,
          delay: delayMs / 1000,
          stagger: staggerSec,
          ease: staggerSec > 0 ? "back.out(1.4)" : "power3.out",
          clearProps: "transform",
        }
      );
    }, el);

    return () => ctx.revert();
  }, [valuesKey, delayMs, staggerSec]);

  return (
    <div
      ref={containerRef}
      aria-label="Metric distribution bars"
      className={cn("flex items-end gap-1 h-9 shrink-0", className)}
    >
      {values.map((v, i) => {
        const safeVal = Number.isFinite(v) && v > 0 ? v : 0;
        const isZero = safeVal === 0;
        const rawPct = isZero ? 0 : Math.min(100, (safeVal / max) * 100);
        const isPeak = !isZero && safeVal === peakValue;
        const label = labels?.[i] ? `${labels[i]}: ${safeVal}` : `${safeVal}`;

        return (
          <span
            key={i}
            data-spark-bar
            title={label}
            style={{
              height: isZero ? "2px" : `${rawPct.toFixed(2)}%`,
              minHeight: isZero ? "2px" : "3px",
              transformOrigin: "bottom center",
            }}
            className={cn(
              "w-1.5 rounded-t-sm will-change-transform transition-colors",
              isZero
                ? "bg-(--border-strong) opacity-45"
                : isPeak
                  ? "bg-brand"
                  : "bg-brand/55"
            )}
          />
        );
      })}
    </div>
  );
}
