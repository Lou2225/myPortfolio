"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  APPEARANCE_SYNC_EVENT,
  applyAppearanceToDocument,
  sanitizeAppearanceConfig,
} from "@/lib/appearance";
import { TransformedImage } from "@/components/ui/TransformedImage";

const INTERACTIVE_POINTER_SELECTOR = [
  "a",
  "button:not(:disabled)",
  "summary",
  "label[for]",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "select:not(:disabled)",
  "input[type='checkbox']:not(:disabled)",
  "input[type='radio']:not(:disabled)",
  "input[type='submit']:not(:disabled)",
  "input[type='button']:not(:disabled)",
  ".cursor-pointer",
].join(", ");

const NATIVE_CURSOR_PASSTHROUGH_SELECTOR = [
  "input:not([type='checkbox']):not([type='radio']):not([type='submit']):not([type='button']):not([type='reset']):not([type='range']):not([type='file'])",
  "textarea",
  "[contenteditable='true']",
  ".cursor-crosshair",
  "iframe",
  "[data-cursor='native']",
].join(", ");

/**
 * Keeps `<html>` data attributes, CSS accent palette, font pairing, surface radii,
 * custom cursor variables, motion mode, and browser theme-color synchronized in real time.
 * Also mounts a zero-lag GPU-composited custom cursor layer (`translate3d`) on desktop fine
 * pointers so cursors >32px never trigger Chromium's native CSS `url()` edge-of-viewport fallback.
 */
export function AppearanceRuntimeSync() {
  const { appearance } = usePortfolio();
  const pathname = usePathname();
  const safe = sanitizeAppearanceConfig(appearance);

  const cursorRootRef = useRef<HTMLDivElement>(null);
  const defaultSlotRef = useRef<HTMLDivElement>(null);
  const pointerSlotRef = useRef<HTMLDivElement>(null);
  const [finePointerSupported, setFinePointerSupported] = useState(false);

  const defaultUrl = (
    safe.customCursorDefaultUrl ||
    safe.customCursorPointerUrl ||
    ""
  ).trim();
  const pointerUrl = (
    safe.customCursorPointerUrl ||
    safe.customCursorDefaultUrl ||
    ""
  ).trim();
  const isCurBinary =
    /\.(cur)(?:$|\?)/i.test(defaultUrl) || /\.(cur)(?:$|\?)/i.test(pointerUrl);
  const overlayEnabled = Boolean(
    finePointerSupported &&
      safe.customCursorEnabled &&
      (defaultUrl || pointerUrl) &&
      !isCurBinary
  );

  const cursorSize = safe.customCursorSize ?? 48;
  const hotspotX = safe.customCursorHotspotX ?? 4;
  const hotspotY = safe.customCursorHotspotY ?? 4;

  useEffect(() => {
    const sync = () => {
      applyAppearanceToDocument(appearance, { pathname });
    };

    sync();

    const mqTheme = window.matchMedia?.("(prefers-color-scheme: light)");
    const mqMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const mqPointer = window.matchMedia?.("(hover: hover) and (pointer: fine)");

    const syncPointerCapability = () => {
      setFinePointerSupported(Boolean(mqPointer?.matches));
    };
    syncPointerCapability();

    mqTheme?.addEventListener("change", sync);
    mqMotion?.addEventListener("change", sync);
    mqPointer?.addEventListener("change", syncPointerCapability);
    window.addEventListener(APPEARANCE_SYNC_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      mqTheme?.removeEventListener("change", sync);
      mqMotion?.removeEventListener("change", sync);
      mqPointer?.removeEventListener("change", syncPointerCapability);
      window.removeEventListener(APPEARANCE_SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [appearance, pathname]);

  useEffect(() => {
    const docEl = document.documentElement;
    if (!overlayEnabled) {
      docEl.removeAttribute("data-cursor-overlay");
      return;
    }

    docEl.setAttribute("data-cursor-overlay", "ready");
    const rootEl = cursorRootRef.current;
    const defEl = defaultSlotRef.current;
    const ptrEl = pointerSlotRef.current;
    if (!rootEl || !defEl || !ptrEl) {
      return () => {
        docEl.removeAttribute("data-cursor-overlay");
      };
    }

    let visible = false;
    let isPointerMode = false;

    const applyMode = (nextPointer: boolean) => {
      if (isPointerMode === nextPointer) return;
      isPointerMode = nextPointer;
      defEl.style.opacity = nextPointer ? "0" : "1";
      ptrEl.style.opacity = nextPointer ? "1" : "0";
    };

    const setVisibility = (nextVisible: boolean) => {
      if (visible === nextVisible) return;
      visible = nextVisible;
      rootEl.style.opacity = nextVisible ? "1" : "0";
    };

    const resolveTargetMode = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return { passthrough: false, interactive: false };
      }
      if (target.closest(NATIVE_CURSOR_PASSTHROUGH_SELECTOR)) {
        return { passthrough: true, interactive: false };
      }
      const interactive = Boolean(
        target.closest(INTERACTIVE_POINTER_SELECTOR)
      );
      return { passthrough: false, interactive };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") {
        setVisibility(false);
        return;
      }

      const x = e.clientX - hotspotX;
      const y = e.clientY - hotspotY;
      rootEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;

      const hit =
        e.target instanceof Element
          ? e.target
          : document.elementFromPoint(e.clientX, e.clientY);
      const { passthrough, interactive } = resolveTargetMode(hit);
      if (passthrough) {
        setVisibility(false);
        return;
      }

      applyMode(interactive);
      setVisibility(true);
    };

    const handleMouseOutWindow = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        setVisibility(false);
      }
    };

    const handleWindowBlur = () => {
      setVisibility(false);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerMove, { passive: true });
    document.addEventListener("mouseout", handleMouseOutWindow, {
      passive: true,
    });
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      docEl.removeAttribute("data-cursor-overlay");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerMove);
      document.removeEventListener("mouseout", handleMouseOutWindow);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [overlayEnabled, hotspotX, hotspotY]);

  if (!overlayEnabled) {
    return null;
  }

  return (
    <div
      ref={cursorRootRef}
      aria-hidden="true"
      style={{
        width: `${cursorSize}px`,
        height: `${cursorSize}px`,
        opacity: 0,
        transform: "translate3d(-200px, -200px, 0)",
        zIndex: 10002,
      }}
      className="fixed top-0 left-0 pointer-events-none select-none will-change-transform transition-opacity duration-75"
    >
      <div
        ref={defaultSlotRef}
        style={{ opacity: 1 }}
        className="absolute inset-0 w-full h-full"
      >
        <TransformedImage
          src={defaultUrl}
          alt=""
          transform={safe.customCursorDefaultTransform}
          defaultFit="contain"
          defaultPosition="center"
          className="w-full h-full"
        />
      </div>

      <div
        ref={pointerSlotRef}
        style={{ opacity: 0 }}
        className="absolute inset-0 w-full h-full"
      >
        <TransformedImage
          src={pointerUrl}
          alt=""
          transform={
            safe.customCursorPointerUrl?.trim()
              ? safe.customCursorPointerTransform
              : safe.customCursorDefaultTransform
          }
          defaultFit="contain"
          defaultPosition="center"
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
