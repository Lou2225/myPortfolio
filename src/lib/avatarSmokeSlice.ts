import { ImageTransform } from "@/types/portfolio";
import {
  computeImageStageMatrix,
  isIdentityImageTransform,
} from "@/lib/imageTransform";

export interface AvatarDrawSpec {
  centerX: number;
  centerY: number;
  drawW: number;
  drawH: number;
  rotationRad: number;
  clipCircle: boolean;
}

export interface AvatarPixelGrid {
  width: number;
  height: number;
  /** Packed RGBA bytes (length = width * height * 4) */
  data: Uint8ClampedArray;
}

export interface SampledAvatarPixel {
  hit: boolean;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SliceTrailNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  age: number;
  maxLife: number;
  slashAngle: number;
  elongation: number;
  spin: number;
  stampIdx: number;
}

export type SmokePlumeKind = "billow" | "wisp" | "tendril";

export interface AvatarSmokePlume {
  kind: SmokePlumeKind;
  /** Position in portrait-local coordinates (can freely exceed 0..w / 0..h into the borderless stage bleed!) */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Exact sampled RGB of the avatar pixel at impact (never generic white) */
  r: number;
  g: number;
  b: number;
  radius: number;
  growthRate: number;
  stretch: number;
  age: number;
  maxLife: number;
  angle: number;
  spin: number;
  phase: number;
  peakAlpha: number;
  dragPerFrame: number;
  buoyancy: number;
  stampIdx: number;
}

export const MAX_SLICE_NODES = 135;
export const MAX_SMOKE_PLUMES = 165;
export const AVATAR_ALPHA_THRESHOLD = 46;

/**
 * Clamps a portrait's natural aspect ratio into a balanced Hero stage proportion so
 * wide cutouts never feel cramped and tall cutouts never grow overly narrow.
 */
export function resolveSmartAvatarAspect(
  naturalWidth: number,
  naturalHeight: number
): number {
  if (naturalWidth <= 0 || naturalHeight <= 0) return 0.82;
  const raw = naturalWidth / naturalHeight;
  return Number(Math.min(1.38, Math.max(0.62, raw)).toFixed(3));
}

/**
 * Quantizes an RGB channel for ultra-fast tinted fractal smoke stamp caching while
 * faithfully preserving every avatar tone (skin, hair, fabric, shadows, highlights).
 */
export function quantizeRgbChannel(channel: number, step = 20): number {
  const clamped = Math.min(255, Math.max(0, Math.round(channel)));
  return Math.min(255, Math.round(clamped / step) * step);
}

/**
 * Computes exact canvas draw geometry matching both default `object-contain object-bottom`
 * `<Image />` and custom `<TransformedImage />` matrix transforms.
 */
export function computeAvatarDrawSpec(params: {
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  transform?: ImageTransform | null;
}): AvatarDrawSpec {
  const {
    containerWidth: cw,
    containerHeight: ch,
    naturalWidth: nw,
    naturalHeight: nh,
    transform,
  } = params;

  if (cw <= 0 || ch <= 0 || nw <= 0 || nh <= 0) {
    return {
      centerX: cw / 2,
      centerY: ch / 2,
      drawW: 0,
      drawH: 0,
      rotationRad: 0,
      clipCircle: false,
    };
  }

  const useCustom =
    Boolean(transform) && !isIdentityImageTransform(transform, "squircle");

  if (!useCustom || !transform) {
    const scale = Math.min(cw / nw, ch / nh);
    const drawW = nw * scale;
    const drawH = nh * scale;
    return {
      centerX: cw / 2,
      centerY: ch - drawH / 2,
      drawW,
      drawH,
      rotationRad: 0,
      clipCircle: false,
    };
  }

  const matrix = computeImageStageMatrix({
    containerWidth: cw,
    containerHeight: ch,
    naturalWidth: nw,
    naturalHeight: nh,
    transform,
  });

  return {
    centerX: cw / 2 + matrix.translateX,
    centerY: ch / 2 + matrix.translateY,
    drawW: nw * matrix.scale,
    drawH: nh * matrix.scale,
    rotationRad: (matrix.rotationDeg * Math.PI) / 180,
    clipCircle: Boolean(transform.clipCircle),
  };
}

/**
 * Subdivides pointer swipes into continuous closely spaced points so rapid slashes
 * produce an unbroken billowing smoke ribbon instead of disconnected stamps.
 */
export function interpolateSlashSegments(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  spacingPx = 10,
  maxSteps = 20
): Array<{ x: number; y: number }> {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) {
    return [{ x: x1, y: y1 }];
  }

  const steps = Math.min(
    maxSteps,
    Math.max(1, Math.ceil(dist / Math.max(2, spacingPx)))
  );
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    points.push({
      x: x0 + dx * t,
      y: y0 + dy * t,
    });
  }
  return points;
}

/**
 * Samples the exact RGBA pixel from the cutout avatar's silhouette grid.
 * Ignores empty transparent background and faint cutout halos (`alpha < threshold`).
 */
export function sampleAvatarPixel(
  grid: AvatarPixelGrid | null,
  normX: number,
  normY: number,
  threshold = AVATAR_ALPHA_THRESHOLD
): SampledAvatarPixel {
  if (!grid || grid.width <= 0 || grid.height <= 0) {
    return { hit: true, r: 92, g: 88, b: 84, a: 220 };
  }
  if (normX < 0 || normX > 1 || normY < 0 || normY > 1) {
    return { hit: false, r: 0, g: 0, b: 0, a: 0 };
  }

  const cx = Math.min(grid.width - 1, Math.max(0, Math.floor(normX * grid.width)));
  const cy = Math.min(
    grid.height - 1,
    Math.max(0, Math.floor(normY * grid.height))
  );

  const centerOffset = (cy * grid.width + cx) * 4;
  const centerA = grid.data[centerOffset + 3];
  if (centerA >= threshold) {
    return {
      hit: true,
      r: grid.data[centerOffset],
      g: grid.data[centerOffset + 1],
      b: grid.data[centerOffset + 2],
      a: centerA,
    };
  }

  // Soft 2-cell border neighborhood so slicing across the outer rim of the avatar
  // triggers full edge dissolution instead of leaving a thin uncut outline
  for (let radius = 1; radius <= 2; radius += 1) {
    for (let oy = -radius; oy <= radius; oy += 1) {
      const py = cy + oy;
      if (py < 0 || py >= grid.height) continue;
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (Math.abs(ox) !== radius && Math.abs(oy) !== radius) continue;
        const px = cx + ox;
        if (px < 0 || px >= grid.width) continue;
        const idx = (py * grid.width + px) * 4;
        const a = grid.data[idx + 3];
        if (a >= threshold + 16) {
          return {
            hit: true,
            r: grid.data[idx],
            g: grid.data[idx + 1],
            b: grid.data[idx + 2],
            a,
          };
        }
      }
    }
  }

  return { hit: false, r: 0, g: 0, b: 0, a: 0 };
}

/**
 * Evaluates normalized slice-cutout opacity over a node's lifetime:
 * holds full 1.0 erasure across the active splash so 0% of the avatar's hard edge
 * remains visible through the smoke, then smoothly reforms back into the portrait.
 */
export function computeSliceNodeAlpha(age: number, maxLife: number): number {
  if (maxLife <= 0 || age >= maxLife) return 0;
  const p = Math.max(0, Math.min(1, age / maxLife));
  if (p <= 0.46) {
    return 1;
  }
  const fadeT = (p - 0.46) / 0.54;
  return Math.max(0, Math.min(1, Math.pow(1 - fadeT, 1.55)));
}

/**
 * Advances slice cutout nodes along their impact drift with fluid deceleration.
 */
export function stepSliceNodes(
  nodes: SliceTrailNode[],
  dtSec: number
): SliceTrailNode[] {
  const next: SliceTrailNode[] = [];
  const damping = Math.pow(0.915, dtSec * 60);

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    const age = n.age + dtSec;
    if (age >= n.maxLife) continue;

    n.age = age;
    n.x += n.vx * dtSec;
    n.y += (n.vy - 6) * dtSec;
    n.vx *= damping;
    n.vy *= damping;
    n.slashAngle += n.spin * dtSec;
    next.push(n);
  }
  return next;
}

/**
 * Applies live aerodynamic wake & vortex curl from the moving cursor to floating
 * avatar smoke plumes anywhere across the expanded borderless Hero stage.
 */
export function applyCursorWakeToSmoke(params: {
  plumes: AvatarSmokePlume[];
  cursorX: number;
  cursorY: number;
  cursorVx: number;
  cursorVy: number;
  dtSec: number;
  wakeRadius?: number;
}): void {
  const {
    plumes,
    cursorX,
    cursorY,
    cursorVx,
    cursorVy,
    dtSec,
    wakeRadius = 128,
  } = params;

  const speed = Math.hypot(cursorVx, cursorVy);
  if (speed < 20 || plumes.length === 0) return;

  const rSqMax = wakeRadius * wakeRadius;
  const dirX = cursorVx / speed;
  const dirY = cursorVy / speed;
  const perpX = -dirY;
  const perpY = dirX;
  const impulseScale = Math.min(1.6, dtSec * 12);

  for (let i = 0; i < plumes.length; i += 1) {
    const p = plumes[i];
    const dx = p.x - cursorX;
    const dy = p.y - cursorY;
    const dSq = dx * dx + dy * dy;
    if (dSq >= rSqMax || dSq < 1) continue;

    const dist = Math.sqrt(dSq);
    const falloff = Math.pow(1 - dist / wakeRadius, 1.6);
    const sideSign = dx * perpX + dy * perpY >= 0 ? 1 : -1;

    // Von Karman vortex shed: forward slipstream + lateral curling swirl + angular spin
    const carry = p.kind === "billow" ? 0.36 : p.kind === "wisp" ? 0.46 : 0.58;
    p.vx +=
      (cursorVx * carry + perpX * sideSign * speed * 0.24) *
      falloff *
      impulseScale;
    p.vy +=
      (cursorVy * carry + perpY * sideSign * speed * 0.24) *
      falloff *
      impulseScale;
    p.spin += sideSign * falloff * Math.min(2.2, speed / 480) * dtSec * 3.5;
  }
}

/**
 * Advances volumetric avatar smoke plumes using 2D curl-noise eddies, aerodynamic
 * viscosity, natural expansion, and silky buoyancy.
 */
export function stepAvatarSmokePlumes(
  plumes: AvatarSmokePlume[],
  dtSec: number,
  elapsedSec: number
): AvatarSmokePlume[] {
  const next: AvatarSmokePlume[] = [];
  const frames = dtSec * 60;

  for (let i = 0; i < plumes.length; i += 1) {
    const p = plumes[i];
    const age = p.age + dtSec;
    if (age >= p.maxLife) continue;

    const drag = Math.pow(p.dragPerFrame, frames);
    const swirlAmp = p.kind === "billow" ? 32 : p.kind === "wisp" ? 42 : 24;
    const curlX =
      Math.sin(p.y * 0.017 + elapsedSec * 1.45 + p.phase) * swirlAmp;
    const curlY =
      Math.cos(p.x * 0.017 - elapsedSec * 1.2 + p.phase) * swirlAmp;

    p.age = age;
    p.x += (p.vx + curlX) * dtSec;
    p.y += (p.vy + curlY + p.buoyancy) * dtSec;
    p.vx *= drag;
    p.vy *= drag;
    p.radius += p.growthRate * dtSec;
    // Smoke gently relaxes its initial slash stretch as it expands into billowing vapor
    p.stretch = 1 + (p.stretch - 1) * Math.pow(0.95, frames);
    p.angle += p.spin * dtSec;
    next.push(p);
  }
  return next;
}

/**
 * Emits a ragged smoky cutout + volumetric multi-layered avatar-colored smoke plumes
 * (dark internal body + lighter outer curling wisps) following the cursor's exact impact.
 */
export function emitAvatarSmokeImpact(params: {
  nodes: SliceTrailNode[];
  plumes: AvatarSmokePlume[];
  x: number;
  y: number;
  cursorVx: number;
  cursorVy: number;
  pixel: SampledAvatarPixel;
  emitBillow: boolean;
  rng?: () => number;
}): void {
  const {
    nodes,
    plumes,
    x,
    y,
    cursorVx,
    cursorVy,
    pixel,
    emitBillow,
    rng = Math.random,
  } = params;

  if (!pixel.hit) return;

  const rawSpeed = Math.hypot(cursorVx, cursorVy);
  const clampedSpeed = Math.min(2500, Math.max(70, rawSpeed));
  const dirX = rawSpeed > 1 ? cursorVx / rawSpeed : 1;
  const dirY = rawSpeed > 1 ? cursorVy / rawSpeed : 0;
  const perpX = -dirY;
  const perpY = dirX;
  const slashAngle = Math.atan2(dirY, dirX);
  const speedNorm = Math.min(1, clampedSpeed / 1450);

  // 1. Wispy smoky cutout node parting the portrait to reveal the giant name behind it
  const baseRadius = 30 + speedNorm * 28 + (rng() - 0.5) * 6;
  nodes.push({
    x,
    y,
    vx: dirX * clampedSpeed * 0.065 + (rng() - 0.5) * 14,
    vy: dirY * clampedSpeed * 0.065 - 7,
    baseRadius,
    age: 0,
    maxLife: 1.4 + rng() * 0.45,
    slashAngle: slashAngle + (rng() - 0.5) * 0.35,
    elongation: 1.22 + speedNorm * 0.45,
    spin: (rng() - 0.5) * 0.55,
    stampIdx: Math.floor(rng() * 4),
  });

  if (nodes.length > MAX_SLICE_NODES) {
    nodes.splice(0, nodes.length - MAX_SLICE_NODES);
  }

  const toneColor = (scale: number) => ({
    r: Math.min(255, Math.max(0, Math.round(pixel.r * scale))),
    g: Math.min(255, Math.max(0, Math.round(pixel.g * scale))),
    b: Math.min(255, Math.max(0, Math.round(pixel.b * scale))),
  });

  // 2. Dense volumetric avatar-pigment smoke billow (two-tone depth: shaded core + curling outer vapor)
  if (emitBillow) {
    const flank = rng() > 0.5 ? 1 : -1;
    const forward = clampedSpeed * (0.22 + rng() * 0.24);
    const lateral = flank * (18 + clampedSpeed * (0.065 + rng() * 0.085));
    const coreColor = toneColor(0.84 + rng() * 0.14);

    plumes.push({
      kind: "billow",
      x: x + perpX * flank * (baseRadius * 0.18),
      y: y + perpY * flank * (baseRadius * 0.18),
      vx: dirX * forward + perpX * lateral,
      vy: dirY * forward + perpY * lateral,
      r: coreColor.r,
      g: coreColor.g,
      b: coreColor.b,
      radius: 24 + rng() * 14 + speedNorm * 14,
      growthRate: 28 + rng() * 20,
      stretch: 1.15 + speedNorm * 0.55,
      age: 0,
      maxLife: 1.2 + rng() * 0.85,
      angle: slashAngle + (rng() - 0.5) * 0.5,
      spin: flank * (0.55 + rng() * 0.95),
      phase: rng() * Math.PI * 2,
      peakAlpha: 0.56 + rng() * 0.2,
      dragPerFrame: 0.946,
      buoyancy: -(12 + rng() * 14),
      stampIdx: Math.floor(rng() * 4),
    });
  }

  // 3. Swirling wispy outer smoke ribbons curling off the impact slipstream
  const wispFlank = rng() > 0.5 ? 1 : -1;
  const wispForward = clampedSpeed * (0.3 + rng() * 0.28);
  const wispLateral = wispFlank * (26 + clampedSpeed * (0.09 + rng() * 0.09));
  const wispColor = toneColor(1.0 + rng() * 0.14);

  plumes.push({
    kind: "wisp",
    x: x + (rng() - 0.5) * 10,
    y: y + (rng() - 0.5) * 10,
    vx: dirX * wispForward + perpX * wispLateral,
    vy: dirY * wispForward + perpY * wispLateral,
    r: wispColor.r,
    g: wispColor.g,
    b: wispColor.b,
    radius: 18 + rng() * 14 + speedNorm * 10,
    growthRate: 34 + rng() * 22,
    stretch: 1.35 + speedNorm * 0.75,
    age: 0,
    maxLife: 1.05 + rng() * 0.75,
    angle: slashAngle + (rng() - 0.5) * 0.4,
    spin: wispFlank * (0.85 + rng() * 1.25),
    phase: rng() * Math.PI * 2,
    peakAlpha: 0.42 + rng() * 0.18,
    dragPerFrame: 0.95,
    buoyancy: -(16 + rng() * 16),
    stampIdx: Math.floor(rng() * 4),
  });

  // 4. High-speed kinetic vapor tendril streak (only on brisk slashes — fluid ribbon, never grainy dust!)
  if (speedNorm > 0.42 && emitBillow) {
    const streakColor = toneColor(1.06);
    plumes.push({
      kind: "tendril",
      x: x + dirX * 6,
      y: y + dirY * 6,
      vx: dirX * clampedSpeed * (0.45 + rng() * 0.25),
      vy: dirY * clampedSpeed * (0.45 + rng() * 0.25),
      r: streakColor.r,
      g: streakColor.g,
      b: streakColor.b,
      radius: 12 + rng() * 8 + speedNorm * 8,
      growthRate: 24 + rng() * 14,
      stretch: 1.9 + speedNorm * 1.0,
      age: 0,
      maxLife: 0.65 + rng() * 0.35,
      angle: slashAngle,
      spin: (rng() - 0.5) * 0.5,
      phase: rng() * Math.PI * 2,
      peakAlpha: 0.38 + rng() * 0.16,
      dragPerFrame: 0.935,
      buoyancy: -(8 + rng() * 10),
      stampIdx: Math.floor(rng() * 4),
    });
  }

  if (plumes.length > MAX_SMOKE_PLUMES) {
    plumes.splice(0, plumes.length - MAX_SMOKE_PLUMES);
  }
}
