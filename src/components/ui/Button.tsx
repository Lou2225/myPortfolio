"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Magnetic } from "@/components/motion/Magnetic";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { useBrandPortal } from "@/components/motion/BrandPortal";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  href?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  shape?: "pill" | "rounded";
  fullWidth?: boolean;
  slideDirection?: "left" | "right";
  magnetic?: boolean;
  external?: boolean;
}

export function Button({
  children,
  href,
  variant = "primary",
  size = "md",
  shape = "pill",
  fullWidth = false,
  slideDirection,
  magnetic = true,
  external = false,
  className,
  onClick,
  ...props
}: ButtonProps) {
  const { scrollTo } = useSmoothScroll();
  const { triggerSlideNavigate } = useBrandPortal();

  const hasResponsiveAutoWidth = Boolean(
    className && /\b(sm|md|lg|xl):w-auto\b/.test(className)
  );
  const isFullWidth =
    fullWidth ||
    (Boolean(className && /\bw-full\b/.test(className)) &&
      !hasResponsiveAutoWidth);

  const wrapperLayoutTokens = (className || "")
    .split(/\s+/)
    .filter((token) =>
      /^(?:(?:sm|md|lg|xl|2xl):)?(?:w-full|w-auto|flex-1|flex-\[[^\]]+\]|flex-none|flex-initial|min-w-0)$/.test(
        token
      )
    );
  const hasWrapperLayout =
    !isFullWidth && wrapperLayoutTokens.length > 0;

  const baseStyles =
    "group relative overflow-hidden items-center justify-center whitespace-nowrap font-medium leading-none uppercase tracking-[0.14em] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand select-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed";

  const widthStyles = isFullWidth ? "flex w-full" : "inline-flex shrink-0";

  const shapeStyles = {
    pill: "rounded-full",
    rounded: "rounded-(--radius-control)",
  };

  const sizeStyles = {
    icon: "h-[2.125rem] w-[2.125rem] p-0 text-[0.75rem]",
    sm: "h-[2.125rem] px-3.5 sm:px-4 text-[0.6875rem] gap-1.5",
    md: "h-[2.75rem] px-5 sm:px-6 text-[0.75rem] gap-2",
    lg: "h-[3rem] sm:h-[3.25rem] px-6 sm:px-8 text-[0.75rem] sm:text-[0.875rem] font-semibold gap-2.5",
  };

  const variantStyles = {
    primary:
      "btn-primary bg-brand-solid text-brand-contrast font-semibold hover:bg-brand-solid-hover hover:shadow-[0_6px_24px_var(--accent-glow)] active:scale-[0.98]",
    secondary:
      "btn-secondary bg-(--bg-surface-2) text-(--text-primary) border border-(--border-subtle) hover:border-brand hover:text-(--text-accent) active:scale-[0.98]",
    outline:
      "btn-outline border border-(--border-strong) text-(--text-primary) hover:border-brand hover:text-(--text-accent) active:scale-[0.98]",
    ghost:
      "btn-ghost text-(--text-secondary) hover:text-(--text-accent) hover:bg-(--bg-surface-2) active:scale-[0.98]",
    danger:
      "bg-rose-500/10 border border-rose-500/25 text-rose-500 hover:bg-rose-500/20 active:scale-[0.98]",
  };

  const classes = cn(
    baseStyles,
    widthStyles,
    shapeStyles[shape],
    sizeStyles[size],
    variantStyles[variant],
    className
  );
  const magneticButtonClasses = hasWrapperLayout ? cn(classes, "w-full") : classes;

  const innerContent = slideDirection ? (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 bg-brand/12 transition-transform duration-300 ease-out scale-x-0 group-hover:scale-x-100",
          slideDirection === "left" ? "origin-right" : "origin-left"
        )}
      />
      <span
        className={cn(
          "relative z-10 inline-flex items-center justify-center gap-[inherit] transition-transform duration-300 ease-out",
          slideDirection === "left"
            ? "group-hover:-translate-x-1"
            : "group-hover:translate-x-1"
        )}
      >
        {children}
      </span>
    </>
  ) : (
    children
  );

  const handleHashClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (href && href.startsWith("#")) {
      e.preventDefault();
      scrollTo(href, { offset: href === "#top" ? 0 : -68, duration: 1.4 });
      if (window.history.pushState) {
        window.history.pushState(null, "", href);
      }
    }
    if (onClick) {
      onClick(e as unknown as React.MouseEvent<HTMLButtonElement>);
    }
  };

  const handleRouteLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      onClick(e as unknown as React.MouseEvent<HTMLButtonElement>);
    }
    if (
      slideDirection &&
      href &&
      !external &&
      !href.startsWith("#") &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey
    ) {
      e.preventDefault();
      triggerSlideNavigate(href, slideDirection);
    }
  };

  const renderElement = (btnClasses: string) =>
    href ? (
      external ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={props["aria-label"]}
          title={props.title}
          onClick={(e) => {
            if (onClick) {
              onClick(e as unknown as React.MouseEvent<HTMLButtonElement>);
            }
          }}
          className={btnClasses}
        >
          {innerContent}
        </a>
      ) : href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ? (
        <a
          href={href}
          aria-label={props["aria-label"]}
          title={props.title}
          onClick={
            href.startsWith("#")
              ? handleHashClick
              : (e) => {
                  if (onClick) {
                    onClick(
                      e as unknown as React.MouseEvent<HTMLButtonElement>
                    );
                  }
                }
          }
          className={btnClasses}
        >
          {innerContent}
        </a>
      ) : (
        <Link
          href={href}
          aria-label={props["aria-label"]}
          title={props.title}
          onClick={handleRouteLinkClick}
          className={btnClasses}
        >
          {innerContent}
        </Link>
      )
    ) : (
      <button className={btnClasses} onClick={onClick} {...props}>
        {innerContent}
      </button>
    );

  if (magnetic && !props.disabled) {
    return (
      <Magnetic
        strength={isFullWidth ? 0.08 : 0.2}
        fullWidth={isFullWidth}
        className={
          hasWrapperLayout ? cn("inline-flex", ...wrapperLayoutTokens) : undefined
        }
      >
        {renderElement(magneticButtonClasses)}
      </Magnetic>
    );
  }

  return renderElement(classes);
}
