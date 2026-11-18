"use client";

import React, { useMemo } from "react";
import { CheckCircle2, AlertTriangle, Sparkles, Eye } from "lucide-react";
import {
  FONT_PAIRINGS,
  RADIUS_PRESETS,
} from "@/data/appearance";
import {
  resolveAccentBaseHex,
  resolveAccentPalette,
} from "@/lib/appearance";
import type { AppearanceConfig, PortfolioTheme } from "@/types/portfolio";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/lib/utils";

export interface AppearancePreviewCardProps {
  draft: AppearanceConfig;
  effectiveTheme: PortfolioTheme;
  isDirty: boolean;
  /** Omit outer card chrome & header when rendered inside a collapsible drawer. */
  embedded?: boolean;
}

export const FONT_PAIRING_STYLE_MAP: Record<
  AppearanceConfig["fontPairing"],
  { display: string; sans: string }
> = {
  editorial: {
    display: 'var(--font-anton), "Anton", sans-serif',
    sans: 'var(--font-onest), "Onest", sans-serif',
  },
  geometric: {
    display: 'var(--font-space-grotesk), "Space Grotesk", sans-serif',
    sans: 'var(--font-jakarta), "Plus Jakarta Sans", sans-serif',
  },
  monolith: {
    display: 'var(--font-bebas), "Bebas Neue", sans-serif',
    sans: 'var(--font-inter), "Inter", sans-serif',
  },
};

export function AppearancePreviewCard({
  draft,
  effectiveTheme,
  isDirty,
  embedded = false,
}: AppearancePreviewCardProps) {
  const palette = useMemo(
    () => resolveAccentPalette(resolveAccentBaseHex(draft)),
    [draft]
  );

  const fontMeta = useMemo(
    () =>
      FONT_PAIRINGS.find((f) => f.id === draft.fontPairing) ?? FONT_PAIRINGS[0],
    [draft.fontPairing]
  );

  const radiusMeta = useMemo(
    () =>
      RADIUS_PRESETS.find((r) => r.id === draft.surfaceRadius) ??
      RADIUS_PRESETS[0],
    [draft.surfaceRadius]
  );

  const isLight =
    draft.defaultTheme === "light" ||
    (draft.defaultTheme === "system" && effectiveTheme === "light");

  const canvasBg = isLight ? "#f5f2eb" : "#08080a";
  const surfaceBg = isLight ? "#ffffff" : "#111114";
  const surfaceAltBg = isLight ? "#edeae2" : "#17171b";
  const inkPrimary = isLight ? "#111114" : "#f3f1ea";
  const inkMuted = isLight ? "#52514a" : "#8e8d85";
  const hairline = isLight
    ? "rgba(17, 17, 20, 0.14)"
    : "rgba(243, 241, 234, 0.12)";
  const accentText = isLight ? palette.textOnLight : palette.textOnDark;
  const fonts = FONT_PAIRING_STYLE_MAP[draft.fontPairing];

  const textureStyle: React.CSSProperties =
    draft.canvasTexture === "grid"
      ? {
          backgroundImage: `linear-gradient(to right, ${hairline} 1px, transparent 1px), linear-gradient(to bottom, ${hairline} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }
      : draft.canvasTexture === "dots"
        ? {
            backgroundImage: `radial-gradient(${
              isLight ? "rgba(17,17,20,0.18)" : "rgba(243,241,234,0.18)"
            } 1px, transparent 1px)`,
            backgroundSize: "14px 14px",
          }
        : {};

  const lowContrastWarning =
    palette.contrastOnButton < 3.0 ||
    Math.min(palette.contrastOnDarkCanvas, palette.contrastOnLightCanvas) < 4.5;

  return (
    <div
      data-cascade={!embedded || undefined}
      className={cn(
        "space-y-3.5 sm:space-y-5",
        !embedded &&
          "bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 shadow-sm"
      )}
    >
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pb-3 sm:pb-3.5 border-b border-(--border-subtle)">
          <div className="flex items-center gap-2.5 min-w-0">
            <Eye className="w-4 h-4 text-(--text-accent) shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-(--text-accent) block">
                Real-Time Design System Stage
              </span>
              <p className="text-xs text-(--text-muted) truncate">
                {fontMeta.displayLabel} + {fontMeta.sansLabel} · {radiusMeta.name}{" "}
                ({radiusMeta.pxCard}) · {draft.canvasTexture} texture
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <StatusPill
              label={isDirty ? "Draft Preview Active" : "Published"}
              variant={isDirty ? "warning" : "success"}
              size="xs"
              icon={<Sparkles className="w-3 h-3" />}
            />
            <StatusPill
              label={isLight ? "Daylight Bone" : "Obsidian Dark"}
              variant="neutral"
              size="xs"
            />
          </div>
        </div>
      )}

      {/* Live Scaled Mini Portfolio Viewport */}
      <div
        style={{
          backgroundColor: canvasBg,
          color: inkPrimary,
          borderColor: hairline,
          borderRadius: radiusMeta.pxCard,
          fontFamily: fonts.sans,
          ...textureStyle,
        }}
        className="border overflow-hidden transition-colors duration-300"
      >
        {/* Mock Navbar Strip */}
        <div
          style={{
            backgroundColor:
              draft.navbarStyle === "solid"
                ? canvasBg
                : isLight
                  ? "rgba(245, 242, 235, 0.85)"
                  : "rgba(8, 8, 10, 0.82)",
            borderBottomColor: hairline,
            backdropFilter:
              draft.navbarStyle === "glass" ? "blur(12px)" : "none",
          }}
          className="px-4 py-2.5 border-b flex items-center justify-between text-[10px] font-mono uppercase tracking-widest"
        >
          <span style={{ color: inkPrimary }} className="font-bold">
            LOU DIAMOND
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <span style={{ color: accentText }} className="hidden min-[380px]:inline">STORY</span>
            <span style={{ color: inkMuted }} className="hidden sm:inline">SYSTEMS</span>
            <span
              style={{
                backgroundColor: palette.accent,
                color: palette.contrastInk,
                borderRadius: radiusMeta.pxControl,
              }}
              className="px-2 py-0.5 font-semibold text-[9px]"
            >
              HIRE
            </span>
          </div>
        </div>

        {/* Mock Hero + Selected Systems Preview */}
        <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-7 space-y-2.5">
            <span
              style={{ color: accentText }}
              className="text-[10px] font-mono uppercase tracking-[0.2em] block"
            >
              Class of 2026 · BSIT Architecture
            </span>
            <p
              style={{ fontFamily: fonts.display, color: inkPrimary }}
              className={cn(
                "uppercase leading-[0.94] tracking-tight transition-all",
                draft.displayScale === "compact"
                  ? "text-2xl sm:text-3xl"
                  : draft.displayScale === "large"
                    ? "text-4xl sm:text-5xl"
                    : "text-3xl sm:text-4xl"
              )}
            >
              {fontMeta.sampleHeadline}
            </p>
            <p style={{ color: inkMuted }} className="text-xs leading-relaxed">
              Full-stack databases, analytics pipelines, and zero-lag motion
              choreography rendered using live CSS tokens.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                style={{
                  backgroundColor: palette.accent,
                  color: palette.contrastInk,
                  borderRadius: radiusMeta.pxControl,
                  boxShadow: `0 6px 20px ${palette.glowRgba}`,
                }}
                className="px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] inline-flex items-center gap-1.5"
              >
                Explore Systems
              </span>
              <span
                style={{
                  backgroundColor: surfaceAltBg,
                  color: inkPrimary,
                  borderColor: hairline,
                  borderRadius: radiusMeta.pxControl,
                }}
                className="px-3 py-1.5 border text-[10px] font-mono uppercase tracking-[0.14em]"
              >
                {draft.projectsLayout === "staggered"
                  ? "Spotlight Deck"
                  : "2-Col Grid"}
              </span>
            </div>
          </div>

          {/* Mock Project Card + Rim Glow Demonstration */}
          <div className="md:col-span-5 relative">
            <div
              style={{
                backgroundColor: surfaceBg,
                borderColor: hairline,
                borderRadius: radiusMeta.pxCard,
                boxShadow: draft.heroRimGlow
                  ? `0 16px 36px -14px ${palette.glowRgba}`
                  : "none",
              }}
              className="border p-3 space-y-2.5"
            >
              <div
                style={{
                  backgroundColor: surfaceAltBg,
                  borderRadius: radiusMeta.pxControl,
                  filter:
                    draft.imageColorMode === "always-color"
                      ? "none"
                      : "grayscale(0.85)",
                }}
                className="h-20 w-full relative overflow-hidden flex items-end p-2 border border-black/10"
              >
                <div
                  style={{
                    background: `radial-gradient(circle at 75% 25%, ${palette.glowRgba}, transparent 68%)`,
                  }}
                  className="absolute inset-0"
                />
                <span
                  style={{
                    backgroundColor: palette.badgeBgRgba,
                    color: accentText,
                    borderRadius: radiusMeta.pxControl,
                  }}
                  className="relative z-10 px-1.5 py-0.5 text-[9px] font-mono uppercase font-semibold"
                >
                  {draft.imageColorMode}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p
                    style={{ fontFamily: fonts.display, color: inkPrimary }}
                    className="text-sm uppercase leading-none truncate"
                  >
                    Enterprise Telemetry Core
                  </p>
                  <p
                    style={{ color: inkMuted }}
                    className="text-[10px] font-mono mt-0.5 truncate"
                  >
                    Next.js · Supabase · GSAP
                  </p>
                </div>
                <span
                  style={{
                    backgroundColor: palette.accent,
                    color: palette.contrastInk,
                  }}
                  className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-bold shrink-0"
                >
                  ↗
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live WCAG 2.1 Contrast Safety Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pt-1 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-2">
          {lowContrastWarning ? (
            <span className="inline-flex items-center gap-1.5 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Auto-tuned readable text ink active ({palette.contrastInk})
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-(--text-success)">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>WCAG contrast validated across canvases</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <StatusPill
            label={`Dark ${palette.contrastOnDarkCanvas}:1`}
            variant={palette.contrastOnDarkCanvas >= 4.5 ? "success" : "warning"}
            size="xs"
          />
          <StatusPill
            label={`Light ${palette.contrastOnLightCanvas}:1`}
            variant={palette.contrastOnLightCanvas >= 4.5 ? "success" : "warning"}
            size="xs"
          />
          <StatusPill
            label={`CTA ${palette.contrastOnButton}:1`}
            variant={palette.contrastOnButton >= 3.0 ? "accent" : "warning"}
            size="xs"
          />
        </div>
      </div>
    </div>
  );
}
