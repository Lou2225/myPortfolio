"use client";

import React from "react";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export interface AdminModuleHeaderBarProps {
  icon: React.ReactNode;
  title: string;
  tooltipLabel?: string;
  tooltipContent?: string;
  subtitle?: React.ReactNode;
  /** Keep subtitle visible below `sm` (useful for live item counts like Projects). */
  showSubtitleOnMobile?: boolean;
  dataCascade?: boolean;
  /** Optional operational action rendered on the right (e.g. Add Project). */
  extraAction?: React.ReactNode;
  /** Custom right-hand slot (e.g. Inbox filter tabs). */
  rightSlot?: React.ReactNode;
  className?: string;
}

/**
 * Clean, lightweight top header card used across `/admin` modules.
 * All workspace status displays and Save / Discard / Validation actions
 * live exclusively in the floating Brand Portal capsule.
 */
export function AdminModuleHeaderBar({
  icon,
  title,
  tooltipLabel,
  tooltipContent,
  subtitle,
  showSubtitleOnMobile = false,
  dataCascade = false,
  extraAction,
  rightSlot,
  className,
}: AdminModuleHeaderBarProps) {
  const trailingSlot = rightSlot || extraAction;

  return (
    <div
      data-cascade={dataCascade ? "true" : undefined}
      className={cn(
        "bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/35 flex items-center justify-center shrink-0 text-(--text-accent)">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="font-display text-[1.0625rem] sm:text-xl xl:text-2xl uppercase tracking-tight leading-[1.12] text-(--text-primary) min-w-0">
              {title}
            </h2>

            {tooltipLabel && tooltipContent && (
              <InfoTooltip
                label={tooltipLabel}
                content={tooltipContent}
                side="bottom"
                className="shrink-0"
              />
            )}
          </div>

          {subtitle && (
            <p
              className={cn(
                "text-xs text-(--text-muted) mt-0.5",
                !showSubtitleOnMobile && "hidden sm:block"
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {trailingSlot && (
        <div className="pt-3 border-t border-(--border-subtle)/70 lg:border-t-0 lg:pt-0 w-full lg:w-auto lg:shrink-0 flex justify-start lg:justify-end">
          {trailingSlot}
        </div>
      )}
    </div>
  );
}
