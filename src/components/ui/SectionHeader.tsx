"use client";

import React from "react";
import { Eyebrow, DisplayHeading, BodyText } from "@/components/ui/Typography";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps {
  eyebrow?: string;
  withDot?: boolean;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  headingAs?: "h1" | "h2" | "h3" | "h4";
  rightSlot?: React.ReactNode;
  /** Optional inline info tooltip placed directly beside the DisplayHeading title. */
  tooltip?: React.ReactNode;
  /** Keep rightSlot inline on small mobile screens by default; enable for wide multi-button action groups. */
  stackRightOnMobile?: boolean;
  withDivider?: boolean;
  className?: string;
}

/**
 * Reusable Section & Module Header Partial
 * Standardizes eyebrow, display title, inline tooltip, full-width description, and right-side action slots across Public & Admin UI.
 */
export function SectionHeader({
  eyebrow,
  withDot = true,
  title,
  description,
  size = "lg",
  headingAs = "h2",
  rightSlot,
  tooltip,
  stackRightOnMobile = false,
  withDivider = false,
  className,
}: SectionHeaderProps) {
  const lastSpaceIdx = tooltip ? title.lastIndexOf(" ") : -1;
  const renderedTitle = !tooltip ? (
    title
  ) : lastSpaceIdx > 0 ? (
    <>
      {title.slice(0, lastSpaceIdx)}{" "}
      <span className="whitespace-nowrap">
        {title.slice(lastSpaceIdx + 1)}
        <span className="inline-flex align-middle ml-1.5">{tooltip}</span>
      </span>
    </>
  ) : (
    <span className="whitespace-nowrap">
      {title}
      <span className="inline-flex align-middle ml-1.5">{tooltip}</span>
    </span>
  );

  const titleWithTooltip = (
    <DisplayHeading as={headingAs} size={size}>
      {renderedTitle}
    </DisplayHeading>
  );

  return (
    <div
      className={cn(
        "space-y-1.5",
        withDivider && "pb-4 border-b border-(--border-subtle)",
        className
      )}
    >
      <div
        className={cn(
          "flex justify-between gap-3 sm:gap-4",
          stackRightOnMobile
            ? "flex-col sm:flex-row sm:items-end"
            : "flex-row items-start sm:items-center"
        )}
      >
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <Eyebrow withDot={withDot} className="mb-1">
              {eyebrow}
            </Eyebrow>
          )}
          {titleWithTooltip}
          {stackRightOnMobile && description && (
            <BodyText
              size="xs"
              tone="secondary"
              className="mt-1.5 max-w-2xl leading-relaxed"
            >
              {description}
            </BodyText>
          )}
        </div>

        {rightSlot && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 max-w-full",
              stackRightOnMobile && "w-full sm:w-auto"
            )}
          >
            {rightSlot}
          </div>
        )}
      </div>

      {!stackRightOnMobile && description && (
        <BodyText
          size="xs"
          tone="secondary"
          className="max-w-2xl leading-relaxed"
        >
          {description}
        </BodyText>
      )}
    </div>
  );
}

