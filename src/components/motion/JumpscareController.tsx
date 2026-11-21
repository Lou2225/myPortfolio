"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";
import { resolveInstantImageUrl } from "@/lib/instantImageCache";
import {
  JUMPSCARE_TRIGGER_EVENT,
  type JumpscareTriggerDetail,
  armPrankQueryForPage,
  clearPrankQueryArmed,
  hasPrankQueryParam,
  isPrankQueryArmed,
} from "@/lib/jumpscare";
import {
  ensureAudioContextUnlocked,
  preloadJumpscareAudio,
  resolveJumpscareVolume,
  startJumpscareAudioInstant,
} from "@/lib/jumpscareAudio";
import { TransformedImage } from "@/components/ui/TransformedImage";

function BuiltInGlitchVisual({ caption }: { caption: string }) {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-4 sm:p-8 select-none overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,59,29,0.34)_0%,rgba(12,0,0,0.92)_64%,#000_100%)]"
      />
      <svg
        viewBox="0 0 240 240"
        aria-hidden="true"
        className="relative z-10 w-[min(92vw,78vh)] h-[min(92vw,78vh)] drop-shadow-[0_0_64px_rgba(255,35,20,0.95)]"
      >
        <circle
          cx="120"
          cy="120"
          r="102"
          fill="#060608"
          stroke="#ff2b17"
          strokeWidth="6"
        />
        {/* Piercing asymmetric crimson eyes */}
        <path d="M40 78 L104 104 L48 118 Z" fill="#ff2b17" />
        <path d="M200 78 L136 104 L192 118 Z" fill="#ff2b17" />
        <circle cx="72" cy="100" r="6" fill="#ffffff" />
        <circle cx="168" cy="100" r="6" fill="#ffffff" />
        {/* Sharp ragged grin */}
        <path
          d="M46 146 L68 184 L86 150 L104 192 L120 150 L136 192 L154 150 L172 184 L194 146 L174 166 L154 140 L136 168 L120 138 L104 168 L86 140 L66 166 Z"
          fill="#f3f1ea"
        />
        <rect x="16" y="72" width="208" height="3" fill="#ff3b1d" opacity="0.65" />
        <rect x="24" y="132" width="192" height="3" fill="#f3f1ea" opacity="0.45" />
      </svg>
      <p className="relative z-20 -mt-6 font-display text-5xl sm:text-7xl md:text-8xl uppercase tracking-tighter text-brand drop-shadow-[0_6px_30px_rgba(0,0,0,1)] text-center">
        {caption}
      </p>
    </div>
  );
}

/**
 * Full-viewport GPU Jumpscare / Easter Egg overlay controller.
 * Pre-downloads & decodes configured audio in RAM on page load so audio and
 * full-screen slam hit synchronously (< 3ms) with zero async/gesture expiry delay.
 */
export function JumpscareController() {
  const { appearance, updatedAt } = usePortfolio();
  const pathname = usePathname();
  const isAdminRoute = Boolean(pathname?.startsWith("/admin"));

  const [active, setActive] = useState(false);
  const [reducedToastMode, setReducedToastMode] = useState(false);

  const activeRef = useRef(false);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTrapFiredKeyRef = useRef<string | null>(null);

  const configSignature = [
    Boolean(appearance.jumpscareEnabled),
    appearance.jumpscareTrigger || "secret-taps",
    appearance.jumpscareAudioUrl || "",
    appearance.jumpscareImageUrl || "",
    updatedAt || "",
  ].join("|");

  const dismissScare = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    activeRef.current = false;
    setActive(false);
  }, []);

  // Pre-fetch audio cleanly and pre-warm scare graphic asynchronously after initial paint
  useEffect(() => {
    if (!appearance.jumpscareEnabled && !isAdminRoute) return;
    ensureAudioContextUnlocked();

    if (appearance.jumpscareAudioUrl) {
      preloadJumpscareAudio(appearance.jumpscareAudioUrl);
    }

    const rawScareImage = appearance.jumpscareImageUrl;
    if (!rawScareImage || typeof Image === "undefined") return;

    let cancelled = false;
    const warmScareImage = () => {
      if (cancelled) return;
      const prewarmImg = new Image();
      prewarmImg.decoding = "async";
      prewarmImg.src = resolveInstantImageUrl(rawScareImage);
    };

    const winIdle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId = 0;
    const timerId = window.setTimeout(() => {
      if (typeof winIdle.requestIdleCallback === "function") {
        idleId = winIdle.requestIdleCallback(warmScareImage, { timeout: 1500 });
      } else {
        warmScareImage();
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      if (idleId && typeof winIdle.cancelIdleCallback === "function") {
        winIdle.cancelIdleCallback(idleId);
      }
    };
  }, [
    isAdminRoute,
    appearance.jumpscareEnabled,
    appearance.jumpscareAudioUrl,
    appearance.jumpscareImageUrl,
  ]);

  // Reset per-visit auto-trap gate cleanly whenever jumpscare config updates
  useEffect(() => {
    autoTrapFiredKeyRef.current = null;
  }, [configSignature]);

  const triggerScare = useCallback(() => {
    dismissScare();

    const reduced = resolveEffectiveReducedMotion(appearance);
    const safeVol = resolveJumpscareVolume(appearance.jumpscareVolume);

    // Trigger preloaded RAM AudioBuffer / Blob synchronously inside the active gesture tick
    const stopAudio = startJumpscareAudioInstant(
      appearance.jumpscareAudioUrl,
      reduced ? Math.min(0.25, safeVol) : safeVol
    );

    stopAudioRef.current = stopAudio;
    activeRef.current = true;
    setReducedToastMode(reduced);
    setActive(true);

    dismissTimerRef.current = setTimeout(
      () => {
        dismissScare();
      },
      reduced ? 2400 : 1750
    );
  }, [appearance, dismissScare]);

  // Clean up timers & audio on unmount
  useEffect(() => {
    return () => dismissScare();
  }, [dismissScare]);

  // Arm `?prank=1` stealth URL safely across StrictMode double-mounts
  useEffect(() => {
    if (isAdminRoute || typeof window === "undefined") return;
    if (hasPrankQueryParam(window.location.search)) {
      armPrankQueryForPage();
      try {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("prank");
        window.history.replaceState(null, "", nextUrl.toString());
      } catch {
        // Ignore history restrictions
      }
    }
  }, [isAdminRoute, pathname]);

  // Subscribe to explicit trigger events (`Admin Preview`, `Get In Touch`, `Contact Me`, `Avatar 5x`, `Footer`)
  useEffect(() => {
    const handleTriggerEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<JumpscareTriggerDetail>).detail;
      if (!detail) return;

      if (detail.source === "preview") {
        triggerScare();
        return;
      }

      if (isAdminRoute || !appearance.jumpscareEnabled) return;

      const mode = appearance.jumpscareTrigger || "secret-taps";
      if (detail.source === mode || detail.forceReplay) {
        triggerScare();
      }
    };

    window.addEventListener(JUMPSCARE_TRIGGER_EVENT, handleTriggerEvent);
    return () => {
      window.removeEventListener(JUMPSCARE_TRIGGER_EVENT, handleTriggerEvent);
    };
  }, [
    isAdminRoute,
    appearance.jumpscareEnabled,
    appearance.jumpscareTrigger,
    triggerScare,
  ]);

  // Handle `first-click` (capture phase), `?prank=1` first-interaction trap, keyboard "boo", & Esc close
  useEffect(() => {
    if (typeof window === "undefined") return;

    let booBuffer = "";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeRef.current) {
        dismissScare();
        return;
      }

      if (isAdminRoute || !appearance.jumpscareEnabled) return;

      const mode = appearance.jumpscareTrigger || "secret-taps";
      if (mode !== "secret-taps") return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key.length === 1) {
        booBuffer = (booBuffer + e.key.toLowerCase()).slice(-3);
        if (booBuffer === "boo") {
          booBuffer = "";
          triggerScare();
        }
      }
    };

    const handleDocumentClickCapture = (e: MouseEvent) => {
      if (isAdminRoute || !appearance.jumpscareEnabled) return;
      if (activeRef.current) return;

      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "[data-brand-portal='true'], [data-brand-portal-orb='true']"
        )
      ) {
        return;
      }
      if (target?.closest("[data-jumpscare-overlay='true']")) return;

      const mode = appearance.jumpscareTrigger || "secret-taps";
      const armedByLink = mode === "prank-link" && isPrankQueryArmed();

      if (mode !== "first-click" && !armedByLink) return;
      if (mode === "first-click" && autoTrapFiredKeyRef.current === configSignature) {
        return;
      }

      if (armedByLink) {
        clearPrankQueryArmed();
      }
      if (mode === "first-click") {
        autoTrapFiredKeyRef.current = configSignature;
      }

      // Pause navigation/hash-scroll on the prank click so the full-screen scare hits in place
      if (target?.closest("a, button")) {
        e.preventDefault();
        e.stopPropagation();
      }

      triggerScare();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleDocumentClickCapture, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleDocumentClickCapture, true);
    };
  }, [
    isAdminRoute,
    appearance.jumpscareEnabled,
    appearance.jumpscareTrigger,
    configSignature,
    dismissScare,
    triggerScare,
  ]);

  if (!active) return null;

  const caption = (appearance.jumpscareCaption || "").trim();
  const rawImageUrl = (appearance.jumpscareImageUrl || "").trim();
  const imageUrl = rawImageUrl ? resolveInstantImageUrl(rawImageUrl) : "";

  if (reducedToastMode) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Easter Egg Surprise"
        data-jumpscare-overlay="true"
        onClick={dismissScare}
        className="fixed inset-x-4 bottom-6 sm:left-auto sm:right-6 sm:max-w-sm z-10005 p-4 rounded-(--radius-card) bg-(--bg-surface) border border-brand shadow-2xl flex items-center justify-between gap-3 cursor-pointer"
      >
        <div className="min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-(--text-accent) block">
            Easter Egg Triggered
          </span>
          <p className="font-display text-2xl uppercase tracking-tight text-(--text-primary) truncate">
            {caption || "GOTCHA."}
          </p>
        </div>
        <button
          type="button"
          onClick={dismissScare}
          aria-label="Dismiss easter egg"
          className="p-1.5 rounded-full border border-(--border-subtle) text-(--text-muted) hover:text-(--text-primary) cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Easter Egg Jumpscare Overlay"
      data-jumpscare-overlay="true"
      onClick={dismissScare}
      className="fixed inset-0 w-screen h-dvh z-10005 bg-black overflow-hidden select-none cursor-pointer"
    >
      {/* Full-viewport exploding slam + micro-tremor jitter */}
      <div className="relative w-full h-full animate-[lou-scare-slam_0.28s_cubic-bezier(0.16,1,0.3,1)_forwards,lou-scare-jitter_0.16s_steps(2)_0.28s_infinite]">
        {imageUrl ? (
          <div className="relative w-full h-full bg-black overflow-hidden">
            <TransformedImage
              src={imageUrl}
              alt={caption || "Jumpscare visual"}
              transform={appearance.jumpscareImageTransform}
              defaultFit="cover"
              defaultPosition="center"
              loading="eager"
              fetchPriority="high"
              className="w-full h-full"
            />
          </div>
        ) : (
          <BuiltInGlitchVisual caption={caption || "GOTCHA."} />
        )}
      </div>

      {/* Intense horror crimson vignette & scanline film grain */}
      <div
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at center, transparent 32%, rgba(160,12,8,0.48) 78%, rgba(0,0,0,0.92) 100%)",
        }}
        className="absolute inset-0 pointer-events-none"
      />
      <div
        aria-hidden="true"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 2px, transparent 2px, transparent 5px)",
        }}
        className="absolute inset-0 pointer-events-none opacity-70"
      />

      {/* Full-bleed bottom caption overlay when a custom image is active */}
      {imageUrl && caption && (
        <div className="absolute inset-x-0 bottom-8 sm:bottom-12 z-20 flex flex-col items-center justify-center px-6 pointer-events-none">
          <p className="font-display text-5xl sm:text-7xl md:text-8xl uppercase tracking-tighter text-brand drop-shadow-[0_6px_32px_rgba(0,0,0,1)] text-center">
            {caption}
          </p>
        </div>
      )}

      <span className="absolute bottom-3 inset-x-0 text-center z-20 text-[10px] font-mono uppercase tracking-[0.22em] text-white/55 pointer-events-none">
        Click or press Esc to close
      </span>
    </div>
  );
}
