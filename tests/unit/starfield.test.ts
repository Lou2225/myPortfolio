import { describe, expect, it } from "vitest";
import { parseScalarMetric } from "@/components/motion/CountUpMetric";
import {
  STARFIELD_CONFIG,
  createPerspectiveMatrix4,
  createViewMatrix4,
  resolveStarfieldPalette,
  unprojectNdcToZ0Plane,
} from "@/lib/webglStarfield";

describe("WebGL Starfield Math & Theme Palette", () => {
  it("resolves crisp light-mode ink stars and luminous dark-mode stars", () => {
    const darkPalette = resolveStarfieldPalette("#ff3b1d", "dark");
    const lightPalette = resolveStarfieldPalette("#ff3b1d", "light");

    expect(darkPalette.isLight).toBe(false);
    expect(darkPalette.maxOpacity).toBeGreaterThanOrEqual(0.85);
    expect(darkPalette.brightness).toBe(STARFIELD_CONFIG.brightness);

    expect(lightPalette.isLight).toBe(true);
    expect(lightPalette.maxOpacity).toBeGreaterThanOrEqual(0.85);
    expect(lightPalette.flameAmt).toBeGreaterThan(0);
    // Light mode stars should be true obsidian black across all 3 channels
    expect(Math.max(...lightPalette.colorA)).toBeLessThan(0.12);
    expect(Math.max(...lightPalette.colorB)).toBeLessThan(0.12);
    expect(Math.max(...lightPalette.colorC)).toBeLessThan(0.15);
  });

  it("parses scalar metric values while leaving ranges static", () => {
    expect(parseScalarMetric("100")).toEqual({ target: 100, decimals: 0 });
    expect(parseScalarMetric("2026")).toEqual({ target: 2026, decimals: 0 });
    expect(parseScalarMetric("3.5")).toEqual({ target: 3.5, decimals: 1 });
    expect(parseScalarMetric("60-120")).toBeNull();
    expect(parseScalarMetric("")).toBeNull();
  });

  it("constructs finite 4x4 perspective and view matrices", () => {
    const proj = createPerspectiveMatrix4(45, 16 / 9, 0.1, 80);
    const view = createViewMatrix4(0, 0, 5, 0, 0, -10);

    expect(proj).toHaveLength(16);
    expect(view).toHaveLength(16);
    expect(Array.from(proj).every((n) => Number.isFinite(n))).toBe(true);
    expect(Array.from(view).every((n) => Number.isFinite(n))).toBe(true);
  });

  it("unprojects pointer NDC coordinates onto the z=0 repulsion plane accurately", () => {
    const center = unprojectNdcToZ0Plane(0, 0, 0, 0, 5, 45, 16 / 9);
    expect(center[0]).toBeCloseTo(0, 5);
    expect(center[1]).toBeCloseTo(0, 5);
    expect(center[2]).toBe(0);

    const topRight = unprojectNdcToZ0Plane(1, 1, 0, 0, 5, 45, 1);
    expect(topRight[0]).toBeGreaterThan(2);
    expect(topRight[1]).toBeCloseTo(topRight[0], 4);
    expect(topRight[2]).toBe(0);

    // Camera past z=0 returns safe origin fallback instead of behind-camera coordinates
    const pastPlane = unprojectNdcToZ0Plane(0.5, 0.5, 0, 0, -2, 45, 1);
    expect(pastPlane).toEqual([0, 0, 0]);
  });
});
