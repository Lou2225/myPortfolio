"use client";

import React, { useEffect, useRef } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";
import { cn } from "@/lib/utils";

export type ScrollRevealVariant = "fade-up" | "slide-left" | "slide-right" | "scale-in";

export interface ScrollRevealProps {
  children: React.ReactNode;
  variant?: ScrollRevealVariant;
  delayMs?: number;
  className?: string;
  as?: "div" | "li" | "article";
}

const ARMED_TRANSFORM: Record<ScrollRevealVariant, string> = {
  "fade-up": "translate3d(0, 22px, 0)",
  "slide-left": "translate3d(-20px, 0, 0)",
  "slide-right": "translate3d(20px, 0, 0)",
  "scale-in": "scale3d(0.96, 0.96, 1)",
};

/**
 * Modular GPU-only scroll entrance primitive using `transform` (`translate3d`/`scale3d`)
 * and `opacity`. Reads geometry asynchronously via `IntersectionObserver` (zero synchronous
 * forced reflow or extra React hydration re-renders).
 */
export function ScrollReveal({
  children,
  variant = "fade-up",
  delayMs = 0,
  className,
  as = "div",
}: ScrollRevealProps) {
  const { appearance } = usePortfolio();
  const reducedMotion = resolveEffectiveReducedMotion(appearance);
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = elRef.current;
    if (!node) return;

    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      node.style.opacity = "";
      node.style.transform = "";
      node.style.transition = "";
      node.style.transitionDelay = "";
      return;
    }

    let initialized = false;
    let revealed = false;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      node.style.transition =
        "transform 720ms cubic-bezier(0.22, 1, 0.36, 1), opacity 620ms ease-out";
      node.style.transitionDelay = delayMs > 0 ? `${delayMs}ms` : "0ms";
      node.style.opacity = "1";
      node.style.transform = "translate3d(0, 0, 0)";
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (!initialized) {
          initialized = true;
          const vpH = entry.rootBounds?.height || window.innerHeight;
          // Above-the-fold elements stay visible immediately without flashing
          if (entry.isIntersecting || entry.boundingClientRect.top <= vpH * 0.96) {
            revealed = true;
            observer.disconnect();
            return;
          }

          node.style.transition = "none";
          node.style.transitionDelay = "0ms";
          node.style.opacity = "0";
          node.style.transform = ARMED_TRANSFORM[variant];
          requestAnimationFrame(() => {
            if (!revealed) {
              node.style.transition =
                "transform 720ms cubic-bezier(0.22, 1, 0.36, 1), opacity 620ms ease-out";
            }
          });
          return;
        }

        if (entry.isIntersecting) {
          reveal();
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [reducedMotion, variant, delayMs]);

  const setRef = (node: HTMLElement | null) => {
    elRef.current = node as HTMLDivElement | null;
  };

  if (as === "li") {
    return (
      <li ref={setRef} className={cn(className)}>
        {children}
      </li>
    );
  }

  if (as === "article") {
    return (
      <article ref={setRef} className={cn(className)}>
        {children}
      </article>
    );
  }

  return (
    <div ref={setRef} className={cn(className)}>
      {children}
    </div>
  );
}
