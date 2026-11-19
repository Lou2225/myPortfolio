"use client";

import { useState } from "react";
import Image from "next/image";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";
import { cn } from "@/lib/utils";

interface LiquidImageProps {
  src: string;
  alt: string;
  aspectRatio?: string;
  className?: string;
  placeholderText?: string;
}

/**
 * Hardware-accelerated project showcase frame with GPU-only hover zoom & specular
 * sheen sweep (replaces CPU-heavy SVG turbulence filters for 120 FPS performance).
 */
export function LiquidImage({
  src,
  alt,
  aspectRatio = "aspect-16/10",
  className,
  placeholderText,
}: LiquidImageProps) {
  const { appearance, profile } = usePortfolio();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const imageError = !src || failedSrc === src;
  const alwaysColor = appearance.imageColorMode === "always-color";
  const reducedMotion = resolveEffectiveReducedMotion(appearance);
  const enableHoverFx = Boolean(appearance.liquidDistortion) && !reducedMotion;

  return (
    <figure
      className={cn(
        "liquid-image-frame relative overflow-hidden rounded-(--radius-card) bg-(--bg-surface-2) border border-(--border-subtle) group",
        aspectRatio,
        className
      )}
    >
      {/* Image or Dynamic Fallback Graphic */}
      {!imageError ? (
        <div
          className={cn(
            "relative w-full h-full will-change-transform",
            enableHoverFx &&
              "transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-[1.045]"
          )}
        >
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 60vw, 45vw"
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

      {/* Subtle Bottom Scrim for editorial depth */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/35 to-transparent pointer-events-none opacity-80 group-hover:opacity-50 transition-opacity duration-500"
      />

      {/* GPU-Only Specular Sheen Sweep on Desktop Hover */}
      {enableHoverFx && (
        <div
          aria-hidden="true"
          className="hidden [@media(hover:hover)_and_(pointer:fine)]:block absolute inset-0 pointer-events-none overflow-hidden"
        >
          <div className="absolute -inset-y-8 -left-1/2 w-1/2 rotate-12 bg-linear-to-r from-transparent via-white/14 to-transparent opacity-0 -translate-x-full group-hover:opacity-100 group-hover:translate-x-[360%] transition-[transform,opacity] duration-1000 ease-out will-change-transform" />
        </div>
      )}

      {/* Subtle Accent Glow Border Overlay on Hover */}
      <div className="absolute inset-0 pointer-events-none border border-transparent transition-colors duration-500 group-hover:border-brand/40" />
    </figure>
  );
}
