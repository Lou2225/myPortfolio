"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageTransform } from "@/types/portfolio";
import { usePortfolio } from "@/context/PortfolioContext";
import { isIdentityImageTransform } from "@/lib/imageTransform";
import { TransformedImage } from "@/components/ui/TransformedImage";
import { cn } from "@/lib/utils";

interface AvatarProps {
  className?: string;
  imageSrc?: string;
  transform?: ImageTransform;
}

export function Avatar({
  className,
  imageSrc = "/assets/hero/avatar.webp",
  transform,
}: AvatarProps) {
  const { appearance, profile } = usePortfolio();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const useTransformedView =
    Boolean(transform) && !isIdentityImageTransform(transform, "squircle");

  const hasCustomImage = Boolean(imageSrc) && failedSrc !== imageSrc;
  const alwaysColor = appearance.imageColorMode === "always-color";
  const showRimGlow = appearance.heroRimGlow;
  const displayAlt = profile.fullName || profile.name || "Portfolio portrait";
  const monogramLabel = profile.monogram || "P";
  const roleSubtitle = profile.roles.slice(0, 2).join(" · ") || profile.headline;

  return (
    <div
      className={cn(
        "relative h-[43svh] sm:h-[52svh] md:h-[60svh] lg:h-[70svh] xl:h-[74svh] max-h-190 min-h-60 aspect-3/4 max-w-[86vw] flex items-end justify-center select-none pointer-events-auto group",
        className
      )}
    >
      {/* Subtle cinematic rim glow behind avatar */}
      {showRimGlow && (
        <div className="absolute inset-x-6 bottom-8 top-1/5 rounded-full bg-[radial-gradient(ellipse_at_bottom,var(--bg-badge-highlight)_0%,transparent_72%)] pointer-events-none opacity-85 group-hover:opacity-100 transition-opacity duration-700" />
      )}

      {/* Real Photo Cutout or Dynamic Profile Fallback */}
      {hasCustomImage ? (
        <div className="relative w-full h-full flex items-end justify-center">
          {useTransformedView ? (
            <TransformedImage
              src={imageSrc}
              alt={displayAlt}
              transform={transform}
              defaultFit="contain"
              defaultPosition="bottom"
              sizes="(max-width: 640px) 70vw, (max-width: 1024px) 45vw, 32vw"
              loading="eager"
              fetchPriority="high"
              className="w-full h-full"
              imgClassName={cn(
                "[@media(hover:hover)_and_(pointer:fine)]:contrast-105 transition-[transform,filter] duration-700 ease-out",
                !alwaysColor &&
                  "[@media(hover:hover)_and_(pointer:fine)]:grayscale [@media(hover:hover)_and_(pointer:fine)]:group-hover:grayscale-0"
              )}
              onError={() => setFailedSrc(imageSrc)}
            />
          ) : (
            <Image
              src={imageSrc}
              alt={displayAlt}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(max-width: 640px) 70vw, (max-width: 1024px) 45vw, 32vw"
              className={cn(
                "object-contain object-bottom [@media(hover:hover)_and_(pointer:fine)]:contrast-105 group-hover:scale-[1.02] transition-[transform,filter] duration-700 ease-out",
                !alwaysColor &&
                  "[@media(hover:hover)_and_(pointer:fine)]:grayscale [@media(hover:hover)_and_(pointer:fine)]:group-hover:grayscale-0"
              )}
              onError={() => setFailedSrc(imageSrc)}
            />
          )}
        </div>
      ) : (
        <div className="relative w-full h-[88%] rounded-t-3xl border border-(--border-subtle) bg-linear-to-b from-(--bg-surface-2) via-(--bg-surface) to-(--bg-canvas) p-6 flex flex-col items-center justify-between shadow-2xl overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] bg-size-[16px_16px] pointer-events-none" />
          <div className="relative z-10 w-20 h-20 rounded-full border border-brand/50 bg-(--bg-canvas)/80 backdrop-blur-md flex items-center justify-center shadow-[0_0_30px_var(--accent-glow)] mt-6">
            <span className="font-display text-3xl text-(--text-accent)">
              {monogramLabel}
            </span>
          </div>
          <div className="relative z-10 text-center mb-10">
            <p className="font-display text-xl uppercase tracking-wider text-(--text-primary)">
              {displayAlt}
            </p>
            {roleSubtitle && (
              <p className="text-[10px] uppercase tracking-[0.22em] text-(--text-accent) font-semibold mt-1">
                {roleSubtitle}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Gradient Melt Base — Melts the portrait base seamlessly into canvas */}
      <div className="avatar-bottom-melt absolute inset-x-0 bottom-0 h-20 sm:h-28 lg:h-36 bg-linear-to-b from-transparent via-[#08080a]/80 to-[#08080a] pointer-events-none z-20" />
    </div>
  );
}
