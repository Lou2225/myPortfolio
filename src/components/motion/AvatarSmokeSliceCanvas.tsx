"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { ImageTransform } from "@/types/portfolio";
import {
  applyCursorWakeToSmoke,
  computeAvatarDrawSpec,
  computeSliceNodeAlpha,
  emitAvatarSmokeImpact,
  interpolateSlashSegments,
  quantizeRgbChannel,
  sampleAvatarPixel,
  stepAvatarSmokePlumes,
  stepSliceNodes,
  type AvatarPixelGrid,
  type AvatarSmokePlume,
  type SliceTrailNode,
} from "@/lib/avatarSmokeSlice";

export interface AvatarSmokeSliceCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  imageSrc: string;
  transform?: ImageTransform;
  enabled: boolean;
  onCanvasReady: (ready: boolean) => void;
  onNaturalAspect?: (aspect: number) => void;
  onFirstSlice?: () => void;
}

function setDomPreviewHidden(
  container: HTMLElement | null | undefined,
  hidden: boolean
): void {
  const wrapper = container?.querySelector<HTMLElement>(
    '[data-avatar-ssr-img="true"]'
  );
  if (!wrapper) return;
  wrapper.style.opacity = hidden ? "0" : "";
  wrapper.style.visibility = hidden ? "hidden" : "";
}

const PIXEL_GRID_W = 128;
const PIXEL_GRID_H = 160;
// Generous borderless bleed around the cutout portrait so smoke billows freely across the Hero stage
const BLEED_X = 280;
const BLEED_TOP = 220;
const BLEED_BOTTOM = 28;
const MAX_TINT_CACHE = 72;

/**
 * Generates 4 organic, wispy fractal smoke alpha textures (128x128) once on startup:
 * overlapping asymmetric lobes + carved negative-space curl pockets (`destination-out`)
 * so every smoke plume looks like genuine turbulent vapor rather than flat circles or dust.
 */
function createFractalSmokeAlphaStamps(): HTMLCanvasElement[] {
  const presets = [
    {
      lobes: [
        { x: 64, y: 64, r: 44, a: 0.78 },
        { x: 42, y: 58, r: 32, a: 0.62 },
        { x: 84, y: 68, r: 33, a: 0.58 },
        { x: 60, y: 40, r: 28, a: 0.54 },
        { x: 74, y: 86, r: 27, a: 0.5 },
        { x: 34, y: 76, r: 22, a: 0.36 },
        { x: 96, y: 50, r: 20, a: 0.32 },
      ],
      carves: [
        { x: 52, y: 54, r: 16, a: 0.32 },
        { x: 78, y: 74, r: 15, a: 0.28 },
      ],
    },
    {
      lobes: [
        { x: 64, y: 64, r: 42, a: 0.76 },
        { x: 82, y: 48, r: 34, a: 0.6 },
        { x: 44, y: 74, r: 33, a: 0.58 },
        { x: 54, y: 44, r: 26, a: 0.5 },
        { x: 86, y: 80, r: 24, a: 0.44 },
        { x: 32, y: 52, r: 20, a: 0.34 },
      ],
      carves: [
        { x: 68, y: 56, r: 17, a: 0.34 },
        { x: 46, y: 66, r: 13, a: 0.26 },
      ],
    },
    {
      lobes: [
        { x: 64, y: 62, r: 46, a: 0.75 },
        { x: 40, y: 50, r: 30, a: 0.58 },
        { x: 88, y: 56, r: 28, a: 0.54 },
        { x: 62, y: 86, r: 31, a: 0.56 },
        { x: 48, y: 34, r: 22, a: 0.4 },
        { x: 82, y: 84, r: 22, a: 0.38 },
      ],
      carves: [
        { x: 58, y: 70, r: 18, a: 0.32 },
        { x: 74, y: 46, r: 14, a: 0.26 },
      ],
    },
    {
      lobes: [
        { x: 64, y: 64, r: 40, a: 0.8 },
        { x: 48, y: 72, r: 34, a: 0.62 },
        { x: 80, y: 58, r: 32, a: 0.6 },
        { x: 66, y: 38, r: 29, a: 0.52 },
        { x: 92, y: 72, r: 22, a: 0.38 },
        { x: 34, y: 62, r: 21, a: 0.36 },
      ],
      carves: [
        { x: 60, y: 58, r: 16, a: 0.3 },
        { x: 76, y: 70, r: 14, a: 0.28 },
      ],
    },
  ];

  return presets.map(({ lobes, carves }) => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext("2d");
    if (!ctx) return c;

    for (const lobe of lobes) {
      const grad = ctx.createRadialGradient(
        lobe.x,
        lobe.y,
        lobe.r * 0.05,
        lobe.x,
        lobe.y,
        lobe.r
      );
      grad.addColorStop(0, `rgba(255, 255, 255, ${lobe.a})`);
      grad.addColorStop(0.42, `rgba(255, 255, 255, ${lobe.a * 0.52})`);
      grad.addColorStop(0.76, `rgba(255, 255, 255, ${lobe.a * 0.16})`);
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lobe.x, lobe.y, lobe.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Carve wispy internal swirl pockets so clouds look turbulent and layered
    ctx.globalCompositeOperation = "destination-out";
    for (const hole of carves) {
      const grad = ctx.createRadialGradient(
        hole.x,
        hole.y,
        0,
        hole.x,
        hole.y,
        hole.r
      );
      grad.addColorStop(0, `rgba(0, 0, 0, ${hole.a})`);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    return c;
  });
}

function createRaggedCutoutStamps(
  alphaStamps: HTMLCanvasElement[]
): HTMLCanvasElement[] {
  return alphaStamps.map((stamp) => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext("2d");
    if (!ctx) return c;

    // Triple-stamp fractal wispy perimeter + wide 100% opaque center punch so the
    // avatar's outer silhouette edge completely dissolves with zero ghost outline
    ctx.drawImage(stamp, 0, 0);
    ctx.drawImage(stamp, 0, 0);
    ctx.drawImage(stamp, 0, 0);
    const core = ctx.createRadialGradient(64, 64, 6, 64, 64, 52);
    core.addColorStop(0, "rgba(0, 0, 0, 1)");
    core.addColorStop(0.72, "rgba(0, 0, 0, 1)");
    core.addColorStop(0.9, "rgba(0, 0, 0, 0.65)");
    core.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    return c;
  });
}

function drawImageWithSpec(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  transform?: ImageTransform
): void {
  const spec = computeAvatarDrawSpec({
    containerWidth: cw,
    containerHeight: ch,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    transform,
  });

  if (spec.drawW <= 0 || spec.drawH <= 0) return;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (spec.clipCircle) {
    const radius = Math.min(cw, ch) / 2;
    ctx.beginPath();
    ctx.arc(cw / 2, ch / 2, radius, 0, Math.PI * 2);
    ctx.clip();
  }
  if (spec.rotationRad === 0) {
    // Snap unrotated draw coordinates to exact pixel boundaries to prevent half-pixel bilinear blur
    const drawW = Math.round(spec.drawW);
    const drawH = Math.round(spec.drawH);
    const dx = Math.round(spec.centerX - drawW / 2);
    const dy = Math.round(spec.centerY - drawH / 2);
    ctx.drawImage(img, dx, dy, drawW, drawH);
  } else {
    ctx.translate(spec.centerX, spec.centerY);
    ctx.rotate(spec.rotationRad);
    ctx.drawImage(
      img,
      -spec.drawW / 2,
      -spec.drawH / 2,
      spec.drawW,
      spec.drawH
    );
  }
  ctx.restore();
}

/**
 * Borderless, zero-flicker volumetric avatar smoke-slice renderer.
 * Renders the cutout portrait on a generous borderless Hero bleed canvas so smoke
 * billows freely far outside the avatar's bounding box with zero invisible edge wall.
 * Every smoke plume is tinted from the exact RGBA pixels of the avatar under impact.
 */
export function AvatarSmokeSliceCanvas({
  containerRef,
  imageSrc,
  transform,
  enabled,
  onCanvasReady,
  onNaturalAspect,
  onFirstSlice,
}: AvatarSmokeSliceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const portraitCacheRef = useRef<HTMLCanvasElement | null>(null);
  const slicedPortraitRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelGridRef = useRef<AvatarPixelGrid | null>(null);

  const alphaStampsRef = useRef<HTMLCanvasElement[] | null>(null);
  const maskStampsRef = useRef<HTMLCanvasElement[] | null>(null);
  const tintedStampCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const loadedImgRef = useRef<HTMLImageElement | null>(null);
  const dimsRef = useRef<{
    w: number;
    h: number;
    bleedX: number;
    bleedTop: number;
    bleedBottom: number;
    dpr: number;
  }>({
    w: 0,
    h: 0,
    bleedX: BLEED_X,
    bleedTop: BLEED_TOP,
    bleedBottom: BLEED_BOTTOM,
    dpr: 1,
  });

  const nodesRef = useRef<SliceTrailNode[]>([]);
  const plumesRef = useRef<AvatarSmokePlume[]>([]);
  const pointerRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
    inside: boolean;
    stepAccum: number;
  }>({ x: 0, y: 0, vx: 0, vy: 0, t: 0, inside: false, stepAccum: 0 });

  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const elapsedSecRef = useRef(0);
  const readyLatchedRef = useRef(false);
  const inViewRef = useRef(true);
  const hasSlicedOnceRef = useRef(false);

  const onCanvasReadyRef = useRef(onCanvasReady);
  const onNaturalAspectRef = useRef(onNaturalAspect);
  const onFirstSliceRef = useRef(onFirstSlice);
  useEffect(() => {
    onCanvasReadyRef.current = onCanvasReady;
    onNaturalAspectRef.current = onNaturalAspect;
    onFirstSliceRef.current = onFirstSlice;
  }, [onCanvasReady, onNaturalAspect, onFirstSlice]);

  const ensureStamps = useCallback(() => {
    if (!alphaStampsRef.current) {
      const alphas = createFractalSmokeAlphaStamps();
      alphaStampsRef.current = alphas;
      maskStampsRef.current = createRaggedCutoutStamps(alphas);
    }
  }, []);

  const getTintedSmokeStamp = useCallback(
    (r: number, g: number, b: number, stampIdx: number): HTMLCanvasElement | null => {
      ensureStamps();
      const alphas = alphaStampsRef.current;
      if (!alphas || alphas.length === 0) return null;

      const idx = stampIdx % alphas.length;
      const qr = quantizeRgbChannel(r, 20);
      const qg = quantizeRgbChannel(g, 20);
      const qb = quantizeRgbChannel(b, 20);
      const key = `${idx}:${qr},${qg},${qb}`;

      const cache = tintedStampCacheRef.current;
      const hit = cache.get(key);
      if (hit) return hit;

      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(alphas[idx], 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = `rgb(${qr}, ${qg}, ${qb})`;
      ctx.fillRect(0, 0, 128, 128);
      ctx.globalCompositeOperation = "source-over";

      if (cache.size >= MAX_TINT_CACHE) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }
      cache.set(key, c);
      return c;
    },
    [ensureStamps]
  );

  const paintRestingPortrait = useCallback(() => {
    const canvas = canvasRef.current;
    const portraitCache = portraitCacheRef.current;
    if (!canvas || !portraitCache) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { bleedX, bleedTop, dpr } = dimsRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(
      portraitCache,
      Math.round(bleedX * dpr),
      Math.round(bleedTop * dpr)
    );
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const rebuildPortraitCache = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const img = loadedImgRef.current;
    if (!container || !canvas || !img || !img.complete || img.naturalWidth <= 0) {
      return false;
    }

    const rect = container.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w <= 0 || h <= 0) return false;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bleedX = BLEED_X;
    const bleedTop = BLEED_TOP;
    const bleedBottom = BLEED_BOTTOM;
    dimsRef.current = { w, h, bleedX, bleedTop, bleedBottom, dpr };

    const stageCssW = w + bleedX * 2;
    const stageCssH = h + bleedTop + bleedBottom;
    const portraitPixelW = Math.max(1, Math.round(w * dpr));
    const portraitPixelH = Math.max(1, Math.round(h * dpr));
    const stagePixelW = Math.max(1, Math.round(stageCssW * dpr));
    const stagePixelH = Math.max(1, Math.round(stageCssH * dpr));

    if (canvas.width !== stagePixelW || canvas.height !== stagePixelH) {
      canvas.width = stagePixelW;
      canvas.height = stagePixelH;
    }
    canvas.style.width = `${stageCssW}px`;
    canvas.style.height = `${stageCssH}px`;

    const portraitCache = document.createElement("canvas");
    portraitCache.width = portraitPixelW;
    portraitCache.height = portraitPixelH;

    const pCtx = portraitCache.getContext("2d");
    if (!pCtx) return false;
    pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pCtx.clearRect(0, 0, w, h);
    drawImageWithSpec(pCtx, img, w, h, transform);
    portraitCacheRef.current = portraitCache;

    const slicedPortrait = document.createElement("canvas");
    slicedPortrait.width = portraitPixelW;
    slicedPortrait.height = portraitPixelH;
    slicedPortraitRef.current = slicedPortrait;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = portraitPixelW;
    maskCanvas.height = portraitPixelH;
    maskCanvasRef.current = maskCanvas;

    try {
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = PIXEL_GRID_W;
      sampleCanvas.height = PIXEL_GRID_H;
      const sCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (sCtx) {
        sCtx.clearRect(0, 0, PIXEL_GRID_W, PIXEL_GRID_H);
        sCtx.drawImage(portraitCache, 0, 0, PIXEL_GRID_W, PIXEL_GRID_H);
        const imgData = sCtx.getImageData(0, 0, PIXEL_GRID_W, PIXEL_GRID_H);
        pixelGridRef.current = {
          width: PIXEL_GRID_W,
          height: PIXEL_GRID_H,
          data: imgData.data,
        };
      }
    } catch {
      pixelGridRef.current = null;
    }

    if (!rafRef.current) {
      paintRestingPortrait();
    }

    // Synchronously hide the underlying DOM <img> wrapper the exact instant the canvas
    // is painted so the static DOM avatar edge can NEVER peek through a smoke slice!
    setDomPreviewHidden(container, true);

    if (!readyLatchedRef.current) {
      readyLatchedRef.current = true;
      onCanvasReadyRef.current(true);
    }

    return true;
  }, [containerRef, paintRestingPortrait, transform]);

  const startLoop = useCallback(() => {
    if (rafRef.current) return;
    lastFrameRef.current = performance.now();

    const tick = (now: number) => {
      if (!inViewRef.current || document.hidden) {
        nodesRef.current = [];
        plumesRef.current = [];
        stopLoop();
        paintRestingPortrait();
        return;
      }

      const dtMs = lastFrameRef.current
        ? Math.min(40, Math.max(4, now - lastFrameRef.current))
        : 16.67;
      lastFrameRef.current = now;
      const dtSec = dtMs / 1000;
      elapsedSecRef.current += dtSec;

      nodesRef.current = stepSliceNodes(nodesRef.current, dtSec);
      plumesRef.current = stepAvatarSmokePlumes(
        plumesRef.current,
        dtSec,
        elapsedSecRef.current
      );

      const nodes = nodesRef.current;
      const plumes = plumesRef.current;

      const canvas = canvasRef.current;
      const portraitCache = portraitCacheRef.current;
      const slicedPortrait = slicedPortraitRef.current;
      const maskCanvas = maskCanvasRef.current;
      const { w, h, bleedX, bleedTop, dpr } = dimsRef.current;

      if (nodes.length === 0 && plumes.length === 0) {
        paintRestingPortrait();
        rafRef.current = 0;
        lastFrameRef.current = 0;
        return;
      }

      if (
        !canvas ||
        !portraitCache ||
        !slicedPortrait ||
        !maskCanvas ||
        w <= 0 ||
        h <= 0
      ) {
        rafRef.current = 0;
        return;
      }

      ensureStamps();
      const maskStamps = maskStampsRef.current;
      const mainCtx = canvas.getContext("2d");
      const slicedCtx = slicedPortrait.getContext("2d");
      const maskCtx = maskCanvas.getContext("2d");
      if (!mainCtx || !slicedCtx || !maskCtx || !maskStamps) {
        rafRef.current = 0;
        return;
      }

      // 1. Compose wispy smoke-edged portrait cutout on compact offscreen portrait buffer
      slicedCtx.setTransform(1, 0, 0, 1, 0, 0);
      slicedCtx.clearRect(0, 0, slicedPortrait.width, slicedPortrait.height);
      slicedCtx.globalCompositeOperation = "source-over";
      slicedCtx.globalAlpha = 1;
      slicedCtx.drawImage(portraitCache, 0, 0);

      if (nodes.length > 0 || plumes.length > 0) {
        maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        maskCtx.clearRect(0, 0, w, h);

        for (let i = 0; i < nodes.length; i += 1) {
          const n = nodes[i];
          const alpha = computeSliceNodeAlpha(n.age, n.maxLife);
          if (alpha <= 0.01) continue;
          const progress = n.age / n.maxLife;
          const scaleCurve =
            progress < 0.28
              ? 0.92 + (progress / 0.28) * 0.32
              : 1.24 - ((progress - 0.28) / 0.72) * 0.26;
          const rx = n.baseRadius * scaleCurve * n.elongation;
          const ry = n.baseRadius * scaleCurve;
          const stamp = maskStamps[n.stampIdx % maskStamps.length];

          maskCtx.save();
          maskCtx.globalAlpha = alpha;
          maskCtx.translate(n.x, n.y);
          maskCtx.rotate(n.slashAngle);
          maskCtx.drawImage(stamp, -rx, -ry, rx * 2, ry * 2);
          maskCtx.restore();
        }

        // Erode the avatar's outer edge wherever smoke plumes splash over it so the hard
        // silhouette line dissolves into the billowing smoke instead of showing through!
        for (let i = 0; i < plumes.length; i += 1) {
          const p = plumes[i];
          const t = p.age / p.maxLife;
          if (t >= 0.78) continue;
          const erodeAlpha = Math.pow(1 - t / 0.78, 1.35) * (p.kind === "billow" ? 0.96 : 0.82);
          if (erodeAlpha <= 0.02) continue;

          const stamp = maskStamps[p.stampIdx % maskStamps.length];
          const rx = p.radius * p.stretch * 0.92;
          const ry = p.radius * 0.92;

          maskCtx.save();
          maskCtx.globalAlpha = erodeAlpha;
          maskCtx.translate(p.x, p.y);
          maskCtx.rotate(p.angle);
          maskCtx.drawImage(stamp, -rx, -ry, rx * 2, ry * 2);
          maskCtx.restore();
        }

        slicedCtx.globalCompositeOperation = "destination-out";
        slicedCtx.drawImage(maskCanvas, 0, 0);
      }

      // 2. Blit sliced portrait onto the borderless full-bleed Hero stage canvas
      mainCtx.setTransform(1, 0, 0, 1, 0, 0);
      mainCtx.clearRect(0, 0, canvas.width, canvas.height);
      mainCtx.globalCompositeOperation = "source-over";
      mainCtx.globalAlpha = 1;
      mainCtx.drawImage(
        slicedPortrait,
        Math.round(bleedX * dpr),
        Math.round(bleedTop * dpr)
      );

      // 3. Render volumetric avatar-colored fractal smoke plumes freely across the entire bleed stage!
      mainCtx.setTransform(dpr, 0, 0, dpr, bleedX * dpr, bleedTop * dpr);
      mainCtx.globalCompositeOperation = "source-over";

      for (let i = 0; i < plumes.length; i += 1) {
        const p = plumes[i];
        const t = p.age / p.maxLife;
        const fadeIn = t < 0.12 ? t / 0.12 : 1;
        const fadeOut = Math.pow(1 - t, 1.5);
        const alpha = p.peakAlpha * fadeIn * fadeOut;
        if (alpha <= 0.01) continue;

        const stamp = getTintedSmokeStamp(p.r, p.g, p.b, p.stampIdx);
        if (!stamp) continue;

        const rx = p.radius * p.stretch;
        const ry = p.radius;

        mainCtx.save();
        mainCtx.globalAlpha = alpha;
        mainCtx.translate(p.x, p.y);
        mainCtx.rotate(p.angle);
        mainCtx.drawImage(stamp, -rx, -ry, rx * 2, ry * 2);
        mainCtx.restore();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [ensureStamps, getTintedSmokeStamp, paintRestingPortrait, stopLoop]);

  // Attach cleanly to the rendered DOM <img> (zero re-download, zero flicker)
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!enabled || !imageSrc) {
      loadedImgRef.current = null;
      pixelGridRef.current = null;
      nodesRef.current = [];
      plumesRef.current = [];
      tintedStampCacheRef.current.clear();
      readyLatchedRef.current = false;
      stopLoop();
      setDomPreviewHidden(containerEl, false);
      const rafId = requestAnimationFrame(() => onCanvasReadyRef.current(false));
      return () => cancelAnimationFrame(rafId);
    }

    let cancelled = false;
    readyLatchedRef.current = false;
    tintedStampCacheRef.current.clear();

    const loadBitmap = () => {
      const container = containerRef.current;
      const domImg = container?.querySelector("img") ?? null;

      const adoptImage = (img: HTMLImageElement) => {
        if (cancelled) return;
        loadedImgRef.current = img;
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          onNaturalAspectRef.current?.(img.naturalWidth / img.naturalHeight);
        }
        rebuildPortraitCache();
      };

      if (domImg && domImg.complete && domImg.naturalWidth > 0) {
        adoptImage(domImg);
        if (pixelGridRef.current) return;
      }

      const corsImg = new window.Image();
      corsImg.crossOrigin = "anonymous";
      corsImg.decoding = "async";
      corsImg.onload = () => adoptImage(corsImg);
      corsImg.onerror = () => {
        if (cancelled) return;
        if (domImg && domImg.complete && domImg.naturalWidth > 0) {
          adoptImage(domImg);
          return;
        }
        const plainImg = new window.Image();
        plainImg.decoding = "async";
        plainImg.onload = () => adoptImage(plainImg);
        plainImg.src = imageSrc;
      };
      corsImg.src = imageSrc;
    };

    const domImg = containerRef.current?.querySelector("img") ?? null;
    if (domImg && !domImg.complete) {
      const onDomLoad = () => loadBitmap();
      domImg.addEventListener("load", onDomLoad, { once: true });
      return () => {
        cancelled = true;
        domImg.removeEventListener("load", onDomLoad);
      };
    }

    loadBitmap();
    return () => {
      cancelled = true;
      setDomPreviewHidden(containerEl, false);
    };
  }, [containerRef, enabled, imageSrc, rebuildPortraitCache, stopLoop]);

  // Keep portrait cache synced seamlessly on resize / aspect / transform changes
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    rebuildPortraitCache();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      rebuildPortraitCache();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, enabled, rebuildPortraitCache]);

  // Pause immediately when Hero scrolls out of viewport or tab goes hidden (0% idle CPU/GPU)
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((entry) => entry.isIntersecting);
          inViewRef.current = visible;
          if (!visible && rafRef.current) {
            nodesRef.current = [];
            plumesRef.current = [];
            stopLoop();
            paintRestingPortrait();
          }
        },
        { threshold: 0.05 }
      );
      io.observe(container);
    }

    const onVisibilityChange = () => {
      if (document.hidden && rafRef.current) {
        nodesRef.current = [];
        plumesRef.current = [];
        stopLoop();
        paintRestingPortrait();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopLoop();
    };
  }, [containerRef, enabled, paintRestingPortrait, stopLoop]);

  // Track pointer across the expanded borderless Hero bleed zone so smoke can be
  // stirred freely even outside the avatar's silhouette while slicing strictly hits opaque pixels!
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") {
        return;
      }
      if (!inViewRef.current || !loadedImgRef.current) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const p = pointerRef.current;

      // Outside the expanded borderless stage -> reset pointer sample cleanly (0 work)
      if (
        x < -BLEED_X ||
        x > rect.width + BLEED_X ||
        y < -BLEED_TOP ||
        y > rect.height + BLEED_BOTTOM
      ) {
        p.inside = false;
        p.vx = 0;
        p.vy = 0;
        return;
      }

      if (dimsRef.current.w <= 0 || !portraitCacheRef.current) {
        if (!rebuildPortraitCache()) return;
      }

      const now = performance.now();
      if (!p.inside) {
        p.inside = true;
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.t = now;
        p.stepAccum = 0;
        return;
      }

      const dx = x - p.x;
      const dy = y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1.2) return;

      const dtMs = Math.max(6, Math.min(64, now - p.t));
      const dtSec = dtMs / 1000;
      const instVx = dx / dtSec;
      const instVy = dy / dtSec;
      const smoothVx = p.vx * 0.35 + instVx * 0.65;
      const smoothVy = p.vy * 0.35 + instVy * 0.65;

      // Push & curl floating smoke clouds anywhere inside the borderless stage!
      if (plumesRef.current.length > 0) {
        applyCursorWakeToSmoke({
          plumes: plumesRef.current,
          cursorX: x,
          cursorY: y,
          cursorVx: smoothVx,
          cursorVy: smoothVy,
          dtSec,
        });
      }

      const samples = interpolateSlashSegments(p.x, p.y, x, y, 11, 18);
      let hitAnyOpaque = false;

      for (let i = 0; i < samples.length; i += 1) {
        const pt = samples[i];
        if (pt.x < 0 || pt.x > rect.width || pt.y < 0 || pt.y > rect.height) {
          continue;
        }
        const normX = pt.x / rect.width;
        const normY = pt.y / rect.height;
        const pixel = sampleAvatarPixel(pixelGridRef.current, normX, normY);

        if (pixel.hit) {
          hitAnyOpaque = true;
          p.stepAccum += 1;
          emitAvatarSmokeImpact({
            nodes: nodesRef.current,
            plumes: plumesRef.current,
            x: pt.x,
            y: pt.y,
            cursorVx: smoothVx,
            cursorVy: smoothVy,
            pixel,
            emitBillow:
              p.stepAccum % 2 === 0 || Math.hypot(smoothVx, smoothVy) > 550,
          });
        }
      }

      p.x = x;
      p.y = y;
      p.vx = smoothVx;
      p.vy = smoothVy;
      p.t = now;

      if (hitAnyOpaque) {
        if (!hasSlicedOnceRef.current) {
          hasSlicedOnceRef.current = true;
          onFirstSliceRef.current?.();
        }
        startLoop();
      }
    };

    const handleWindowPointerLeave = () => {
      pointerRef.current.inside = false;
      pointerRef.current.vx = 0;
      pointerRef.current.vy = 0;
    };

    window.addEventListener("pointermove", handleWindowPointerMove, {
      passive: true,
    });
    document.addEventListener("pointerleave", handleWindowPointerLeave, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      document.removeEventListener("pointerleave", handleWindowPointerLeave);
    };
  }, [containerRef, enabled, rebuildPortraitCache, startLoop]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        left: `-${BLEED_X}px`,
        top: `-${BLEED_TOP}px`,
        width: `calc(100% + ${BLEED_X * 2}px)`,
        height: `calc(100% + ${BLEED_TOP + BLEED_BOTTOM}px)`,
      }}
      className="absolute pointer-events-none z-10 max-w-none"
    />
  );
}
