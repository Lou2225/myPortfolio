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
  const [complete, setComplete] = useState(
    () => appearance.preloaderMode === "off"
  );
  const [exiting, setExiting] = useState(false);
  const countRef = useRef<HTMLSpanElement>(null);

  // Mount the loader strip strictly on the flagship "/" storytelling entry.
  const skipPreloader = !pathname || pathname !== "/";

  useEffect(() => {
    if (skipPreloader || complete) {
      return;
    }

    if (appearance.preloaderMode === "off") {
      const id = requestAnimationFrame(() => setComplete(true));
      return () => cancelAnimationFrame(id);
    }

    if (appearance.preloaderMode === "once-per-session") {
      try {
        if (window.sessionStorage.getItem(PRELOADER_SEEN_SESSION_KEY) === "1") {
          const id = requestAnimationFrame(() => setComplete(true));
          return () => cancelAnimationFrame(id);
        }
      } catch {
        // Ignore storage access errors
      }
    }

    if (resolveEffectiveReducedMotion(appearance)) {
      const id = requestAnimationFrame(() => setComplete(true));
      return () => cancelAnimationFrame(id);
    }

    const markSeen = () => {
      if (appearance.preloaderMode === "once-per-session") {
        try {
          window.sessionStorage.setItem(PRELOADER_SEEN_SESSION_KEY, "1");
        } catch {
          // Ignore storage access errors
        }
      }
    };

    const countDurationMs = 500;
    const startTime = performance.now();
    let rafId = 0;
    let lastShown = -1;
    let lastCommitAt = 0;
    let doneTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / countDurationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const nextVal = Math.round(eased * 100);
      if (
        nextVal !== lastShown &&
        (now - lastCommitAt >= 48 || t >= 1) &&
        countRef.current
      ) {
        lastShown = nextVal;
        lastCommitAt = now;
        countRef.current.textContent = String(nextVal);
      }
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setExiting(true);
        doneTimer = setTimeout(() => {
          markSeen();
          setComplete(true);
        }, 380);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      if (doneTimer !== null) clearTimeout(doneTimer);
    };
  }, [skipPreloader, complete, appearance]);

  if (complete || skipPreloader || appearance.preloaderMode === "off") {
    return null;
  }

  return (
    <aside
      aria-label="Site loader"
      style={{
        contain: "layout style paint",
        transform: exiting ? "translate3d(0, -100%, 0)" : "translate3d(0, 0, 0)",
        opacity: exiting ? 0 : 1,
        transition:
          "transform 0.36s cubic-bezier(0.76, 0, 0.24, 1), opacity 0.28s ease-out",
      }}
      className="fixed inset-x-0 top-0 z-100 h-16 sm:h-20 bg-(--bg-canvas) border-b border-(--border-subtle) px-4 sm:px-10 text-(--text-primary) select-none pointer-events-none shadow-lg"
    >
      <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <MonogramBadge
            monogram={profile.monogram}
            imageUrl={profile.monogramImageUrl}
            transform={profile.monogramTransform}
            alt={`${profile.fullName} monogram`}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-(--border-strong) font-bold text-xs tracking-wider"
          />
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-(--text-primary) truncate">
              {profile.fullName}
            </p>
            <p className="hidden sm:block text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-accent) truncate">
              {profile.headline} · Class of {profile.education.graduationYear}
            </p>
          </div>
        </div>

        <div className="flex items-baseline gap-2 shrink-0">
          <span className="hidden md:inline text-[10px] font-mono uppercase tracking-[0.2em] text-(--text-muted)">
            {profile.education.status}
          </span>
          <div className="font-display text-3xl sm:text-4xl leading-none tracking-tight tabular-nums font-normal text-(--text-primary)">
            <span ref={countRef}>0</span>
            <span className="text-(--text-accent) ml-0.5">%</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
