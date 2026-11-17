"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipCoords {
  top: number;
  left: number;
  transform: string;
}

function measureIsElementTruncated(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
    return true;
  }
  const nestedTruncated = el.querySelector<HTMLElement>(
    ".truncate, .line-clamp-1, .line-clamp-2, .line-clamp-3"
  );
  if (nestedTruncated) {
    return (
      nestedTruncated.scrollWidth > nestedTruncated.clientWidth + 1 ||
      nestedTruncated.scrollHeight > nestedTruncated.clientHeight + 1
    );
  }
  return false;
}

function computeTooltipCoords(
  el: HTMLElement,
  preferredSide?: TooltipSide
): TooltipCoords {
  const rect = el.getBoundingClientRect();

  if (preferredSide === "right") {
    return {
      top: rect.top + rect.height / 2,
      left: Math.min(window.innerWidth - 24, rect.right + 10),
      transform: "translate(0, -50%)",
    };
  }

  if (preferredSide === "left") {
    return {
      top: rect.top + rect.height / 2,
      left: Math.max(24, rect.left - 10),
      transform: "translate(-100%, -50%)",
    };
  }

  const centerX = rect.left + rect.width / 2;
  const clampedX = Math.max(24, Math.min(window.innerWidth - 24, centerX));
  const useBottom =
    preferredSide === "bottom" ||
    (preferredSide !== "top" && rect.top < 84);

  return {
    top: useBottom ? rect.bottom + 8 : rect.top - 8,
    left: clampedX,
    transform: useBottom
      ? "translate(-50%, 0)"
      : "translate(-50%, -100%)",
  };
}

export interface TooltipProps {
  /** Primary tooltip text */
  content?: string;
  /** Alias for `content` (e.g. sidebar rail labels) */
  label?: string;
  /** Optional count/status badge displayed beside label */
  badge?: number | string;
  side?: TooltipSide;
  disabled?: boolean;
  className?: string;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  onlyWhenTruncated?: boolean;
  delayMs?: number;
  maxWidthClassName?: string;
}

/**
 * Portal-rendered accessible tooltip supporting explicit rail labels (`label`, `side`, `badge`)
 * as well as conditional cropped-text tooltips (`onlyWhenTruncated`).
 */
export function Tooltip({
  content,
  label,
  badge,
  side,
  disabled = false,
  className,
  children,
  onlyWhenTruncated = false,
  delayMs = 120,
  maxWidthClassName = "max-w-xs sm:max-w-sm",
}: TooltipProps) {
  const tooltipId = useId();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerElRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);

  const resolvedText = (content ?? label ?? "").trim();

  const hideTooltip = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  const showTooltip = useCallback(
    (target: HTMLElement) => {
      if (disabled || !resolvedText) return;
      triggerElRef.current = target;

      if (onlyWhenTruncated && !measureIsElementTruncated(target)) {
        return;
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const el = triggerElRef.current;
        if (!el || !document.contains(el)) return;
        if (onlyWhenTruncated && !measureIsElementTruncated(el)) return;
        setCoords(computeTooltipCoords(el, side));
        setVisible(true);
      }, delayMs);
    },
    [disabled, resolvedText, delayMs, onlyWhenTruncated, side]
  );

  useEffect(() => {
    if (!visible) return;
    const handleDismiss = () => hideTooltip();
    window.addEventListener("scroll", handleDismiss, { capture: true, passive: true });
    window.addEventListener("resize", handleDismiss, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleDismiss, { capture: true });
      window.removeEventListener("resize", handleDismiss);
    };
  }, [visible, hideTooltip]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const isDisabledVisible = visible && !disabled && Boolean(resolvedText);

  const triggerNode = className ? (
    <div
      className={cn("inline-flex", className)}
      aria-describedby={isDisabledVisible ? tooltipId : undefined}
      onMouseEnter={(e) => showTooltip(e.currentTarget)}
      onMouseLeave={hideTooltip}
      onFocus={(e) => showTooltip(e.currentTarget)}
      onBlur={hideTooltip}
    >
      {children}
    </div>
  ) : (
    React.cloneElement(children, {
      "aria-describedby": isDisabledVisible
        ? tooltipId
        : children.props["aria-describedby"],
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        children.props.onMouseEnter?.(e);
        showTooltip(e.currentTarget);
      },
      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
        children.props.onMouseLeave?.(e);
        hideTooltip();
      },
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        children.props.onFocus?.(e);
        showTooltip(e.currentTarget);
      },
      onBlur: (e: React.FocusEvent<HTMLElement>) => {
        children.props.onBlur?.(e);
        hideTooltip();
      },
    })
  );

  return (
    <>
      {triggerNode}
      {isDisabledVisible &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{
              top: coords.top,
              left: coords.left,
              transform: coords.transform,
            }}
            className={cn(
              "fixed z-150 pointer-events-none px-3 py-2 rounded-lg bg-(--bg-surface-2) text-(--text-primary) border border-(--border-strong) shadow-[0_12px_32px_rgba(0,0,0,0.45)] text-xs leading-relaxed whitespace-normal wrap-break-word inline-flex items-center gap-2 transition-opacity duration-150",
              maxWidthClassName
            )}
          >
            <span>{resolvedText}</span>
            {badge !== undefined && badge !== 0 && badge !== "" && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-solid text-brand-contrast text-[10px] font-mono font-bold leading-none shrink-0">
                {badge}
              </span>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

export interface TruncatedTextProps {
  text: string;
  as?: "span" | "p" | "div" | "h3";
  clampClassName?: string;
  className?: string;
  alwaysShowTooltip?: boolean;
}

/**
 * Displays single-line or clamped text that automatically reveals the full
 * untruncated text inside a floating Tooltip whenever overflow clipping occurs.
 */
export function TruncatedText({
  text,
  as = "span",
  clampClassName = "truncate",
  className,
  alwaysShowTooltip = false,
}: TruncatedTextProps) {
  const Tag = as;
  return (
    <Tooltip content={text} onlyWhenTruncated={!alwaysShowTooltip}>
      <Tag className={cn(clampClassName, className)}>{text}</Tag>
    </Tooltip>
  );
}

export interface InfoTooltipProps {
  content: string;
  label?: string;
  side?: TooltipSide;
  className?: string;
  maxWidthClassName?: string;
}

/**
 * Compact operational help trigger badge backed by our portal Tooltip.
 * Supports keyboard focus, mouse hover, and click/tap without submitting forms.
 */
export function InfoTooltip({
  content,
  label = "Operational guidance",
  side = "top",
  className,
  maxWidthClassName = "max-w-xs",
}: InfoTooltipProps) {
  return (
    <Tooltip
      content={content}
      side={side}
      maxWidthClassName={maxWidthClassName}
    >
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={cn(
          "inline-flex items-center justify-center w-5 h-5 rounded-full text-(--text-muted) hover:text-(--text-accent) hover:bg-(--bg-surface-2) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand transition-colors shrink-0 cursor-help",
          className
        )}
      >
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
