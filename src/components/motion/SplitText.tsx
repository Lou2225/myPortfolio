"use client";

import { useRef, useEffect, useState } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";
import { cn } from "@/lib/utils";

interface SplitTextProps {
  text: string;
  type?: "chars" | "words" | "lines";
  className?: string;
  delay?: number;
  stagger?: number;
  triggerOnScroll?: boolean;
}

export function SplitText({
  text,
  type = "chars",
  className,
  delay = 0,
  stagger = 0.03,
  triggerOnScroll = true,
}: SplitTextProps) {
  const { appearance } = usePortfolio();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [revealed, setRevealed] = useState(!triggerOnScroll);
  const reducedMotion = resolveEffectiveReducedMotion(appearance);

  useEffect(() => {
    if (!triggerOnScroll) return;
    if (reducedMotion) {
      const raf = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(raf);
    }

    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      const raf = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.01 }
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [triggerOnScroll, reducedMotion]);

  const isVisible = revealed || reducedMotion;

  const unitClass = !triggerOnScroll && !reducedMotion
    ? "split-unit lou-split-enter"
    : "split-unit";

  const getUnitStyle = (index: number): React.CSSProperties | undefined => {
    if (reducedMotion) return undefined;
    if (!triggerOnScroll) {
      return { animationDelay: `${(delay + index * stagger).toFixed(3)}s` };
    }
    return {
      transform: isVisible ? "translate3d(0, 0, 0)" : "translate3d(0, 105%, 0)",
      opacity: isVisible ? 1 : 0,
      transition:
        "transform 0.72s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.55s ease-out",
      transitionDelay: isVisible
        ? `${(delay + index * stagger).toFixed(3)}s`
        : "0s",
    };
  };

  if (type === "chars") {
    return (
      <span ref={containerRef} className={cn("inline-block", className)}>
        {text.split("").map((char, i) => (
          <span key={i} className="inline-block overflow-hidden align-top">
            <span
              className={cn(unitClass, "inline-block")}
              style={getUnitStyle(i)}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          </span>
        ))}
      </span>
    );
  }

  if (type === "lines") {
    const rawLines = text.split(/\r?\n/).filter((line) => line.length > 0);
    const lines = rawLines.length > 0 ? rawLines : [text];
    return (
      <span ref={containerRef} className={cn("inline-flex flex-col", className)}>
        {lines.map((line, i) => (
          <span key={i} className="block overflow-hidden">
            <span className={cn(unitClass, "block")} style={getUnitStyle(i)}>
              {line}
            </span>
          </span>
        ))}
      </span>
    );
  }

  const words = text.split(" ");
  return (
    <span ref={containerRef} className={cn("inline-block", className)}>
      {words.map((word, i) => (
        <span
          key={i}
          className={cn(
            "inline-block overflow-hidden align-top",
            i < words.length - 1 && "mr-[0.25em]"
          )}
        >
          <span
            className={cn(unitClass, "inline-block")}
            style={getUnitStyle(i)}
          >
            {word}
          </span>
        </span>
      ))}
    </span>
  );
}
