"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";

export interface UseLiquidRippleOptions {
  baseFreqX?: number;
  baseFreqY?: number;
  maxScale?: number;
  enterImpulse?: number;
}

/**
 * Shared desktop-only SVG liquid distortion hook reacting continuously to pointer passes
 * (`onPointerEnter` / `onPointerMove`). Smoothly decays to rest with `0%` idle GPU usage.
 */
export function useLiquidRipple(options?: UseLiquidRippleOptions) {
  const baseFreqX = options?.baseFreqX ?? 0.012;
  const baseFreqY = options?.baseFreqY ?? 0.016;
  const maxScale = options?.maxScale ?? 26;
  const enterImpulse = options?.enterImpulse ?? 18;

  const { appearance } = usePortfolio();
  const rawId = useId();
  const filterId = `liquid-ripple-${rawId.replace(/:/g, "")}`;

  const turbRef = useRef<SVGFETurbulenceElement | null>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement | null>(null);

  const [supportsFinePointer, setSupportsFinePointer] = useState(false);
  const [filterMounted, setFilterMounted] = useState(false);

  const reducedMotion = resolveEffectiveReducedMotion(appearance);
  const eligible =
    Boolean(appearance.liquidDistortion) && supportsFinePointer && !reducedMotion;

  const rafRef = useRef(0);
  const hoveringRef = useRef(false);
  const stateRef = useRef({
    scale: 0,
    targetScale: 0,
    freqX: baseFreqX,
    freqY: baseFreqY,
    targetFreqX: baseFreqX,
    targetFreqY: baseFreqY,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    hasPointerSample: false,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const rafId = requestAnimationFrame(() => setSupportsFinePointer(mq.matches));
    const handleChange = (e: MediaQueryListEvent) =>
      setSupportsFinePointer(e.matches);
    mq.addEventListener("change", handleChange);
    return () => {
      cancelAnimationFrame(rafId);
      mq.removeEventListener("change", handleChange);
    };
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (!eligible) {
      stopLoop();
      hoveringRef.current = false;
      const rafId = requestAnimationFrame(() => setFilterMounted(false));
      return () => cancelAnimationFrame(rafId);
    }
    return () => {
      stopLoop();
    };
  }, [eligible, stopLoop]);

  const startLoop = useCallback(() => {
    if (rafRef.current) return;

    const tick = () => {
      const s = stateRef.current;

      // Decay impulse toward stillness so resting cursors settle calmly
      s.targetScale *= hoveringRef.current ? 0.91 : 0.84;
      s.scale += (s.targetScale - s.scale) * 0.24;

      s.targetFreqX += (baseFreqX - s.targetFreqX) * 0.08;
      s.targetFreqY += (baseFreqY - s.targetFreqY) * 0.08;
      s.freqX += (s.targetFreqX - s.freqX) * 0.2;
      s.freqY += (s.targetFreqY - s.freqY) * 0.2;

      if (dispRef.current) {
        dispRef.current.setAttribute("scale", s.scale.toFixed(2));
      }
      if (turbRef.current) {
        turbRef.current.setAttribute(
          "baseFrequency",
          `${s.freqX.toFixed(4)} ${s.freqY.toFixed(4)}`
        );
      }

      if (!hoveringRef.current && s.scale < 0.35 && s.targetScale < 0.25) {
        s.scale = 0;
        s.targetScale = 0;
        rafRef.current = 0;
        setFilterMounted(false);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [baseFreqX, baseFreqY]);

  const onPointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (!eligible) return;
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") {
        return;
      }

      hoveringRef.current = true;
      const s = stateRef.current;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.lastT = performance.now();
      s.hasPointerSample = true;
      s.targetScale = Math.max(s.targetScale, enterImpulse);
      s.targetFreqX = baseFreqX * 1.45;
      s.targetFreqY = baseFreqY * 1.45;

      setFilterMounted(true);
      startLoop();
    },
    [eligible, enterImpulse, baseFreqX, baseFreqY, startLoop]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!eligible) return;
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") {
        return;
      }

      const now = performance.now();
      const s = stateRef.current;
      hoveringRef.current = true;

      if (!s.hasPointerSample) {
        s.lastX = e.clientX;
        s.lastY = e.clientY;
        s.lastT = now;
        s.hasPointerSample = true;
      }

      const dx = Math.abs(e.clientX - s.lastX);
      const dy = Math.abs(e.clientY - s.lastY);
      const dt = Math.max(8, now - s.lastT);
      const speed = Math.hypot(dx, dy) / dt; // px per ms

      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.lastT = now;

      if (dx + dy > 0.5) {
        const boost = Math.min(maxScale, Math.max(10, 11 + speed * 14));
        s.targetScale = Math.max(s.targetScale, boost);
        s.targetFreqX = Math.min(0.032, baseFreqX + dy * 0.00035);
        s.targetFreqY = Math.min(0.036, baseFreqY + dx * 0.00035);
        setFilterMounted(true);
        startLoop();
      }
    },
    [eligible, maxScale, baseFreqX, baseFreqY, startLoop]
  );

  const onPointerLeave = useCallback(() => {
    hoveringRef.current = false;
    stateRef.current.hasPointerSample = false;
  }, []);

  return {
    filterId,
    turbRef,
    dispRef,
    filterActive: eligible && filterMounted,
    baseFrequencyDefault: `${baseFreqX} ${baseFreqY}`,
    pointerHandlers: eligible
      ? {
          onPointerEnter,
          onPointerMove,
          onPointerLeave,
        }
      : {},
  };
}
