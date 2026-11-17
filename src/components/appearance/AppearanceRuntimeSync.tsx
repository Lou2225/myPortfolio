"use client";

import { useEffect } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  APPEARANCE_SYNC_EVENT,
  applyAppearanceToDocument,
} from "@/lib/appearance";

/**
 * Keeps `<html>` data attributes, CSS accent palette, font pairing, surface radii,
 * motion mode, and browser theme-color synchronized in real time across
 * SSR initial load, CMS live preview edits, local device toggles, and OS media queries.
 */
export function AppearanceRuntimeSync() {
  const { appearance } = usePortfolio();

  useEffect(() => {
    const sync = () => {
      applyAppearanceToDocument(appearance);
    };

    sync();

    const mqTheme = window.matchMedia?.("(prefers-color-scheme: light)");
    const mqMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    mqTheme?.addEventListener("change", sync);
    mqMotion?.addEventListener("change", sync);
    window.addEventListener(APPEARANCE_SYNC_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      mqTheme?.removeEventListener("change", sync);
      mqMotion?.removeEventListener("change", sync);
      window.removeEventListener(APPEARANCE_SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [appearance]);

  return null;
}

