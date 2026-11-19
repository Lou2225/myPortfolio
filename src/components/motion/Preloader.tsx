"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { usePortfolio } from "@/context/PortfolioContext";
import { MonogramBadge } from "@/components/common/MonogramBadge";
import {
  PRELOADER_SEEN_SESSION_KEY,
  resolveEffectiveReducedMotion,
} from "@/lib/appearance";

export function Preloader() {
  const { profile, appearance } = usePortfolio();
  const pathname = usePathname();
  const preloaderMode = appearance.preloaderMode;
  const reducedMotion = resolveEffectiveReducedMotion(appearance);

  const [complete, setComplete] = useState(() => preloaderMode === "off");
  const [exiting, setExiting] = useState(false);
  const countRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Mount the full-viewport curtain strictly on the flagship "/" storytelling entry.
  const skipPreloader = !pathname || pathname !== "/";

  useEffect(() => {
    if (skipPreloader || complete) {
      return;
    }

    if (preloaderMode === "off") {
      const id = requestAnimationFrame(() => setComplete(true));
      return () => cancelAnimationFrame(id);
    }

    if (preloaderMode === "once-per-session") {
      try {
        if (window.sessionStorage.getItem(PRELOADER_SEEN_SESSION_KEY) === "1") {
          const id = requestAnimationFrame(() => setComplete(true));
          return () => cancelAnimationFrame(id);
        }
      } catch {
        // Ignore storage access errors
      }
    }

    if (reducedMotion) {
      const id = requestAnimationFrame(() => setComplete(true));
      return () => cancelAnimationFrame(id);
    }

    const markSeen = () => {
      if (preloaderMode === "once-per-session") {
        try {
          window.sessionStorage.setItem(PRELOADER_SEEN_SESSION_KEY, "1");
        } catch {
          // Ignore storage access errors
        }
      }
    };

    const countDurationMs = 360;
    const holdAtFullMs = 40;
    const exitDurationMs = 380;
    const startTime = performance.now();
    let rafId = 0;
    let lastShown = -1;
    let lastCommitAt = 0;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;
    let doneTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / countDurationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const nextVal = Math.round(eased * 100);

      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${t >= 1 ? 1 : eased.toFixed(4)})`;
      }

      if (
        nextVal !== lastShown &&
        (now - lastCommitAt >= 32 || t >= 1) &&
        countRef.current
      ) {
        lastShown = nextVal;
        lastCommitAt = now;
        countRef.current.textContent = String(t >= 1 ? 100 : nextVal);
      }

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        pauseTimer = setTimeout(() => {
          setExiting(true);
          doneTimer = setTimeout(() => {
            markSeen();
            setComplete(true);
          }, exitDurationMs);
        }, holdAtFullMs);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      if (pauseTimer !== null) clearTimeout(pauseTimer);
      if (doneTimer !== null) clearTimeout(doneTimer);
    };
  }, [skipPreloader, complete, preloaderMode, reducedMotion]);

  if (complete || skipPreloader || preloaderMode === "off") {
    return null;
  }

  const displayFirst = (profile.name || profile.fullName || "").trim();
  const displayLast = (profile.lastName || "").trim();
  const featuredRoles = profile.roles.slice(0, 3).filter(Boolean);

  return (
    <aside
      aria-label="Site loader"
      style={{
        contain: "layout style paint",
        transform: exiting ? "translate3d(0, -100%, 0)" : "translate3d(0, 0, 0)",
        transition: "transform 0.5s cubic-bezier(0.76, 0, 0.24, 1)",
      }}
      className={`fixed inset-0 z-200 overflow-hidden bg-(--bg-canvas) text-(--text-primary) border-b border-(--border-strong) px-5 sm:px-10 py-6 sm:py-9 select-none shadow-2xl will-change-transform flex flex-col justify-between ${
        exiting ? "pointer-events-none" : "pointer-events-auto"
      }`}
    >
      {/* Subtle Atmospheric Accent Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 42%, var(--accent-glow) 0%, transparent 62%)",
        }}
      />

      {/* Top Curtain Identity Bar */}
      <div
        style={{
          transform: exiting ? "translate3d(0, -14px, 0)" : "translate3d(0, 0, 0)",
          opacity: exiting ? 0.35 : 1,
          transition:
            "transform 0.42s cubic-bezier(0.76, 0, 0.24, 1), opacity 0.32s ease-out",
        }}
        className="relative z-10 max-w-7xl w-full mx-auto flex items-center justify-between gap-4 pb-4 border-b border-(--border-subtle) will-change-transform"
      >
        <div className="flex items-center gap-3 min-w-0">
          <MonogramBadge
            monogram={profile.monogram}
            imageUrl={profile.monogramImageUrl}
            transform={profile.monogramTransform}
            alt={`${profile.fullName} monogram`}
            loading="eager"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-(--border-strong) font-bold text-xs tracking-wider"
          />
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-(--text-primary) truncate">
              {profile.fullName}
            </p>
            <p className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.16em] text-(--text-muted) truncate">
              {profile.education.major}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-(--bg-surface) border border-(--border-subtle) text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-secondary) shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse shrink-0" />
          <span className="text-(--text-accent) font-bold">CH // 00</span>
          <span className="hidden sm:inline text-(--text-muted)">
            · Warming Up
          </span>
        </div>
      </div>

      {/* Center Editorial Focal Stage */}
      <div
        style={{
          transform: exiting ? "translate3d(0, -24px, 0)" : "translate3d(0, 0, 0)",
          opacity: exiting ? 0.25 : 1,
          transition:
            "transform 0.46s cubic-bezier(0.76, 0, 0.24, 1), opacity 0.34s ease-out",
        }}
        className="relative z-10 max-w-7xl w-full mx-auto my-auto py-6 flex flex-col items-start justify-center min-w-0 will-change-transform"
      >
        <div className="flex items-center gap-2.5 text-[10px] sm:text-xs font-mono uppercase tracking-[0.22em] text-(--text-accent) mb-3 sm:mb-4 max-w-full">
          <span className="w-5 sm:w-8 h-px bg-brand shrink-0" />
          <span className="truncate">
            {profile.headline} · Class of {profile.education.graduationYear}
          </span>
        </div>

        <div className="font-display uppercase tracking-tight leading-[0.86] text-[clamp(2.75rem,11vw,8.25rem)] max-w-full">
          {displayFirst && (
            <span className="block text-(--text-primary) wrap-break-word">
              {displayFirst}
            </span>
          )}
          {displayLast && (
            <span className="block text-(--text-accent) wrap-break-word">
              {displayLast}
            </span>
          )}
        </div>

        {featuredRoles.length > 0 && (
          <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs font-mono uppercase tracking-[0.16em] text-(--text-muted)">
            {featuredRoles.map((role, idx) => (
              <span key={role} className="inline-flex items-center gap-3">
                {idx > 0 && (
                  <span
                    aria-hidden="true"
                    className="w-1 h-1 rounded-full bg-brand/70"
                  />
                )}
                <span>{role}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Progress Rail & Tabular Counter */}
      <div
        style={{
          transform: exiting ? "translate3d(0, -14px, 0)" : "translate3d(0, 0, 0)",
          opacity: exiting ? 0.35 : 1,
          transition:
            "transform 0.42s cubic-bezier(0.76, 0, 0.24, 1), opacity 0.32s ease-out",
        }}
        className="relative z-10 max-w-7xl w-full mx-auto pt-4 border-t border-(--border-subtle) flex flex-col gap-3 sm:gap-4 will-change-transform"
      >
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.2em] text-(--text-muted) block truncate">
              {profile.education.status}
            </span>
            <p className="text-xs sm:text-sm text-(--text-secondary) mt-0.5 truncate">
              Preparing workspace &amp; systems
            </p>
          </div>

          <div
            aria-live="off"
            className="font-display text-5xl sm:text-7xl md:text-8xl leading-none tracking-tight tabular-nums font-normal text-(--text-primary) shrink-0"
          >
            <span ref={countRef}>0</span>
            <span className="text-(--text-accent) ml-1">%</span>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="relative h-0.5 w-full bg-(--border-subtle) overflow-hidden"
        >
          <div
            ref={barRef}
            style={{ transform: "scaleX(0)" }}
            className="h-full w-full bg-brand origin-left will-change-transform"
          />
        </div>
      </div>
    </aside>
  );
}
