"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { StatusPill, type StatusPillProps } from "@/components/ui/StatusPill";
import { cn } from "@/lib/utils";

export interface SettingsNavCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  statusLabel?: string;
  statusVariant?: StatusPillProps["variant"];
  detailText?: string;
  tone?: "default" | "danger";
  onClick: () => void;
  className?: string;
}

/**
 * Windows 11-inspired full-width settings navigation card row.
 * Displays icon badge, title/subtitle stack, contextual telemetry pill, and disclosure arrow.
 */
export function SettingsNavCard({
  icon,
  title,
  subtitle,
  statusLabel,
  statusVariant = "neutral",
  detailText,
  tone = "default",
  onClick,
  className,
}: SettingsNavCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-(--radius-card) border px-4 sm:px-5 py-3.5 sm:py-4 flex items-center justify-between gap-4 transition-all duration-200 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        tone === "danger"
          ? "bg-(--bg-surface) border-(--border-subtle) hover:border-rose-500/55 hover:bg-(--bg-surface-elevated)"
          : "bg-(--bg-surface) border-(--border-subtle) hover:border-(--border-strong) hover:bg-(--bg-surface-elevated)",
        className
      )}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div
          className={cn(
            "w-9.5 h-9.5 rounded-(--radius-control) border flex items-center justify-center shrink-0 transition-colors",
            tone === "danger"
              ? "bg-rose-500/12 border-rose-500/35 text-rose-500 group-hover:border-rose-500/60"
              : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-accent) group-hover:border-brand/35"
          )}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-(--text-primary) group-hover:text-(--text-accent) transition-colors truncate">
            {title}
          </p>
          <p className="text-xs text-(--text-muted) mt-0.5 line-clamp-2 sm:line-clamp-1">
            {subtitle}
          </p>
          {(statusLabel || detailText) && (
            <div className="flex sm:hidden flex-wrap items-center gap-2 mt-1.5">
              {statusLabel && (
                <StatusPill
                  label={statusLabel}
                  variant={statusVariant}
                  size="xs"
                />
              )}
              {detailText && (
                <span className="text-[10px] font-mono text-(--text-muted) truncate">
                  {detailText}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {detailText && (
          <span className="hidden md:inline-block text-[11px] font-mono text-(--text-muted)">
            {detailText}
          </span>
        )}
        {statusLabel && (
          <StatusPill
            label={statusLabel}
            variant={statusVariant}
            size="xs"
            className="hidden sm:inline-flex"
          />
        )}
        <ChevronRight
          className="w-4 h-4 text-(--text-muted) group-hover:text-(--text-primary) group-hover:translate-x-0.5 transition-all"
          aria-hidden="true"
        />
      </div>
    </button>
  );
}
