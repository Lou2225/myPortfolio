"use client";

import { useEffect, useRef, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { Magnetic } from "@/components/motion/Magnetic";
import {
  APPEARANCE_SYNC_EVENT,
  applyAppearanceToDocument,
  getStoredDeviceThemeOverride,
  resolveEffectiveTheme,
  setStoredDeviceThemeOverride,
  shouldReduceMotion,
} from "@/lib/appearance";
import type { PortfolioTheme } from "@/types/portfolio";
import { cn } from "@/lib/utils";

export type { PortfolioTheme };

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

export interface ThemeToggleProps {
  size?: "sm" | "md" | "lg";
  variant?: "outline" | "surface" | "ghost";
  showLabel?: boolean;
  magnetic?: boolean;
  className?: string;
}

function readRootAccentVar(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return val || fallback;
}

function spawnPulseWaveRing(
  cx: number,
  cy: number,
  maxRadius: number,
  nextTheme: PortfolioTheme
) {
  const wave = document.createElement("div");
  const diameter = maxRadius * 2;
  const accentColor = readRootAccentVar("--accent", "#ff3b1d");
  const glowColor = readRootAccentVar("--accent-glow", "rgba(255, 59, 29, 0.35)");

  wave.style.position = "fixed";
  wave.style.left = `${cx}px`;
  wave.style.top = `${cy}px`;
  wave.style.width = `${diameter}px`;
  wave.style.height = `${diameter}px`;
  wave.style.borderRadius = "9999px";
  wave.style.pointerEvents = "none";
  wave.style.zIndex = "10000";
  wave.style.border = `2px solid ${accentColor}`;
  wave.style.boxShadow =
    nextTheme === "light"
      ? `0 0 50px ${glowColor}, inset 0 0 35px rgba(245, 242, 235, 0.6)`
      : `0 0 60px ${glowColor}, inset 0 0 40px rgba(8, 8, 10, 0.7)`;
  wave.style.willChange = "transform, opacity";

  document.body.appendChild(wave);

  const anim = wave.animate(
    [
      {
        transform: "translate(-50%, -50%) scale(0)",
        opacity: 1,
      },
      {
        transform: "translate(-50%, -50%) scale(1)",
        opacity: 0,
      },
    ],
    {
      duration: 780,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    }
  );

  anim.onfinish = () => {
    wave.remove();
  };
}

/**
 * Shared radial pulse-wave + View-Transition theme animation helper.
 * Used by both `ThemeToggle` and Appearance Studio's Published Default selector.
 */
export function triggerThemePulseWave(
  next: PortfolioTheme,
  applyThemeImmediate: () => void,
  originElement?: HTMLElement | null
) {
  if (!originElement || shouldReduceMotion()) {
    applyThemeImmediate();
    return;
  }

  const rect = originElement.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxRadius = Math.hypot(
    Math.max(cx, window.innerWidth - cx),
    Math.max(cy, window.innerHeight - cy)
  );

  const doc = document as DocumentWithViewTransition;

  spawnPulseWaveRing(cx, cy, maxRadius, next);

  if (typeof doc.startViewTransition === "function") {
    document.documentElement.classList.add("theme-wave-active");

    const transition = doc.startViewTransition(() => {
      applyThemeImmediate();
    });

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${cx}px ${cy}px)`,
              `circle(${maxRadius}px at ${cx}px ${cy}px)`,
            ],
          },
          {
            duration: 780,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {
        // Ignore if skipped
      });

    transition.finished.finally(() => {
      document.documentElement.classList.remove("theme-wave-active");
    });
  } else {
    const fallbackWave = document.createElement("div");
    const diameter = maxRadius * 2;
    fallbackWave.style.position = "fixed";
    fallbackWave.style.left = `${cx}px`;
    fallbackWave.style.top = `${cy}px`;
    fallbackWave.style.width = `${diameter}px`;
    fallbackWave.style.height = `${diameter}px`;
    fallbackWave.style.borderRadius = "9999px";
    fallbackWave.style.pointerEvents = "none";
    fallbackWave.style.zIndex = "9998";
    fallbackWave.style.backgroundColor =
      next === "light" ? "#f5f2eb" : "#08080a";
    fallbackWave.style.willChange = "transform, opacity";

    document.body.appendChild(fallbackWave);

    const expand = fallbackWave.animate(
      [
        { transform: "translate(-50%, -50%) scale(0)", opacity: 0.92 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
      ],
      {
        duration: 750,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }
    );

    applyThemeImmediate();

    expand.onfinish = () => {
      fallbackWave.remove();
    };
  }
}

/**
 * Shared synchronized Dark / Light theme state and View-Transition wave runner.
 * Resolves live site default (`appearance.defaultTheme`) plus any per-device localStorage override.
 */
export function useThemePreference() {
  const { appearance } = usePortfolio();
  const [theme, setTheme] = useState<PortfolioTheme>("dark");

  useEffect(() => {
    const sync = () => {
      const override = getStoredDeviceThemeOverride();
      const effective = resolveEffectiveTheme(appearance.defaultTheme, override);
      setTheme(effective);
    };

    const rafId = requestAnimationFrame(sync);
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");

    mq?.addEventListener("change", sync);
    window.addEventListener(APPEARANCE_SYNC_EVENT, sync);
    return () => {
      cancelAnimationFrame(rafId);
      mq?.removeEventListener("change", sync);
      window.removeEventListener(APPEARANCE_SYNC_EVENT, sync);
    };
  }, [appearance.defaultTheme]);

  const applyThemeImmediate = (next: PortfolioTheme) => {
    setTheme(next);
    setStoredDeviceThemeOverride(next);
    applyAppearanceToDocument(appearance, { deviceThemeOverride: next });
    window.dispatchEvent(new CustomEvent(APPEARANCE_SYNC_EVENT, { detail: next }));
  };

  const applyThemeWithWave = (
    next: PortfolioTheme,
    originElement?: HTMLElement | null
  ) => {
    if (next === theme) return;
    triggerThemePulseWave(next, () => applyThemeImmediate(next), originElement);
  };

  return {
    theme,
    setTheme: applyThemeWithWave,
    toggleTheme: (originElement?: HTMLElement | null) =>
      applyThemeWithWave(theme === "dark" ? "light" : "dark", originElement),
  };
}

export function ThemeToggle({
  size = "sm",
  variant = "outline",
  showLabel = false,
  magnetic = true,
  className,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useThemePreference();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    toggleTheme(buttonRef.current);
  };

  const sizeStyles = {
    sm: showLabel ? "h-8.5 px-3.5 text-[11px] gap-1.5" : "h-8.5 w-8.5",
    md: showLabel ? "h-10 px-4 text-xs gap-2" : "h-10 w-10",
    lg: showLabel ? "h-12 px-5 text-xs gap-2.5" : "h-12 w-12",
  };

  const variantStyles = {
    outline:
      "border border-(--border-strong) text-(--text-primary) hover:border-brand hover:text-(--text-accent)",
    surface:
      "bg-(--bg-surface-2) border border-(--border-subtle) text-(--text-primary) hover:border-brand hover:text-(--text-accent)",
    ghost:
      "text-(--text-secondary) hover:text-(--text-accent) hover:bg-(--bg-surface-2) border border-transparent",
  };

  const iconSize = size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5";

  const buttonEl = (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleToggle}
      aria-label={
        theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"
      }
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={cn(
        "relative rounded-full active:scale-95 inline-flex items-center justify-center font-medium uppercase tracking-[0.14em] transition-all duration-300 cursor-pointer select-none shrink-0 group overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
    >
      <span className="relative inline-flex items-center justify-center w-3.5 h-3.5">
        <Sun
          className={cn(
            iconSize,
            "transition-all duration-500 ease-out",
            theme === "dark"
              ? "rotate-0 scale-100 opacity-100 text-(--text-accent)"
              : "rotate-90 scale-0 opacity-0 absolute"
          )}
        />
        <Moon
          className={cn(
            iconSize,
            "transition-all duration-500 ease-out",
            theme === "light"
              ? "rotate-0 scale-100 opacity-100 text-(--text-accent)"
              : "-rotate-90 scale-0 opacity-0 absolute"
          )}
        />
      </span>
      {showLabel && (
        <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
      )}
    </button>
  );

  if (magnetic) {
    return <Magnetic strength={0.2}>{buttonEl}</Magnetic>;
  }

  return buttonEl;
}
