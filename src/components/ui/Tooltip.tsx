"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type TooltipSide = "top" | "bottom" | "left" | "right";

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

function resolveTooltipPosition(
  triggerRect: DOMRect,
  tipRect: DOMRect,
  preferredSide?: TooltipSide
): { x: number; y: number } {
  const pad = 12;
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const clampX = (rawX: number) =>
    Math.max(pad, Math.min(vw - tipRect.width - pad, rawX));
  const clampY = (rawY: number) =>
    Math.max(pad, Math.min(vh - tipRect.height - pad, rawY));

  if (preferredSide === "right") {
    const fitsRight = triggerRect.right + 10 + tipRect.width <= vw - pad;
    const rawX = fitsRight
      ? triggerRect.right + 10
      : triggerRect.left - tipRect.width - 10;
    return {
      x: clampX(rawX),
      y: clampY(triggerRect.top + (triggerRect.height - tipRect.height) / 2),
    };
  }

  if (preferredSide === "left") {
    const fitsLeft = triggerRect.left - 10 - tipRect.width >= pad;
    const rawX = fitsLeft
      ? triggerRect.left - tipRect.width - 10
      : triggerRect.right + 10;
    return {
      x: clampX(rawX),
      y: clampY(triggerRect.top + (triggerRect.height - tipRect.height) / 2),
    };
  }

  const centeredX = triggerRect.left + (triggerRect.width - tipRect.width) / 2;
  const x = clampX(centeredX);

  const topY = triggerRect.top - tipRect.height - gap;
  const bottomY = triggerRect.bottom + gap;
  const fitsTop = topY >= pad;
  const fitsBottom = bottomY + tipRect.height <= vh - pad;

  let y: number;
  if (preferredSide === "bottom") {
    y = fitsBottom || !fitsTop ? bottomY : topY;
  } else {
    y = fitsTop || !fitsBottom ? topY : bottomY;
  }

  return { x, y: clampY(y) };
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
  /** Toggle visibility directly on tap/click (useful for mobile InfoTooltip triggers). */
  toggleOnClick?: boolean;
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
  toggleOnClick = false,
  delayMs = 120,
  maxWidthClassName = "max-w-xs sm:max-w-sm",
}: TooltipProps) {
  const tooltipId = useId();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerElRef = useRef<HTMLElement | null>(null);
  const tooltipElRef = useRef<HTMLDivElement | null>(null);
  const openedByClickRef = useRef(false);
  const [visible, setVisible] = useState(false);

  const resolvedText = (content ?? label ?? "").trim();

  const hideTooltip = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    openedByClickRef.current = false;
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
        setVisible(true);
      }, delayMs);
    },
    [disabled, resolvedText, delayMs, onlyWhenTruncated]
  );

  const toggleTooltipOnClick = useCallback(
    (target: HTMLElement) => {
      if (disabled || !resolvedText) return;
      triggerElRef.current = target;

      if (onlyWhenTruncated && !measureIsElementTruncated(target)) {
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (visible && openedByClickRef.current) {
        openedByClickRef.current = false;
        setVisible(false);
        return;
      }

      openedByClickRef.current = true;
      setVisible(true);
    },
    [disabled, resolvedText, onlyWhenTruncated, visible]
  );

  useLayoutEffect(() => {
    if (!visible) return;
    const triggerEl = triggerElRef.current;
    const tipEl = tooltipElRef.current;
    if (!triggerEl || !tipEl) return;

    const maxAllowedWidth = Math.max(160, window.innerWidth - 24);
    tipEl.style.maxWidth = "";
    let tipRect = tipEl.getBoundingClientRect();
    if (tipRect.width > maxAllowedWidth) {
      tipEl.style.maxWidth = `${maxAllowedWidth}px`;
      tipRect = tipEl.getBoundingClientRect();
    }

    const { x, y } = resolveTooltipPosition(
      triggerEl.getBoundingClientRect(),
      tipRect,
      side
    );
    tipEl.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    tipEl.style.opacity = "1";
  }, [visible, side, resolvedText, badge]);

  useEffect(() => {
    if (!visible) return;
    const handleDismiss = () => hideTooltip();
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerElRef.current?.contains(target)) return;
      if (tooltipElRef.current?.contains(target)) return;
      hideTooltip();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideTooltip();
    };
    window.addEventListener("scroll", handleDismiss, { capture: true, passive: true });
    window.addEventListener("resize", handleDismiss, { passive: true });
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", handleDismiss, { capture: true });
      window.removeEventListener("resize", handleDismiss);
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("keydown", handleKeyDown);
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
      onMouseLeave={() => {
        if (!openedByClickRef.current) hideTooltip();
      }}
      onFocus={(e) => showTooltip(e.currentTarget)}
      onBlur={hideTooltip}
      onClick={
        toggleOnClick
          ? (e) => {
              toggleTooltipOnClick(e.currentTarget);
            }
          : undefined
      }
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
        if (!openedByClickRef.current) hideTooltip();
      },
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        children.props.onFocus?.(e);
        showTooltip(e.currentTarget);
      },
      onBlur: (e: React.FocusEvent<HTMLElement>) => {
        children.props.onBlur?.(e);
        hideTooltip();
      },
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        const target = e.currentTarget;
        children.props.onClick?.(e);
        if (toggleOnClick) {
          toggleTooltipOnClick(target);
        }
      },
    })
  );

  return (
    <>
      {triggerNode}
      {isDisabledVisible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipElRef}
            id={tooltipId}
            role="tooltip"
            style={{
              top: 0,
              left: 0,
              opacity: 0,
            }}
            className={cn(
              "fixed z-150 pointer-events-none px-3 py-2 rounded-lg bg-(--bg-surface-2) text-(--text-primary) border border-(--border-strong) shadow-[0_12px_32px_rgba(0,0,0,0.45)] text-xs leading-relaxed whitespace-normal wrap-break-word w-max inline-flex items-center gap-2 transition-opacity duration-150",
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
      toggleOnClick
    >
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={cn(
          "inline-flex items-center justify-center w-6 h-6 -m-0.5 rounded-full text-(--text-muted) hover:text-(--text-accent) hover:bg-(--bg-surface-2) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand transition-colors shrink-0 cursor-help touch-manipulation",
          className
        )}
      >
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
