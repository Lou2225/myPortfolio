"use client";

import { useEffect, useLayoutEffect } from "react";
import gsap from "gsap";

/**
 * SSR-safe layout effect hook so GSAP can commit initial hidden transforms
 * before first browser paint without Next.js server-render warnings.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface SearchRowStaggerOptions {
  selector?: string;
  maxRows?: number;
  fromOpacity?: number;
  fromY?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
}

/**
 * Shared sequential top-to-bottom GPU-only stagger reveal for search results.
 */
export function createSearchRowStaggerTween(
  container: HTMLElement | null,
  {
    selector = "[data-search-row]",
    maxRows = 14,
    fromOpacity = 0,
    fromY = 10,
    duration = 0.24,
    stagger = 0.024,
    ease = "power3.out",
  }: SearchRowStaggerOptions = {}
): gsap.core.Tween | null {
  if (!container) return null;
  const rows = container.querySelectorAll<HTMLElement>(selector);
  if (rows.length === 0) return null;

  const capped = Array.from(rows).slice(0, maxRows);
  return gsap.fromTo(
    capped,
    { opacity: fromOpacity, y: fromY },
    {
      opacity: 1,
      y: 0,
      duration,
      stagger,
      ease,
      force3D: true,
      clearProps: "transform,opacity",
    }
  );
}
