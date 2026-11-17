"use client";

import React, { useRef, useEffect } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  APPEARANCE_SYNC_EVENT,
  resolveEffectiveReducedMotion,
} from "@/lib/appearance";

interface MagneticProps {
  children: React.ReactElement<{ className?: string }>;
  strength?: number;
  fullWidth?: boolean;
  className?: string;
}

/**
 * Pure GPU compositor magnetic pull scoped strictly to fine-pointer desktop devices
 * (`(hover: hover) and (pointer: fine)`). Zero external runtime dependency or touch overhead.
 */
export function Magnetic({
  children,
  strength = 0.35,
  fullWidth = false,
  className = "",
}: MagneticProps) {
  const { appearance } = usePortfolio();
  const magneticRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = magneticRef.current;
    if (!el) return;

    const isTouch = !window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches;
    if (isTouch) return;

    const isDisabled = () =>
      !appearance.magneticCursor || resolveEffectiveReducedMotion(appearance);

    let cachedRect: DOMRect | null = null;
    let rafId = 0;

    if (isDisabled()) {
      el.style.transition = "";
      el.style.transform = "";
    }

    const handleMouseEnter = () => {
      if (isDisabled()) return;
      cachedRect = el.getBoundingClientRect();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDisabled()) return;
      if (!cachedRect) {
        cachedRect = el.getBoundingClientRect();
      }
      const rect = cachedRect;
      const dx = (e.clientX - (rect.left + rect.width / 2)) * strength;
      const dy = (e.clientY - (rect.top + rect.height / 2)) * strength;

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        el.style.transition = "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0px)`;
      });
    };

    const handleMouseLeave = () => {
      cachedRect = null;
      cancelAnimationFrame(rafId);
      if (isDisabled()) {
        el.style.transition = "";
        el.style.transform = "";
        return;
      }
      el.style.transition =
        "transform 0.58s cubic-bezier(0.34, 1.56, 0.64, 1)";
      el.style.transform = "translate3d(0px, 0px, 0px)";
    };

    const handleSync = () => {
      if (isDisabled()) {
        cachedRect = null;
        cancelAnimationFrame(rafId);
        el.style.transition = "";
        el.style.transform = "";
      }
    };

    el.addEventListener("mouseenter", handleMouseEnter, { passive: true });
    el.addEventListener("mousemove", handleMouseMove, { passive: true });
    el.addEventListener("mouseleave", handleMouseLeave, { passive: true });
    window.addEventListener(APPEARANCE_SYNC_EVENT, handleSync);

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("mouseenter", handleMouseEnter);
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener(APPEARANCE_SYNC_EVENT, handleSync);
    };
  }, [strength, appearance]);

  return (
    <div
      ref={magneticRef}
      className={`${fullWidth ? "flex w-full" : "inline-block"} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
