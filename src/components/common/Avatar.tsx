"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ImageTransform } from "@/types/portfolio";
import { usePortfolio } from "@/context/PortfolioContext";
import { isIdentityImageTransform } from "@/lib/imageTransform";
import { dispatchJumpscareTrigger } from "@/lib/jumpscare";
import { TransformedImage } from "@/components/ui/TransformedImage";
import { cn } from "@/lib/utils";

interface AvatarProps {
  className?: string;
  imageSrc?: string;
  transform?: ImageTransform;
}

function clampAvatarAspect(rawAspect: number): number {
  if (!Number.isFinite(rawAspect) || rawAspect <= 0) return 0.85;
  return Number(Math.min(1.38, Math.max(0.62, rawAspect)).toFixed(3));
}

export function Avatar({
  className,
  imageSrc = "/assets/hero/avatar.webp",
  transform,
}: AvatarProps) {
  const { appearance, profile } = usePortfolio();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [naturalAspect, setNaturalAspect] = useState<number>(0.85);

  const tapStreakRef = useRef<{ count: number; lastMs: number }>({
    count: 0,
    lastMs: 0,
  });

  const handleAvatarTap = () => {
    if (
      !appearance.jumpscareEnabled ||
      (appearance.jumpscareTrigger || "secret-taps") !== "secret-taps"
    ) {
      return;
    }
    const now = Date.now();
    const withinWindow = now - tapStreakRef.current.lastMs < 2500;
    const nextCount = withinWindow ? tapStreakRef.current.count + 1 : 1;
    tapStreakRef.current = { count: nextCount, lastMs: now };
    if (nextCount >= 5) {
      tapStreakRef.current = { count: 0, lastMs: 0 };
      dispatchJumpscareTrigger("secret-taps", true);
    }
  };

  const handleNaturalAspect = useCallback((rawAspect: number) => {
    const next = clampAvatarAspect(rawAspect);
    setNaturalAspect((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
  }, []);

  const useTransformedView =
    Boolean(transform) && !isIdentityImageTransform(transform, "squircle");

  const hasCustomImage = Boolean(imageSrc) && failedSrc !== imageSrc;
  const showRimGlow = appearance.heroRimGlow;
  const displayAlt = profile.fullName || profile.name || "Portfolio portrait";
  const monogramLabel = profile.monogram || "P";
  const roleSubtitle = profile.roles.slice(0, 2).join(" · ") || profile.headline;

  return (
    <div
      onClick={handleAvatarTap}
      style={
        hasCustomImage
          ? { aspectRatio: String(naturalAspect) }
          : undefined
      }
      className={cn(
        "relative h-[clamp(14.5rem,43svh,25rem)] sm:h-[clamp(16.5rem,51svh,34rem)] lg:h-[clamp(23rem,64svh,37rem)] [@media(max-height:640px)]:h-[clamp(12.5rem,44svh,19.5rem)] max-w-[92vw] flex items-end justify-center select-none pointer-events-auto overflow-visible",
        !hasCustomImage && "aspect-3/4",
        className
      )}
    >
      {/* Subtle cinematic rim glow behind avatar */}
      {showRimGlow && (
        <div className="absolute inset-x-6 bottom-8 top-1/5 rounded-full bg-[radial-gradient(ellipse_at_bottom,var(--bg-badge-highlight)_0%,transparent_72%)] pointer-events-none opacity-85" />
      )}

      {/* Real Photo Cutout or Dynamic Profile Fallback */}
      {hasCustomImage ? (
        <div className="relative w-full h-full flex items-end justify-center [@media(hover:hover)_and_(pointer:fine)]:contrast-105">
          {useTransformedView ? (
            <TransformedImage
              src={imageSrc}
              alt={displayAlt}
              transform={transform}
              defaultFit="contain"
              defaultPosition="bottom"
              sizes="(max-width: 640px) 90vw, (max-width: 1024px) 65vw, 50vw"
              unoptimized
              loading="eager"
              fetchPriority="high"
              className="w-full h-full"
              onNaturalSize={({ width, height }) => {
                if (width > 0 && height > 0) {
                  handleNaturalAspect(width / height);
                }
              }}
              onError={() => setFailedSrc(imageSrc)}
            />
          ) : (
            <Image
              src={imageSrc}
              alt={displayAlt}
              fill
              unoptimized
              loading="eager"
              fetchPriority="high"
              sizes="(max-width: 640px) 90vw, (max-width: 1024px) 65vw, 50vw"
              className="object-contain object-bottom"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  handleNaturalAspect(img.naturalWidth / img.naturalHeight);
                }
              }}
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

      {/* Gradient Melt Base — Crisp bottom seam fade without veiling portrait or name */}
      <div className="avatar-bottom-melt absolute inset-x-0 bottom-0 h-8 sm:h-12 lg:h-14 bg-linear-to-b from-transparent via-[#08080a]/50 to-[#08080a] pointer-events-none z-20" />
    </div>
  );
}
