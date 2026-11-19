import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "@/data/appearance";
import { sanitizeAppearanceConfig } from "@/lib/appearance";
import {
  JUMPSCARE_SESSION_KEY,
  armPrankQueryForPage,
  clearPrankQueryArmed,
  hasFiredJumpscareThisSession,
  hasPrankQueryParam,
  isPrankQueryArmed,
  markJumpscareFiredThisSession,
} from "@/lib/jumpscare";
import {
  DEFAULT_JUMPSCARE_VOLUME,
  resolveJumpscareVolume,
} from "@/lib/jumpscareAudio";
import { appearanceConfigSchema } from "@/lib/validation";

describe("Jumpscare Easter Egg Config & Session Helpers", () => {
  it("detects ?prank=1 stealth links cleanly and tracks in-page arming", () => {
    expect(hasPrankQueryParam("?prank=1")).toBe(true);
    expect(hasPrankQueryParam("?tab=work&prank=1")).toBe(true);
    expect(hasPrankQueryParam("?prank=0")).toBe(false);
    expect(hasPrankQueryParam("")).toBe(false);

    clearPrankQueryArmed();
    expect(isPrankQueryArmed()).toBe(false);
    armPrankQueryForPage();
    expect(isPrankQueryArmed()).toBe(true);
    clearPrankQueryArmed();
    expect(isPrankQueryArmed()).toBe(false);
  });

  it("tracks once-per-session firing safely in storage", () => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };

    expect(hasFiredJumpscareThisSession(mockStorage)).toBe(false);
    markJumpscareFiredThisSession(mockStorage);
    expect(store.get(JUMPSCARE_SESSION_KEY)).toBe("1");
    expect(hasFiredJumpscareThisSession(mockStorage)).toBe(true);
  });

  it("sanitizes and validates jumpscare media URLs, triggers, caption, and volume bounds", () => {
    const sanitized = sanitizeAppearanceConfig({
      jumpscareEnabled: true,
      jumpscareTrigger: "get-in-touch",
      jumpscareImageUrl: "/uploads/scares/boo.png",
      jumpscareAudioUrl: "/uploads/audio/sting.mp3",
      jumpscareVolume: 1.5,
      jumpscareCaption: "   HI THERE   ",
    });

    expect(sanitized.jumpscareEnabled).toBe(true);
    expect(sanitized.jumpscareTrigger).toBe("get-in-touch");
    expect(sanitized.jumpscareVolume).toBe(1);
    expect(sanitized.jumpscareCaption).toBe("HI THERE");

    const parsed = appearanceConfigSchema.safeParse({
      ...DEFAULT_APPEARANCE,
      jumpscareEnabled: true,
      jumpscareTrigger: "get-in-touch",
      jumpscareImageUrl: "/uploads/scares/boo.png",
      jumpscareAudioUrl: "/uploads/audio/sting.mp3",
      jumpscareVolume: 0.7,
      jumpscareCaption: "BOO!",
    });
    expect(parsed.success).toBe(true);

    const rejected = appearanceConfigSchema.safeParse({
      ...DEFAULT_APPEARANCE,
      jumpscareEnabled: true,
      jumpscareAudioUrl: "javascript:alert(1)",
    });
    expect(rejected.success).toBe(false);
  });

  it("preserves explicit 0 volume as muted instead of falling back to default", () => {
    expect(resolveJumpscareVolume(0)).toBe(0);
    expect(resolveJumpscareVolume(0.01)).toBe(0.01);
    expect(resolveJumpscareVolume(1.5)).toBe(1);
    expect(resolveJumpscareVolume(-0.3)).toBe(0);
    expect(resolveJumpscareVolume(undefined)).toBe(DEFAULT_JUMPSCARE_VOLUME);
    expect(resolveJumpscareVolume(Number.NaN)).toBe(DEFAULT_JUMPSCARE_VOLUME);
  });
});
