import { describe, expect, it } from "vitest";
import {
  applyCursorWakeToSmoke,
  computeAvatarDrawSpec,
  computeSliceNodeAlpha,
  emitAvatarSmokeImpact,
  interpolateSlashSegments,
  MAX_SLICE_NODES,
  MAX_SMOKE_PLUMES,
  quantizeRgbChannel,
  resolveSmartAvatarAspect,
  sampleAvatarPixel,
  stepAvatarSmokePlumes,
  stepSliceNodes,
  type AvatarPixelGrid,
  type AvatarSmokePlume,
  type SliceTrailNode,
} from "@/lib/avatarSmokeSlice";

describe("Borderless Volumetric Avatar Smoke-Slice Engine", () => {
  it("resolves smart avatar aspect ratios cleanly and clamps extreme proportions", () => {
    expect(resolveSmartAvatarAspect(1000, 1000)).toBe(1);
    expect(resolveSmartAvatarAspect(1600, 800)).toBe(1.38);
    expect(resolveSmartAvatarAspect(300, 1200)).toBe(0.62);
    expect(resolveSmartAvatarAspect(0, 0)).toBe(0.82);
  });

  it("computes bottom-aligned contain geometry by default and honors custom ImageTransform", () => {
    const defaultSpec = computeAvatarDrawSpec({
      containerWidth: 300,
      containerHeight: 400,
      naturalWidth: 600,
      naturalHeight: 600,
    });
    expect(defaultSpec.drawW).toBeCloseTo(300, 1);
    expect(defaultSpec.drawH).toBeCloseTo(300, 1);
    expect(defaultSpec.centerX).toBeCloseTo(150, 1);
    expect(defaultSpec.centerY).toBeCloseTo(250, 1);

    const customSpec = computeAvatarDrawSpec({
      containerWidth: 300,
      containerHeight: 400,
      naturalWidth: 600,
      naturalHeight: 600,
      transform: {
        zoom: 1.5,
        offsetXPercent: 10,
        offsetYPercent: -5,
        rotation: 90,
        fit: "contain",
        aspect: "1:1",
        clipCircle: true,
      },
    });
    expect(customSpec.drawW).toBeCloseTo(450, 1);
    expect(customSpec.centerX).toBeCloseTo(180, 1);
    expect(customSpec.centerY).toBeCloseTo(180, 1);
    expect(customSpec.rotationRad).toBeCloseTo(Math.PI / 2, 4);
    expect(customSpec.clipCircle).toBe(true);
  });

  it("interpolates fast pointer swipes into continuous evenly spaced slash segments", () => {
    const pts = interpolateSlashSegments(0, 0, 120, 0, 12, 20);
    expect(pts.length).toBe(10);
    expect(pts[0].x).toBeCloseTo(12, 2);
    expect(pts[pts.length - 1].x).toBeCloseTo(120, 2);

    const capped = interpolateSlashSegments(0, 0, 1000, 0, 10, 16);
    expect(capped.length).toBe(16);
  });

  it("samples true avatar RGBA colors on opaque pixels and rejects faint edge halos & empty air", () => {
    const width = 10;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4);
    // Faint background-removal halo (alpha = 20) at (1, 1) -> must be ignored
    const haloOffset = (1 * width + 1) * 4;
    data[haloOffset] = 200;
    data[haloOffset + 1] = 200;
    data[haloOffset + 2] = 200;
    data[haloOffset + 3] = 20;

    // Solid opaque portrait pixel at (5, 5)
    const offset = (5 * width + 5) * 4;
    data[offset] = 172;
    data[offset + 1] = 108;
    data[offset + 2] = 68;
    data[offset + 3] = 255;

    const grid: AvatarPixelGrid = { width, height, data };

    expect(sampleAvatarPixel(grid, 0.15, 0.15).hit).toBe(false);
    const hit = sampleAvatarPixel(grid, 0.55, 0.55);
    expect(hit.hit).toBe(true);
    expect(hit.r).toBe(172);
    expect(hit.g).toBe(108);
    expect(hit.b).toBe(68);
    expect(quantizeRgbChannel(172, 20)).toBe(180);
  });

  it("emits volumetric avatar-colored smoke plumes following impact and allows them to billow freely past container bounds", () => {
    let nodes: SliceTrailNode[] = [];
    let plumes: AvatarSmokePlume[] = [];

    const sampledPixel = { hit: true, r: 156, g: 102, b: 64, a: 255 };

    // Slash swiftly rightward near the right edge of the portrait (x = 290)
    emitAvatarSmokeImpact({
      nodes,
      plumes,
      x: 290,
      y: 200,
      cursorVx: 1300,
      cursorVy: -150,
      pixel: sampledPixel,
      emitBillow: true,
      rng: () => 0.5,
    });

    expect(nodes.length).toBe(1);
    expect(plumes.length).toBeGreaterThanOrEqual(2);
    // Volumetric billows & wisps (large continuous smoke clouds, not tiny dust specks)
    expect(plumes.some((p) => p.kind === "billow" && p.radius >= 24)).toBe(true);
    expect(plumes.every((p) => p.vx > 0)).toBe(true);

    // Step forward: smoke billows freely past x > 300 into the borderless Hero stage!
    plumes = stepAvatarSmokePlumes(plumes, 0.35, 0.35);
    expect(plumes.some((p) => p.x > 320)).toBe(true);

    // Sweep cursor past x = 310 (outside the portrait box) -> wake still swirls floating smoke!
    const beforeVx = plumes[0].vx;
    applyCursorWakeToSmoke({
      plumes,
      cursorX: plumes[0].x - 20,
      cursorY: plumes[0].y,
      cursorVx: 1100,
      cursorVy: 0,
      dtSec: 0.016,
    });
    expect(plumes[0].vx).toBeGreaterThan(beforeVx);

    // Caps budgets under rapid swipes and heals cleanly to 0 (0% idle CPU)
    for (let i = 0; i < 200; i += 1) {
      emitAvatarSmokeImpact({
        nodes,
        plumes,
        x: 150,
        y: 200,
        cursorVx: 900,
        cursorVy: 60,
        pixel: sampledPixel,
        emitBillow: true,
        rng: () => 0.4,
      });
    }
    expect(nodes.length).toBeLessThanOrEqual(MAX_SLICE_NODES);
    expect(plumes.length).toBeLessThanOrEqual(MAX_SMOKE_PLUMES);
    expect(computeSliceNodeAlpha(0.05, 1.5)).toBeGreaterThan(0.75);
    expect(computeSliceNodeAlpha(1.5, 1.5)).toBe(0);

    let elapsed = 0.35;
    for (let step = 0; step < 30; step += 1) {
      elapsed += 0.1;
      nodes = stepSliceNodes(nodes, 0.1);
      plumes = stepAvatarSmokePlumes(plumes, 0.1, elapsed);
    }
    expect(nodes).toHaveLength(0);
    expect(plumes).toHaveLength(0);
  });
});
