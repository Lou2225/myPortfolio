"use client";

import { useEffect, useRef } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";
import { Avatar } from "@/components/common/Avatar";
import { SplitText } from "@/components/motion/SplitText";
import { Button } from "@/components/ui/Button";
import { Eyebrow, BodyText, MonoLabel } from "@/components/ui/Typography";
import { ArrowDown, FileDown } from "lucide-react";

export function Hero() {
  const { profile, appearance, trackEvent } = usePortfolio();
  const sectionRef = useRef<HTMLElement>(null);
  const nameLayerRef = useRef<HTMLDivElement>(null);
  const avatarLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    if (resolveEffectiveReducedMotion(appearance)) {
      if (nameLayerRef.current) nameLayerRef.current.style.transform = "";
      if (avatarLayerRef.current) avatarLayerRef.current.style.transform = "";
      return;
    }

    let cancelled = false;
    let started = false;
    let ctx: { revert: () => void } | null = null;

    const setupParallax = async () => {
      if (cancelled || started || ctx) return;
      started = true;
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        if (nameLayerRef.current) {
          gsap.to(nameLayerRef.current, {
            yPercent: 20,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          });
        }

        if (avatarLayerRef.current) {
          gsap.to(avatarLayerRef.current, {
            yPercent: 8,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          });
        }
      }, section);
    };

    const onFirstScrollIntent = () => {
      void setupParallax();
    };
    window.addEventListener("wheel", onFirstScrollIntent, {
      passive: true,
      once: true,
    });
    window.addEventListener("touchstart", onFirstScrollIntent, {
      passive: true,
      once: true,
    });
    window.addEventListener("scroll", onFirstScrollIntent, {
      passive: true,
      once: true,
    });

    let checkInitialScroll = 0;
    const hashTimerId = window.location.hash
      ? window.setTimeout(() => {
          checkInitialScroll = requestAnimationFrame(() => {
            if (window.scrollY > 0) void setupParallax();
          });
        }, 150)
      : 0;

    return () => {
      cancelled = true;
      if (hashTimerId) window.clearTimeout(hashTimerId);
      if (checkInitialScroll) cancelAnimationFrame(checkInitialScroll);
      window.removeEventListener("wheel", onFirstScrollIntent);
      window.removeEventListener("touchstart", onFirstScrollIntent);
      window.removeEventListener("scroll", onFirstScrollIntent);
      ctx?.revert();
    };
  }, [appearance]);

  return (
    <section
      ref={sectionRef}
      id="top"
      aria-label="Hero Section"
      className="relative h-svh min-h-136 sm:min-h-145 max-h-287.5 w-full flex flex-col justify-between overflow-hidden pt-18 sm:pt-24 lg:pt-28 pb-4 sm:pb-6 px-4 sm:px-6 md:px-10 select-none bg-(--bg-canvas)"
    >
      {/* LAYER 4 (Top Foreground UI, z-30): Roles on Left, Pitch & CTAs on Right */}
      <div className="relative z-30 max-w-7xl mx-auto w-full flex flex-col lg:flex-row lg:items-start justify-between gap-3.5 sm:gap-6">
        {/* Left: Semantic H1, Chapter Eyebrow & Stacked Roles */}
        <div className="flex flex-col min-w-0">
          <h1 className="sr-only">
            {profile.fullName} — {profile.headline}
          </h1>

          <Eyebrow withDot pulseDot className="mb-1.5 sm:mb-2">
            CH // 00 · Class of {profile.education.graduationYear} · BSIT
          </Eyebrow>

          <h2 className="font-display text-lg sm:text-2xl lg:text-3xl xl:text-4xl uppercase tracking-tight text-(--text-primary) leading-[1.05] grid grid-cols-1 min-[380px]:grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-0.5 lg:flex lg:flex-col">
            {profile.roles.map((role) => (
              <span key={role} className="block truncate">
                {role}
              </span>
            ))}
          </h2>
        </div>

        {/* Right: Status Pill, Concise Bio & Quick CTAs */}
        <div className="max-w-md lg:max-w-sm xl:max-w-md lg:text-right flex flex-col lg:items-end">
          <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-(--bg-surface-2) border border-(--border-subtle) text-[11px] text-(--text-secondary) mb-2.5 self-start lg:self-end">
            <span className="w-2 h-2 rounded-full bg-(--text-success)" />
            <span>{profile.contact.status}</span>
          </div>

          <BodyText
            size="sm"
            tone="secondary"
            className="line-clamp-3 sm:line-clamp-none"
          >
            {profile.bio}
          </BodyText>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 mt-3 sm:mt-4">
            <Button
              href="#projects"
              variant="primary"
              size="sm"
              className="gap-1.5 sm:px-5"
            >
              <span>{profile.heroCtaPrimary || "View Systems"}</span>
              <ArrowDown className="w-3.5 h-3.5" />
            </Button>
            <Button
              href="#contact"
              variant="outline"
              size="sm"
              className="sm:px-5 bg-(--bg-surface)/95"
            >
              <span>{profile.heroCtaSecondary || "Contact Me"}</span>
            </Button>
            {profile.resumeUrl && (
              <Button
                href={profile.resumeUrl}
                external
                variant="secondary"
                size="sm"
                onClick={() => trackEvent("cv_download", "Hero Resume CTA")}
                className="gap-1.5 sm:px-4"
              >
                <FileDown className="w-3.5 h-3.5 text-(--text-accent)" />
                <span>Resume</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* LAYER 1 (Background Giant Kinetic Name, z-10) */}
      <div
        ref={nameLayerRef}
        aria-hidden="true"
        className="absolute inset-x-0 bottom-[9svh] sm:bottom-[8svh] lg:bottom-[6svh] z-10 flex flex-col items-center justify-center text-center pointer-events-none select-none px-2"
      >
        <div className="font-display uppercase text-[min(16vw,calc(14.5vw*var(--public-scale,1)))] sm:text-[min(15.5vw,calc(13.5vw*var(--public-scale,1)))] lg:text-[calc(12vw*var(--public-scale,1))] leading-[0.82] tracking-tighter text-(--text-primary) opacity-90 whitespace-nowrap">
          <SplitText
            key={profile.name}
            text={profile.name.toUpperCase()}
            type="lines"
            delay={0.08}
            triggerOnScroll={false}
          />
        </div>
        <span className="font-display uppercase text-[min(18vw,calc(16.5vw*var(--public-scale,1)))] sm:text-[min(17vw,calc(15.5vw*var(--public-scale,1)))] lg:text-[calc(13.8vw*var(--public-scale,1))] leading-[0.78] tracking-tighter text-(--text-accent) whitespace-nowrap">
          <SplitText
            key={profile.lastName || "VALDELLON"}
            text={(profile.lastName || "VALDELLON").toUpperCase()}
            type="lines"
            delay={0.18}
            triggerOnScroll={false}
          />
        </span>
      </div>

      {/* LAYER 2 (Middle Cutout Portrait, z-20 — Anchored to bottom of viewport) */}
      <div
        ref={avatarLayerRef}
        className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center pointer-events-none"
      >
        <Avatar
          imageSrc={profile.avatarUrl || "/assets/hero/avatar.png"}
          transform={profile.avatarTransform}
        />
      </div>

      {/* LAYER 3 (Full-Width Bottom Gradient Veil, z-25 — Melts name & avatar into canvas) */}
      <div
        aria-hidden="true"
        className="hero-bottom-melt absolute inset-x-0 bottom-0 h-20 sm:h-28 bg-linear-to-t from-[#08080a] via-[#08080a]/80 to-transparent pointer-events-none z-25"
      />

      {/* LAYER 4 (Bottom Scroll Bar, z-30) */}
      <div className="relative z-30 max-w-7xl mx-auto w-full flex items-center justify-between pt-3 border-t border-(--border-subtle)">
        <a
          href="#story"
          className="flex items-center gap-2.5 text-[10px] sm:text-xs font-mono uppercase tracking-[0.2em] text-(--text-muted) hover:text-(--text-primary) transition-colors pointer-events-auto"
        >
          <span className="w-6 sm:w-8 h-px bg-brand" />
          <span>{profile.heroScrollCue || "Scroll to enter the story"}</span>
        </a>
        <MonoLabel tone="secondary" className="hidden sm:inline">
          00 // PROLOGUE — {profile.education.major}
        </MonoLabel>
      </div>
    </section>
  );
}
