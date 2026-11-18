"use client";

import { useEffect, useRef, useState } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";
import { Avatar } from "@/components/common/Avatar";
import { ResumeViewerModal } from "@/components/common/ResumeViewerModal";
import { SplitText } from "@/components/motion/SplitText";
import { Button } from "@/components/ui/Button";
import { Eyebrow, BodyText, MonoLabel } from "@/components/ui/Typography";
import { ArrowDown, FileText } from "lucide-react";

export function Hero() {
  const { profile, appearance, trackEvent } = usePortfolio();
  const [resumeOpen, setResumeOpen] = useState(false);
  const prewarmedResumeRef = useRef<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const prewarmResume = () => {
    const raw = (profile.resumeUrl || "").trim();
    if (
      !raw ||
      prewarmedResumeRef.current === raw ||
      /^https?:\/\/drive\.google\.com\//i.test(raw)
    ) {
      return;
    }
    prewarmedResumeRef.current = raw;
    void fetch(`/api/resume?v=${encodeURIComponent(raw)}`)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => {
        prewarmedResumeRef.current = null;
      });
  };
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
      className="relative h-svh min-h-[29rem] sm:min-h-[32rem] max-h-[72rem] w-full flex flex-col justify-between overflow-hidden pt-[clamp(4.25rem,9.5svh,6.75rem)] pb-3.5 sm:pb-5 px-(--gutter) select-none bg-(--bg-canvas)"
    >
      {/* LAYER 4 (Top Foreground UI, z-30): Roles on Left, Pitch & CTAs on Right */}
      <div className="relative z-30 max-w-7xl mx-auto w-full flex flex-col md:flex-row md:items-start justify-between gap-2.5 sm:gap-6">
        {/* Left: Semantic H1, Chapter Eyebrow & Stacked Roles */}
        <div className="flex flex-col min-w-0 w-full md:w-auto md:max-w-[48%]">
          <h1 className="sr-only">
            {profile.fullName} — {profile.headline}
          </h1>

          <Eyebrow withDot pulseDot className="mb-1.5 sm:mb-2">
            CH // 00 · Class of {profile.education.graduationYear} · BSIT
          </Eyebrow>

          <h2 className="font-display text-[clamp(1.5rem,min(6.4vw,4.8svh),2.25rem)] md:text-[clamp(1.25rem,min(3vw,4.6svh),2.25rem)] [@media(max-height:640px)]:text-[clamp(1.0625rem,min(2.6vw,4.2svh),1.5rem)] uppercase tracking-tight text-(--text-primary) leading-[1.04] flex flex-col [@media(max-height:640px)]:grid [@media(max-height:640px)]:grid-cols-2 [@media(max-height:640px)]:gap-x-4 [@media(max-height:640px)]:gap-y-0.5">
            {profile.roles.map((role) => (
              <span key={role} className="block truncate">
                {role}
              </span>
            ))}
          </h2>
        </div>

        {/* Right: Status Pill, Concise Bio & Quick CTAs */}
        <div className="w-full max-w-xl md:max-w-[48%] lg:max-w-md md:text-right flex flex-col md:items-end">
          <div className="inline-flex [@media(max-height:640px)]:hidden items-center gap-2 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-(--bg-surface-2) border border-(--border-subtle) text-[0.625rem] sm:text-[0.6875rem] text-(--text-secondary) mb-2 self-start md:self-end max-w-full">
            <span className="w-2 h-2 rounded-full bg-(--text-success) shrink-0" />
            <span className="truncate">{profile.contact.status}</span>
          </div>

          <BodyText
            size="sm"
            tone="secondary"
            className="line-clamp-3 [@media(max-height:640px)]:line-clamp-2"
          >
            {profile.bio}
          </BodyText>

          <div className="flex flex-nowrap items-center md:justify-end gap-1.5 sm:gap-2.5 mt-3 sm:mt-3.5 w-full md:w-auto">
            <Button
              href="#projects"
              variant="primary"
              size="sm"
              className="px-3 sm:px-5 gap-1 sm:gap-1.5 text-[0.625rem] sm:text-[0.6875rem]"
            >
              <span>{profile.heroCtaPrimary || "View Systems"}</span>
              <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            </Button>
            <Button
              href="#contact"
              variant="outline"
              size="sm"
              className="px-3 sm:px-5 text-[0.625rem] sm:text-[0.6875rem] bg-(--bg-surface)/95"
            >
              <span>{profile.heroCtaSecondary || "Contact Me"}</span>
            </Button>
            {profile.resumeUrl && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onMouseEnter={prewarmResume}
                onFocus={prewarmResume}
                onClick={() => {
                  setResumeOpen(true);
                  trackEvent("cv_download", "Hero Resume CTA");
                }}
                className="px-3 sm:px-4 gap-1 sm:gap-1.5 text-[0.625rem] sm:text-[0.6875rem]"
              >
                <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-(--text-accent) shrink-0" />
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
        className="absolute inset-x-0 bottom-[10svh] sm:bottom-[8svh] lg:bottom-[6svh] [@media(max-height:640px)]:bottom-[7svh] z-10 flex flex-col items-center justify-center text-center pointer-events-none select-none px-(--gutter) overflow-hidden"
      >
        <div className="font-display uppercase text-[clamp(3.125rem,min(15.8vw,15.5svh),10.5rem)] leading-[0.82] tracking-tighter text-(--text-primary) opacity-90 whitespace-nowrap max-w-full">
          <SplitText
            key={profile.name}
            text={profile.name.toUpperCase()}
            type="lines"
            delay={0.08}
            triggerOnScroll={false}
          />
        </div>
        <span className="font-display uppercase text-[clamp(3.5rem,min(18vw,17.5svh),12rem)] leading-[0.78] tracking-tighter text-(--text-accent) whitespace-nowrap max-w-full">
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
        className="hero-bottom-melt absolute inset-x-0 bottom-0 h-[4.5rem] sm:h-[6.5rem] bg-linear-to-t from-[#08080a] via-[#08080a]/80 to-transparent pointer-events-none z-25"
      />

      {/* LAYER 4 (Bottom Scroll Bar, z-30 — pl-12 clears the bottom-left LV BrandPortalOrb) */}
      <div className="relative z-30 max-w-7xl mx-auto w-full flex items-center justify-center sm:justify-between pl-12 sm:pl-14 xl:pl-0 pr-12 sm:pr-14 xl:pr-0 pt-2.5 sm:pt-3 border-t border-(--border-subtle)">
        <a
          href="#story"
          className="flex items-center gap-2.5 text-[0.625rem] sm:text-[0.75rem] font-mono uppercase tracking-[0.2em] text-(--text-muted) hover:text-(--text-primary) transition-colors pointer-events-auto"
        >
          <span className="w-6 sm:w-8 h-px bg-brand" />
          <span>{profile.heroScrollCue || "Scroll to enter the story"}</span>
        </a>
        <MonoLabel tone="secondary" className="hidden sm:inline">
          00 // PROLOGUE — {profile.education.major}
        </MonoLabel>
      </div>

      {profile.resumeUrl && (
        <ResumeViewerModal
          open={resumeOpen}
          onClose={() => setResumeOpen(false)}
          resumeUrl={profile.resumeUrl}
          fullName={profile.fullName}
          headline={profile.headline}
          monogram={profile.monogram}
          monogramImageUrl={profile.monogramImageUrl}
          monogramTransform={profile.monogramTransform}
        />
      )}
    </section>
  );
}
