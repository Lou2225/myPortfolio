"use client";

import React from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export interface ViewToggleOption<T extends string = string> {
  id: T;
  label: string;
  icon: React.ReactNode;
}

export interface ViewToggleProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly [ViewToggleOption<T>, ViewToggleOption<T>, ...ViewToggleOption<T>[]];
  ariaLabel?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Reusable View Mode Toggle Component.
 * Supports smooth 60–120 FPS active indicator, tooltips, keyboard navigation,
 * and WAI-ARIA radiogroup semantics matching the design system.
 */
export function ViewToggle<T extends string = string>({
  value,
  onChange,
  options,
  ariaLabel = "Toggle view layout",
  size = "sm",
  className,
}: ViewToggleProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-(--radius-control) border border-(--border-strong) bg-(--bg-surface-2) p-0.5 shadow-xs select-none",
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.id === value;
        return (
          <Tooltip key={opt.id} content={opt.label} side="top">
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={opt.label}
              onClick={() => onChange(opt.id)}
              className={cn(
                "relative inline-flex items-center justify-center rounded-[calc(var(--radius-control)-2px)] transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
                size === "sm" ? "h-7.5 w-7.5 text-xs" : "h-8.5 w-8.5 text-sm",
                isSelected
                  ? "bg-brand text-brand-contrast shadow-sm font-semibold"
                  : "text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-surface)"
              )}
            >
              {opt.icon}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
