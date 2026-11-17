"use client";

import { useEffect, useId, useRef, useState } from "react";
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

export function LiquidImage({
  src,
  alt,
  aspectRatio = "aspect-16/10",
  className,
  placeholderText,
}: LiquidImageProps) {
  const { appearance, profile } = usePortfolio();
  const rawId = useId();
  const filterId = `liquid-filter-${rawId.replace(/:/g, "")}`;
  const turbRef = useRef<SVGFETurbulenceElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [supportsFinePointer, setSupportsFinePointer] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const imageError = !src || failedSrc === src;
  const alwaysColor = appearance.imageColorMode === "always-color";
  const reducedMotion = resolveEffectiveReducedMotion(appearance);
  const distortionEligible =
    appearance.liquidDistortion && supportsFinePointer && !reducedMotion;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const rafId = requestAnimationFrame(() => setSupportsFinePointer(mq.matches));
    const handleChange = (e: MediaQueryListEvent) =>
      setSupportsFinePointer(e.matches);
    mq.addEventListener("change", handleChange);
    return () => {
      cancelAnimationFrame(rafId);
      mq.removeEventListener("change", handleChange);
    };
  }, []);

  const handleMouseEnter = () => {
    if (!distortionEligible) return;
    setIsHovered(true);

    void import("gsap").then(({ default: gsap }) => {
      if (turbRef.current && dispRef.current) {
        gsap.killTweensOf([dispRef.current, turbRef.current]);
        gsap.to(dispRef.current, {
          attr: { scale: 22 },
          duration: 0.5,
          ease: "power2.out",
        });
        gsap.to(turbRef.current, {
          attr: { baseFrequency: 0.02 },
          duration: 0.5,
          ease: "power2.out",
        });
      }
    });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (turbRef.current && dispRef.current) {
      void import("gsap").then(({ default: gsap }) => {
        if (turbRef.current && dispRef.current) {
          gsap.killTweensOf([dispRef.current, turbRef.current]);
          gsap.to(dispRef.current, {
            attr: { scale: 1 },
            duration: 0.6,
            ease: "power2.inOut",
          });
          gsap.to(turbRef.current, {
            attr: { baseFrequency: 0.009 },
            duration: 0.6,
            ease: "power2.inOut",
          });
        }
      });
    }
  };

  const applyFilter = distortionEligible && isHovered;

  return (
    <figure
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "liquid-image-frame relative overflow-hidden rounded-(--radius-card) bg-(--bg-surface-2) border border-(--border-subtle) group",
        aspectRatio,
        className
      )}
    >
      {/* Desktop fine-pointer SVG displacement filter mounted only during active hover */}
      {distortionEligible && isHovered && (
        <svg
          aria-hidden="true"
          className="absolute pointer-events-none w-0 h-0 opacity-0"
        >
          <defs>
            <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence
                ref={turbRef}
                type="fractalNoise"
                baseFrequency="0.009"
                numOctaves="2"
                result="noise"
              />
              <feDisplacementMap
                ref={dispRef}
                in="SourceGraphic"
                in2="noise"
                scale="1"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      )}

      {/* Image or Dynamic Fallback Graphic */}
      {!imageError ? (
        <div
          className="relative w-full h-full transition-transform duration-700 ease-out group-hover:scale-105"
          style={applyFilter ? { filter: `url(#${filterId})` } : undefined}
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
