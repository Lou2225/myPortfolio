"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "vertical" | "horizontal" | "both";
  maxHeight?: string | number;
  fadeEdges?: boolean;
  scrollbarVariant?: "default" | "accent" | "hidden";
  viewportClassName?: string;
  children: React.ReactNode;
}

export function ScrollArea({
  orientation = "vertical",
  maxHeight,
  fadeEdges = true,
  scrollbarVariant = "default",
  className,
  viewportClassName,
  style,
  children,
  ...props
}: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  const checkScrollEdges = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !fadeEdges) return;

    if (orientation === "horizontal") {
      const start = el.scrollLeft > 4;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setCanScrollStart(start);
      setCanScrollEnd(end);
    } else {
      const start = el.scrollTop > 4;
      const end = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
      setCanScrollStart(start);
      setCanScrollEnd(end);
    }
  }, [fadeEdges, orientation]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !fadeEdges) return;

    const rafId = requestAnimationFrame(checkScrollEdges);
    el.addEventListener("scroll", checkScrollEdges, { passive: true });
    window.addEventListener("resize", checkScrollEdges, { passive: true });

    const observer = new ResizeObserver(checkScrollEdges);
    observer.observe(el);
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild);
    }

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", checkScrollEdges);
      window.removeEventListener("resize", checkScrollEdges);
      observer.disconnect();
    };
  }, [fadeEdges, checkScrollEdges]);

  const overflowClasses = {
    vertical: "overflow-y-auto overflow-x-hidden",
    horizontal: "overflow-x-auto overflow-y-hidden",
    both: "overflow-auto",
  };

  const scrollbarClasses = {
    default: "lou-scrollarea",
    accent: "lou-scrollarea lou-scrollarea-accent",
    hidden: "no-scrollbar",
  };

  return (
    <div className={cn("relative min-h-0", className)} {...props}>
      {/* Top / Left Edge Fade Indicator */}
      {fadeEdges && canScrollStart && orientation === "vertical" && (
        <div
          aria-hidden="true"
          className="scrollarea-fade-top pointer-events-none absolute inset-x-0 top-0 h-5 z-10 transition-opacity duration-200"
        />
      )}

      {/* Scrollable Viewport (data-lenis-prevent isolates inner wheel/touch scroll) */}
      <div
        ref={viewportRef}
        data-lenis-prevent
        style={{
          maxHeight:
            maxHeight !== undefined
              ? typeof maxHeight === "number"
                ? `${maxHeight}px`
                : maxHeight
              : undefined,
          ...style,
        }}
        className={cn(
          "w-full h-full",
          overflowClasses[orientation],
          scrollbarClasses[scrollbarVariant],
          orientation === "vertical" && scrollbarVariant !== "hidden" && "pr-1.5",
          viewportClassName
        )}
      >
        {children}
      </div>

      {/* Bottom / Right Edge Fade Indicator */}
      {fadeEdges && canScrollEnd && orientation === "vertical" && (
        <div
          aria-hidden="true"
          className="scrollarea-fade-bottom pointer-events-none absolute inset-x-0 bottom-0 h-5 z-10 transition-opacity duration-200"
        />
      )}
    </div>
  );
}

