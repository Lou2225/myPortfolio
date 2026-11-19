"use client";

import { usePortfolio } from "@/context/PortfolioContext";
import { MarqueeSpeedMode } from "@/types/portfolio";

const MARQUEE_DURATION_BY_SPEED: Record<MarqueeSpeedMode, string> = {
  slow: "36s",
  normal: "24s",
  fast: "14s",
};

export interface MarqueeProps {
  marqueePrinciples: string[];
  marqueeSpeed?: MarqueeSpeedMode;
}

export function Marquee({
  marqueePrinciples,
  marqueeSpeed = "normal",
}: MarqueeProps) {
  const { appearance } = usePortfolio();
  const activeSpeed = appearance?.marqueeSpeed ?? marqueeSpeed;
  const duration = MARQUEE_DURATION_BY_SPEED[activeSpeed] ?? "24s";

  return (
    <section
      aria-label="Operating Principles"
      className="relative z-10 w-full overflow-hidden border-y border-(--border-subtle) py-3.5 sm:py-5 bg-(--bg-surface)/92 backdrop-blur-xs select-none"
    >
      <div
        style={{ animationDuration: duration }}
        className="lou-marquee-track flex w-max"
      >
        {marqueePrinciples.map((principle, index) => (
          <div
            key={`p1-${index}`}
            className="flex items-center shrink-0"
          >
            <span className="font-display text-xl sm:text-3xl md:text-4xl uppercase tracking-tight text-(--text-primary) px-4 sm:px-6">
              {principle}
            </span>
            <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_10px_var(--accent)]" />
          </div>
        ))}
        {marqueePrinciples.map((principle, index) => (
          <div
            key={`p2-${index}`}
            aria-hidden="true"
            className="lou-marquee-duplicate flex items-center shrink-0"
          >
            <span className="font-display text-xl sm:text-3xl md:text-4xl uppercase tracking-tight text-(--text-primary) px-4 sm:px-6">
              {principle}
            </span>
            <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_10px_var(--accent)]" />
          </div>
        ))}
      </div>
    </section>
  );
}
