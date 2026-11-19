import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "@/data/appearance";
import {
  buildCssCursorValue,
  resolveCursorCssVars,
  sanitizeAppearanceConfig,
} from "@/lib/appearance";
import { sanitizeCursorAssetUrl, validateCursorAssetUrl } from "@/lib/inputValidation";
import { appearanceConfigSchema } from "@/lib/validation";

describe("Uploaded Custom Cursor Configuration & Sanitization", () => {
  it("sanitizes cursor URLs strictly to prevent CSS url() injection", () => {
    expect(sanitizeCursorAssetUrl("/uploads/cursors/mickey.png")).toBe(
      "/uploads/cursors/mickey.png"
    );
    expect(sanitizeCursorAssetUrl("https://cdn.example.com/cursor.cur")).toBe(
      "https://cdn.example.com/cursor.cur"
    );

    expect(sanitizeCursorAssetUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeCursorAssetUrl('"/uploads/x.png");body{display:none}//')).toBe("");
    expect(sanitizeCursorAssetUrl("data:image/svg+xml,<svg/>")).toBe("");
    expect(validateCursorAssetUrl("/uploads/cursors/ok.png").valid).toBe(true);
    expect(validateCursorAssetUrl('https://bad.com/"evil').valid).toBe(false);
  });

  it("formats native CSS cursor values with clamped hotspots, image-set scaling, and toggle behavior", () => {
    expect(buildCssCursorValue("/uploads/cursors/arrow.png", "auto", 4, 6)).toBe(
      'url("/uploads/cursors/arrow.png") 4 6, auto'
    );
    expect(
      buildCssCursorValue("/uploads/cursors/arrow.png", "auto", 4, 6, 48, 128)
    ).toBe('image-set(url("/uploads/cursors/arrow.png") 2.6667x) 4 6, auto');
    expect(
      buildCssCursorValue("/uploads/cursors/arrow.cur", "auto", 4, 6, 48, 128)
    ).toBe('url("/uploads/cursors/arrow.cur") 4 6, auto');
    expect(buildCssCursorValue("bad url()", "pointer", 999, -5)).toBe("pointer");

    expect(
      resolveCursorCssVars({
        customCursorEnabled: false,
        customCursorDefaultUrl: "/uploads/cursors/arrow.png",
        customCursorPointerUrl: "/uploads/cursors/hand.png",
      })
    ).toEqual({
      active: false,
      defaultCss: "auto",
      defaultFallbackCss: "auto",
      pointerCss: "pointer",
      pointerFallbackCss: "pointer",
    });

    expect(
      resolveCursorCssVars({
        customCursorEnabled: true,
        customCursorDefaultUrl: "/uploads/cursors/arrow.png",
        customCursorDefaultSourceSize: 128,
        customCursorPointerUrl: "",
        customCursorSize: 32,
        customCursorHotspotX: 8,
        customCursorHotspotY: 12,
      })
    ).toEqual({
      active: true,
      defaultCss: 'image-set(url("/uploads/cursors/arrow.png") 4x) 8 12, auto',
      defaultFallbackCss: 'url("/uploads/cursors/arrow.png") 8 12, auto',
      pointerCss:
        'image-set(url("/uploads/cursors/arrow.png") 4x) 8 12, pointer',
      pointerFallbackCss: 'url("/uploads/cursors/arrow.png") 8 12, pointer',
    });
  });

  it("validates uploaded cursor settings and placeholder transforms cleanly inside appearanceConfigSchema", () => {
    const sanitized = sanitizeAppearanceConfig({
      customCursorEnabled: true,
      customCursorDefaultUrl: "/uploads/cursors/default.cur",
      customCursorDefaultTransform: {
        zoom: 1.5,
        offsetXPercent: 12,
        offsetYPercent: -8,
        rotation: 0,
        fit: "contain",
        aspect: "original",
        clipCircle: false,
      },
      customCursorSize: 64,
      customCursorHotspotX: 200,
      customCursorHotspotY: -3,
    });
    expect(sanitized.customCursorHotspotX).toBe(128);
    expect(sanitized.customCursorHotspotY).toBe(0);
    expect(sanitized.customCursorDefaultTransform?.zoom).toBe(1.5);
    expect(sanitized.customCursorDefaultTransform?.offsetXPercent).toBe(12);

    const parsed = appearanceConfigSchema.safeParse({
      ...DEFAULT_APPEARANCE,
      customCursorEnabled: true,
      customCursorDefaultUrl: "/uploads/cursors/default.png",
      customCursorDefaultTransform: sanitized.customCursorDefaultTransform,
      customCursorPointerUrl: "/uploads/cursors/pointer.png",
      customCursorSize: 48,
      customCursorHotspotX: 4,
      customCursorHotspotY: 6,
    });
    expect(parsed.success).toBe(true);

    const rejected = appearanceConfigSchema.safeParse({
      ...DEFAULT_APPEARANCE,
      customCursorEnabled: true,
      customCursorDefaultUrl: '"/uploads/x.png");background:red',
    });
    expect(rejected.success).toBe(false);
  });
});
