import React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 1. Eyebrow — Reusable chapter/layer mono tag with optional indicator dot
 */
export interface EyebrowProps {
  children: React.ReactNode;
  withDot?: boolean;
  pulseDot?: boolean;
  className?: string;
}

export function Eyebrow({
  children,
  withDot = false,
  pulseDot = false,
  className,
}: EyebrowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 font-mono uppercase tracking-[0.22em] text-(--text-accent) font-semibold text-[calc(0.6875rem*var(--public-scale,1))] sm:text-[calc(0.75rem*var(--public-scale,1))]",
        className
      )}
    >
      {withDot && (
        <span
          className={cn(
            "w-2 h-2 rounded-full bg-brand shrink-0",
            pulseDot && "animate-ping"
          )}
        />
      )}
      <span>{children}</span>
    </div>
  );
}

/**
 * 2. DisplayHeading — Reusable Anton display typography (H1–H4)
 */
export interface DisplayHeadingProps {
  as?: "h1" | "h2" | "h3" | "h4" | "span";
  size?: "hero" | "xl" | "lg" | "md" | "sm";
  tone?: "primary" | "accent" | "muted";
  hoverAccent?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function DisplayHeading({
  as: Tag = "h2",
  size = "lg",
  tone = "primary",
  hoverAccent = false,
  className,
  children,
}: DisplayHeadingProps) {
  const sizeStyles = {
    hero: "text-[calc(clamp(2.125rem,1.4rem+4.2vw,5.5rem)*var(--public-scale,1))] leading-[0.94]",
    xl: "text-[calc(clamp(1.875rem,1.25rem+3.4vw,4.5rem)*var(--public-scale,1))] leading-[0.96]",
    lg: "text-[calc(clamp(1.625rem,1.15rem+2.2vw,3.125rem)*var(--public-scale,1))] leading-[1.02]",
    md: "text-[calc(clamp(1.25rem,0.95rem+1.2vw,1.875rem)*var(--public-scale,1))] leading-[1.06]",
    sm: "text-[calc(clamp(1.0625rem,0.9rem+0.8vw,1.5rem)*var(--public-scale,1))] leading-[1.08]",
  };

  const toneStyles = {
    primary: "text-(--text-primary)",
    accent: "text-(--text-accent)",
    muted: "text-(--text-muted)",
  };

  return (
    <Tag
      className={cn(
        "font-display uppercase tracking-tight transition-colors duration-300",
        sizeStyles[size],
        toneStyles[tone],
        hoverAccent && "group-hover:text-(--text-accent)",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * 3. BodyText — Reusable high-legibility Onest paragraph/span copy
 */
export interface BodyTextProps {
  as?: "p" | "span" | "div";
  size?: "lg" | "md" | "sm" | "xs";
  tone?: "primary" | "secondary" | "muted";
  className?: string;
  children: React.ReactNode;
}

export function BodyText({
  as: Tag = "p",
  size = "sm",
  tone = "secondary",
  className,
  children,
}: BodyTextProps) {
  const sizeStyles = {
    lg: "text-[calc(clamp(0.9375rem,0.86rem+0.3vw,1.125rem)*var(--public-scale,1))] leading-relaxed",
    md: "text-[calc(clamp(0.84375rem,0.79rem+0.22vw,1rem)*var(--public-scale,1))] leading-relaxed",
    sm: "text-[calc(clamp(0.78125rem,0.74rem+0.16vw,0.875rem)*var(--public-scale,1))] leading-relaxed",
    xs: "text-[calc(clamp(0.71875rem,0.69rem+0.12vw,0.75rem)*var(--public-scale,1))] leading-relaxed",
  };

  const toneStyles = {
    primary: "text-(--text-primary) font-medium",
    secondary: "text-(--text-secondary)",
    muted: "text-(--text-muted)",
  };

  return (
    <Tag className={cn(sizeStyles[size], toneStyles[tone], className)}>
      {children}
    </Tag>
  );
}

/**
 * 4. MonoLabel — Reusable technical uppercase monospace label
 */
export interface MonoLabelProps {
  as?: "span" | "p" | "div";
  tone?: "primary" | "secondary" | "muted" | "accent" | "success";
  className?: string;
  children: React.ReactNode;
}

export function MonoLabel({
  as: Tag = "span",
  tone = "muted",
  className,
  children,
}: MonoLabelProps) {
  const toneStyles = {
    primary: "text-(--text-primary) font-semibold",
    secondary: "text-(--text-secondary)",
    muted: "text-(--text-muted)",
    accent: "text-(--text-accent) font-bold",
    success: "text-(--text-success) font-bold",
  };

  return (
    <Tag
      className={cn(
        "font-mono uppercase tracking-[0.18em] text-[calc(0.625rem*var(--public-scale,1))] sm:text-[calc(0.6875rem*var(--public-scale,1))]",
        toneStyles[tone],
        className
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * 5. TechBadge — Reusable Skill & Stack Badge with guaranteed Light/Dark contrast
 */
export interface TechBadgeProps {
  label: string;
  highlight?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function TechBadge({
  label,
  highlight = false,
  size = "md",
  className,
}: TechBadgeProps) {
  const sizeStyles = {
    sm: "h-[1.875rem] px-2.5 text-[calc(0.6875rem*var(--public-scale,1))]",
    md: "h-[2.125rem] px-3 text-[calc(0.75rem*var(--public-scale,1))]",
  };

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-(--radius-control) border font-mono whitespace-nowrap min-w-0 transition-colors duration-300",
        sizeStyles[size],
        highlight
          ? "bg-(--bg-badge-highlight) border-brand/45 text-(--text-primary) font-semibold shadow-xs"
          : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-strong)",
        className
      )}
    >
      {highlight && (
        <CheckCircle2 className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

