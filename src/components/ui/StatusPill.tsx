"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface StatusPillProps {
  label: string;
  variant?: "success" | "neutral" | "accent" | "warning" | "danger" | "solid";
  size?: "xs" | "sm";
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Reusable Theme-Adaptive Rectangular Status Container Component.
 * Standardizes all status, telemetry, tag, and state indicators across `/admin`
 * using crisp `rounded-sm` geometry consistent with module card badges.
 */
export function StatusPill({
  label,
  variant = "neutral",
  size = "sm",
  icon,
  className,
}: StatusPillProps) {
  const variantClasses = {
    success:
      "bg-emerald-500/12 text-(--text-success) border-emerald-500/35",
    neutral:
      "bg-(--bg-surface-2) text-(--text-muted) border-(--border-subtle)",
    accent:
      "bg-(--bg-badge-highlight) text-(--text-accent) border-brand/35",
    warning:
      "bg-amber-500/12 text-amber-500 border-amber-500/35",
    danger:
      "bg-rose-500/12 text-rose-400 border-rose-500/35",
    solid:
      "bg-brand-solid text-brand-contrast border-brand-solid",
  };

  const sizeClasses = {
    xs: "px-2 py-0.5 text-[0.625rem]",
    sm: "px-2.5 py-1 text-[0.6875rem]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-(--radius-control) border font-mono uppercase tracking-wider font-semibold leading-none whitespace-nowrap shrink-0 select-none",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}
