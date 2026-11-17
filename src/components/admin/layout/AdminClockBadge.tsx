"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export interface AdminClockBadgeProps {
  className?: string;
}

/**
 * Hydration-safe live local date and time badge displayed beside the navbar ThemeToggle.
 * Pauses its tick while the document tab is hidden to avoid background CPU work.
 */
export function AdminClockBadge({ className }: AdminClockBadgeProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const syncNow = () => setNow(new Date());
    const initialRaf = requestAnimationFrame(syncNow);

    let timer: ReturnType<typeof setInterval> | null = null;

    const startTick = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (document.visibilityState === "visible") {
          setNow(new Date());
        }
      }, 1000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncNow();
        startTick();
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    startTick();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelAnimationFrame(initialRaf);
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const formatted = useMemo(() => {
    if (!now) {
      return {
        weekday: "",
        shortDate: "",
        shortTime: "",
        fullTime: "",
        tooltipText: "Local workstation date & time",
        iso: undefined as string | undefined,
      };
    }

    const weekday = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
    }).format(now);

    const shortDate = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(now);

    const shortTime = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(now);

    const fullTime = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(now);

    const fullDate = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(now);

    const timeZone =
      new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
        .formatToParts(now)
        .find((part) => part.type === "timeZoneName")?.value ?? "";

    return {
      weekday,
      shortDate,
      shortTime,
      fullTime,
      tooltipText: timeZone
        ? `${fullDate} · ${fullTime} (${timeZone})`
        : `${fullDate} · ${fullTime}`,
      iso: now.toISOString(),
    };
  }, [now]);

  if (!now) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "hidden min-[460px]:inline-flex items-center h-8.5 w-21 sm:w-39 md:w-47 rounded-full border border-(--border-subtle) bg-(--bg-surface-2)/40 animate-pulse shrink-0",
          className
        )}
      />
    );
  }

  return (
    <Tooltip content={formatted.tooltipText} side="bottom">
      <div
        role="timer"
        aria-live="off"
        tabIndex={0}
        aria-label={formatted.tooltipText}
        className={cn(
          "hidden min-[460px]:inline-flex items-center gap-1.5 h-8.5 px-2.5 sm:px-3 rounded-full border border-(--border-strong) bg-(--bg-surface-1)/70 text-(--text-secondary) hover:border-brand/60 transition-colors select-none shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          className
        )}
      >
        <Clock
          aria-hidden="true"
          className="w-3.5 h-3.5 text-(--text-accent) shrink-0"
        />
        <time
          dateTime={formatted.iso}
          className="font-mono tabular-nums text-[10px] sm:text-[11px] uppercase tracking-[0.08em] leading-none whitespace-nowrap inline-flex items-center"
        >
          <span className="hidden lg:inline text-(--text-muted) mr-1">
            {formatted.weekday},
          </span>
          <span className="hidden sm:inline text-(--text-secondary)">
            {formatted.shortDate}
          </span>
          <span
            aria-hidden="true"
            className="hidden sm:inline mx-1.5 text-(--border-strong)"
          >
            ·
          </span>
          <span className="lg:hidden text-(--text-primary) font-medium">
            {formatted.shortTime}
          </span>
          <span className="hidden lg:inline text-(--text-primary) font-medium">
            {formatted.fullTime}
          </span>
        </time>
      </div>
    </Tooltip>
  );
}
