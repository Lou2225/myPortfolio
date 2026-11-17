"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeCounterProps {
  count?: number | string;
  max?: number;
  /**
   * Visual tone of the badge counter:
   * - `alert`: High-priority unread/alert counter (Signature Red `#ff3b1d`, or unified obsidian pill when placed on the red sidebar)
   * - `neutral`: Standard item counter (Unified with `alert` on the red sidebar, or surface pill elsewhere)
   * - `inverted`: Used when the parent button is active white/surface (`#ff3b1d` pill with white text)
   * - `surface`: Theme-adaptive surface badge (`var(--bg-badge-highlight)`)
   */
  variant?: "alert" | "neutral" | "inverted" | "surface";
  /**
   * Set `true` when the badge sits directly on top of the red `#ff3b1d` sidebar
   * so all sidebar badges share one unified, high-contrast style in both Dark and Light mode.
   */
  onAccentSurface?: boolean;
  size?: "xs" | "sm" | "md";
  floating?: boolean;
  className?: string;
}

/**
 * Reusable Theme-Proof Badge Counter Component
 * Uses even pixel dimensions paired with even font sizes, zero letter-spacing inheritance,
 * and proportional glyph bounds so every digit (including "1") sits dead-center.
 */
export function BadgeCounter({
  count,
  max = 99,
  variant = "neutral",
  onAccentSurface = false,
  size = "sm",
  floating = false,
  className,
}: BadgeCounterProps) {
  if (count === undefined || count === null || count === "") {
    return null;
  }

  const formatted =
    typeof count === "number" && count > max ? `${max}+` : String(count);
  const isSingleChar = formatted.length === 1;

  // Pair even pixel heights with even font sizes so (height - fontSize) / 2 is an exact integer
  const sizeClasses = {
    xs: isSingleChar
      ? "w-4.5 h-4.5 p-0 text-[10px]"
      : "min-w-4.5 h-4.5 px-1.5 text-[10px]",
    sm: isSingleChar
      ? "w-5 h-5 p-0 text-[10px]"
      : "min-w-5 h-5 px-1.5 text-[10px]",
    md: isSingleChar
      ? "w-5.5 h-5.5 p-0 text-[12px]"
      : "min-w-5.5 h-5.5 px-2 text-[12px]",
  };

  // Explicit inline colors ensure 100% identical appearance across Dark Mode and Light Mode
  const getExplicitStyle = (): React.CSSProperties => {
    const baseReset: React.CSSProperties = {
      letterSpacing: "0px",
      textIndent: "0px",
      lineHeight: 1,
      fontVariantNumeric: "normal",
    };

    if (variant === "inverted") {
      return {
        ...baseReset,
        backgroundColor: "var(--accent-solid)",
        color: "var(--accent-contrast)",
      };
    }

    if (onAccentSurface) {
      return {
        ...baseReset,
        backgroundColor: "#111114",
        color: "#ffffff",
      };
    }

    if (variant === "alert") {
      return {
        ...baseReset,
        backgroundColor: "var(--accent-solid)",
        color: "var(--accent-contrast)",
      };
    }

    return baseReset;
  };

  const hasDescenders = /[gjpqy]/.test(formatted);

  return (
    <span
      style={getExplicitStyle()}
      className={cn(
        "rounded-full font-sans font-bold inline-grid place-items-center leading-none text-center tracking-normal shrink-0 select-none border-0 transition-transform duration-200",
        onAccentSurface && "keep-white",
        sizeClasses[size],
        floating && "absolute -top-1 -right-1 shadow-sm",
        !onAccentSurface &&
          variant === "neutral" &&
          "bg-(--bg-surface-2) text-(--text-primary)",
        !onAccentSurface &&
          variant === "surface" &&
          "bg-(--bg-badge-highlight) text-(--text-accent)",
        !onAccentSurface &&
          variant === "alert" &&
          "shadow-[0_2px_8px_var(--accent-glow)]",
        className
      )}
    >
      <span
        style={{
          letterSpacing: "0px",
          lineHeight: 1,
          fontVariantNumeric: "normal",
        }}
        className={cn(
          "block leading-none tracking-normal text-center",
          !hasDescenders && "lou-badge-text"
        )}
      >
        {formatted}
      </span>
    </span>
  );
}
