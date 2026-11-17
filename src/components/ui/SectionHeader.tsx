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
  withDivider?: boolean;
  className?: string;
}

/**
 * Reusable Section & Module Header Partial
 * Standardizes eyebrow, display title, description, and right-side action slots across Public & Admin UI.
 */
export function SectionHeader({
  eyebrow,
  withDot = true,
  title,
  description,
  size = "lg",
  headingAs = "h2",
  rightSlot,
  withDivider = false,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4",
        withDivider && "pb-4 border-b border-(--border-subtle)",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <Eyebrow withDot={withDot} className="mb-1">
            {eyebrow}
          </Eyebrow>
        )}
        <DisplayHeading as={headingAs} size={size}>
          {title}
        </DisplayHeading>
        {description && (
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
        <div className="flex items-center gap-2.5 shrink-0">{rightSlot}</div>
      )}
    </div>
  );
}

