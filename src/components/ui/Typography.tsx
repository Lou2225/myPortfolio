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
    hero: "text-4xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.94]",
    xl: "text-3xl sm:text-5xl md:text-6xl lg:text-7xl leading-[0.96]",
    lg: "text-3xl sm:text-4xl md:text-5xl leading-[1.02]",
    md: "text-2xl sm:text-3xl leading-[1.05]",
    sm: "text-xl sm:text-2xl leading-[1.08]",
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
    lg: "text-base sm:text-lg leading-relaxed",
    md: "text-sm sm:text-base leading-relaxed",
    sm: "text-xs sm:text-sm leading-relaxed",
    xs: "text-xs leading-relaxed",
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
    sm: "px-2.5 py-1 text-[11px]",
    md: "px-3 py-1.5 text-xs",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-(--radius-control) border font-mono transition-colors duration-300",
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
      <span>{label}</span>
    </span>
  );
}

