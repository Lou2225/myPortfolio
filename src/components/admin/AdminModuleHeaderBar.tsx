"use client";

import React from "react";
import { AlertCircle, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
  /** Stick smoothly below the top navbar on `sm+` viewports (default: `true`). */
  sticky?: boolean;
  dataCascade?: boolean;
  liveErrorsCount?: number;
  onFollowIssue?: () => void;
  hasUnsavedChanges?: boolean;
  onDiscard?: () => void;
  saving?: boolean;
  submitLabel?: string;
  /** Extra action rendered cleanly before the primary Save button (e.g. Add Project). */
  extraAction?: React.ReactNode;
  /** Custom right-hand slot replacing the default form Save/Discard action bar (e.g. filter tabs). */
  rightSlot?: React.ReactNode;
  className?: string;
}

/**
 * Unified top header & responsive sticky action bar used across `/admin` modules
 * so icon framing, heading typography, tooltips, and mobile buttons match the Profile module.
 */
export function AdminModuleHeaderBar({
  icon,
  title,
  tooltipLabel,
  tooltipContent,
  subtitle,
  showSubtitleOnMobile = false,
  sticky = true,
  dataCascade = false,
  liveErrorsCount = 0,
  onFollowIssue,
  hasUnsavedChanges = false,
  onDiscard,
  saving = false,
  submitLabel = "Save & Publish",
  extraAction,
  rightSlot,
  className,
}: AdminModuleHeaderBarProps) {
  return (
    <div
      data-cascade={dataCascade ? "true" : undefined}
      data-sticky-ceiling={sticky ? "true" : undefined}
      className={cn(
        "bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4",
        sticky && "lg:sticky lg:top-16 [@media(max-height:680px)]:static z-20 shadow-xl",
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

      {rightSlot ? (
        <div className="pt-3 border-t border-(--border-subtle)/70 lg:border-t-0 lg:pt-0 w-full lg:w-auto lg:shrink-0 flex justify-start lg:justify-end">
          {rightSlot}
        </div>
      ) : (
        <div className="flex flex-wrap items-center sm:justify-end gap-2 sm:gap-2.5 pt-3 border-t border-(--border-subtle)/70 lg:border-t-0 lg:pt-0 w-full lg:w-auto lg:shrink-0">
          {liveErrorsCount > 0 && onFollowIssue && (
            <div className="w-full sm:w-auto">
              <Button
                type="button"
                variant="danger"
                size="sm"
                fullWidth
                onClick={onFollowIssue}
                title="Jump smoothly to the next field requiring attention"
                className="h-10 px-3 sm:px-4 font-mono"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {liveErrorsCount} Issue{liveErrorsCount === 1 ? "" : "s"} · Follow
                </span>
              </Button>
            </div>
          )}

          {hasUnsavedChanges && onDiscard && (
            <div className="flex-1 sm:flex-initial sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                fullWidth
                onClick={onDiscard}
                disabled={saving}
                className="h-10 px-3 sm:px-4 font-mono"
              >
                <RotateCcw
                  className="w-3.5 h-3.5 text-(--text-muted) shrink-0"
                  aria-hidden="true"
                />
                <span>Discard</span>
              </Button>
            </div>
          )}

          {extraAction && (
            <div className="flex-1 sm:flex-initial sm:w-auto">{extraAction}</div>
          )}

          <div className="flex-[1.45] sm:flex-initial sm:w-auto">
            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              disabled={saving}
              className="h-10 px-3 sm:px-6 text-[0.6875rem] sm:text-xs tracking-[0.14em] sm:tracking-[0.16em]"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <Save className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>{submitLabel}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
