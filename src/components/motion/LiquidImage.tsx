"use client";

import { useState } from "react";
import Image from "next/image";
import { usePortfolio } from "@/context/PortfolioContext";
import { useLiquidRipple } from "@/lib/useLiquidRipple";
import { LiquidSvgFilter } from "@/components/motion/LiquidSvgFilter";
import { cn } from "@/lib/utils";

interface LiquidImageProps {
  src: string;
  alt: string;
  aspectRatio?: string;
  className?: string;
  placeholderText?: string;
}

export function LiquidImage({
  src,
  alt,
  aspectRatio = "aspect-16/10",
  className,
  placeholderText,
}: LiquidImageProps) {
  const { appearance, profile } = usePortfolio();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const {
    filterId,
    turbRef,
    dispRef,
    filterActive,
    baseFrequencyDefault,
    pointerHandlers,
  } = useLiquidRipple({
    baseFreqX: 0.012,
    baseFreqY: 0.016,
    maxScale: 28,
    enterImpulse: 20,
  });

  const imageError = !src || failedSrc === src;
  const alwaysColor = appearance.imageColorMode === "always-color";

  return (
    <figure
      {...pointerHandlers}
      className={cn(
        "liquid-image-frame relative overflow-hidden rounded-(--radius-card) bg-(--bg-surface-2) border border-(--border-subtle) group",
        aspectRatio,
        className
      )}
    >
      <LiquidSvgFilter
        active={filterActive}
        filterId={filterId}
        baseFrequency={baseFrequencyDefault}
        turbRef={turbRef}
        dispRef={dispRef}
      />

      {/* Image or Dynamic Fallback Graphic */}
      {!imageError ? (
        <div
          className="relative w-full h-full transition-transform duration-700 ease-out group-hover:scale-105"
          style={filterActive ? { filter: `url(#${filterId})` } : undefined}
        >
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className={cn(
              "object-cover transition-[opacity,filter] duration-500 opacity-95 group-hover:opacity-100",
              !alwaysColor &&
                "[@media(hover:hover)_and_(pointer:fine)]:grayscale [@media(hover:hover)_and_(pointer:fine)]:group-hover:grayscale-0"
            )}
            onError={() => setFailedSrc(src)}
          />
        </div>
      ) : (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-linear-to-br from-(--bg-surface-2) to-(--bg-canvas) text-center">
          <div className="w-12 h-12 rounded-full border border-brand/40 flex items-center justify-center mb-3 text-(--text-accent)">
            <span className="font-display text-lg">
              {profile.monogram || "P"}
            </span>
          </div>
          <p className="font-display text-xl uppercase tracking-wider text-(--text-primary)">
            {placeholderText || alt}
          </p>
          <p className="text-xs uppercase tracking-[0.2em] text-(--text-muted) mt-1">
            System Mockup Preview
          </p>
        </div>
      )}

      {/* Subtle Accent Glow Border Overlay on Hover */}
      <div className="absolute inset-0 pointer-events-none border border-transparent transition-colors duration-500 group-hover:border-brand/40" />
    </figure>
  );
}
