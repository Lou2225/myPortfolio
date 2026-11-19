"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";

export interface ParsedScalarMetric {
  target: number;
  decimals: number;
}

/**
 * Extracts a single numeric value (with decimal precision) from metric text like "100",
 * "2026", "45.5", or "3", while returning `null` for ranges like "60-120".
 */
export function parseScalarMetric(raw: string): ParsedScalarMetric | null {
  const clean = (raw || "").trim();
  const match = /^(\d+(?:\.\d+)?)$/.exec(clean);
  if (!match) return null;

  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;

  const dotIdx = match[1].indexOf(".");
  const decimals = dotIdx >= 0 ? match[1].length - dotIdx - 1 : 0;
  return { target: numeric, decimals };
}

export interface CountUpMetricProps {
  value: string;
  durationMs?: number;
}

/**
 * Direct-DOM numeric count-up that triggers once when scrolled into view (`0` per-frame React state updates)
 * and gracefully renders non-scalar values or Reduced Motion immediately.
 */
export function CountUpMetric({ value, durationMs = 1100 }: CountUpMetricProps) {
  const { appearance } = usePortfolio();
  const reducedMotion = resolveEffectiveReducedMotion(appearance);
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const parsed = useMemo(() => parseScalarMetric(value), [value]);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    if (!parsed || reducedMotion || typeof IntersectionObserver === "undefined") {
      el.textContent = value;
      return;
    }

    let rafId = 0;
    let hasRun = false;

    const runCountUp = () => {
      if (hasRun) return;
      hasRun = true;
      const startTime = performance.now();
      const { target, decimals } = parsed;

      const step = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - startTime) / durationMs));
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = target * eased;

        el.textContent =
          decimals > 0 ? current.toFixed(decimals) : String(Math.round(current));

        if (progress < 1) {
          rafId = requestAnimationFrame(step);
        } else {
          el.textContent = value;
        }
      };

      rafId = requestAnimationFrame(step);
    };

    let initialized = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (!initialized) {
          initialized = true;
          const vpH = entry.rootBounds?.height || window.innerHeight;
          if (entry.isIntersecting || entry.boundingClientRect.top <= vpH * 0.96) {
            observer.disconnect();
            runCountUp();
            return;
          }
        }

        if (entry.isIntersecting) {
          observer.disconnect();
          runCountUp();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [value, durationMs, parsed, reducedMotion]);

  return (
    <span ref={spanRef} className="tabular-nums">
      {value}
    </span>
  );
}
