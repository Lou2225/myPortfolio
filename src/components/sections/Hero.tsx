"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";
import { dispatchJumpscareTrigger } from "@/lib/jumpscare";
import { prewarmResumePdf } from "@/lib/resumeCache";
import { Avatar } from "@/components/common/Avatar";
import { SplitText } from "@/components/motion/SplitText";
import { Button } from "@/components/ui/Button";
import { Eyebrow, BodyText, MonoLabel } from "@/components/ui/Typography";
import { ArrowDown, FileText } from "lucide-react";

const ResumeViewerModal = dynamic(
  () =>
    import("@/components/common/ResumeViewerModal").then(
      (mod) => mod.ResumeViewerModal
    ),
  { ssr: false }
);

export function Hero() {
  const { profile, appearance, trackEvent } = usePortfolio();
  const [resumeOpen, setResumeOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const prewarmResume = () => {
    prewarmResumePdf(profile.resumeUrl);
  };
  const nameLayerRef = useRef<HTMLDivElement>(null);

  const reducedMotion = resolveEffectiveReducedMotion(appearance);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    if (reducedMotion) {
      if (nameLayerRef.current) nameLayerRef.current.style.transform = "";
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
        }, 480)
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
  }, [reducedMotion]);

  return (
    <section
      ref={sectionRef}
      id="top"
      aria-label="Hero Section"
      className="relative z-10 min-h-[min(100svh,54rem)] [@media(min-height:680px)_and_(min-width:768px)]:h-[min(100svh,54rem)] w-full flex flex-col justify-between gap-4 [@media(min-height:680px)_and_(min-width:768px)]:gap-0 overflow-x-clip overflow-y-hidden pt-[clamp(4.5rem,3.5rem+3.5svh,6rem)] pb-3.5 sm:pb-5 px-(--gutter) select-none bg-transparent"
    >
      {/* LAYER 4 (Top Foreground UI, z-30): Roles on Left, Pitch & CTAs on Right */}
      <div className="relative z-30 max-w-(--container-max) mx-auto w-full flex flex-col md:flex-row md:items-start justify-between gap-3 sm:gap-6">
        {/* Left: Semantic H1, Chapter Eyebrow & Stacked Roles */}
        <div className="flex flex-col min-w-0 w-full md:w-auto md:max-w-[48%]">
          <h1 className="sr-only">
            {profile.fullName} — {profile.headline}
          </h1>

          <Eyebrow withDot pulseDot className="mb-1.5 sm:mb-2">
            CH // 00 · Class of {profile.education.graduationYear} · BSIT
          </Eyebrow>

          <h2 className="font-display text-[calc(clamp(1.25rem,0.95rem+2vw,2.25rem)*var(--public-scale,1))] md:text-[calc(clamp(1.2rem,0.85rem+1.6vw,2.25rem)*var(--public-scale,1))] [@media(max-height:640px)_and_(min-width:640px)]:text-[calc(clamp(1.0625rem,0.85rem+1vw,1.5rem)*var(--public-scale,1))] uppercase tracking-tight text-(--text-primary) leading-[1.06] flex flex-col [@media(max-height:640px)_and_(min-width:640px)]:grid [@media(max-height:640px)_and_(min-width:640px)]:grid-cols-2 [@media(max-height:640px)_and_(min-width:640px)]:gap-x-4 [@media(max-height:640px)_and_(min-width:640px)]:gap-y-0.5">
            {profile.roles.map((role) => (
              <span key={role} className="block wrap-break-word">
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
            className="[@media(max-height:640px)]:line-clamp-2"
          >
            {profile.bio}
          </BodyText>

          <div className="flex flex-wrap items-center md:justify-end gap-2 sm:gap-2.5 mt-3 sm:mt-3.5 w-full md:w-auto">
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
              onClick={(e) => {
                if (
                  appearance.jumpscareEnabled &&
                  appearance.jumpscareTrigger === "get-in-touch"
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  dispatchJumpscareTrigger("get-in-touch", true);
                }
              }}
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

      {/* Visual Stage Spacer — guarantees non-overlapping headroom for portrait & backdrop display type on zoomed/short viewports */}
      <div
        aria-hidden="true"
        className="w-full shrink-0 min-h-[clamp(14rem,36svh,22rem)] sm:min-h-[clamp(15.5rem,40svh,25rem)] [@media(max-height:640px)]:min-h-[clamp(11.5rem,36svh,16.5rem)] [@media(min-height:680px)_and_(min-width:768px)]:min-h-0 [@media(min-height:680px)_and_(min-width:768px)]:flex-1 pointer-events-none"
      />

      {/* LAYER 1 (Background Giant Kinetic Name, z-10) */}
      <div
        ref={nameLayerRef}
        aria-hidden="true"
        className="absolute inset-x-0 bottom-[clamp(3.25rem,8%,5rem)] z-10 flex flex-col items-center justify-center text-center pointer-events-none select-none px-(--gutter) overflow-hidden"
      >
        <div className="font-display uppercase text-[clamp(2.75rem,min(16.8vw,22svh),16.5rem)] sm:text-[clamp(4rem,min(18vw,24svh),16.5rem)] [@media(max-height:640px)]:text-[clamp(2.25rem,min(14.5vw,20svh),9.5rem)] leading-[0.82] tracking-tighter text-(--text-primary) opacity-92 whitespace-nowrap max-w-full">
          <SplitText
            key={profile.name}
            text={profile.name.toUpperCase()}
            type="lines"
            delay={0.08}
            triggerOnScroll={false}
          />
        </div>
        <span className="font-display uppercase text-[clamp(3.25rem,min(19.2vw,25svh),18.5rem)] sm:text-[clamp(4.5rem,min(20.5vw,27svh),18.5rem)] [@media(max-height:640px)]:text-[clamp(2.5rem,min(16.5vw,22svh),10.5rem)] leading-[0.78] tracking-tighter text-(--text-accent) whitespace-nowrap max-w-full">
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
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center pointer-events-none">
        <Avatar
          imageSrc={profile.avatarUrl || "/assets/hero/avatar.webp"}
          transform={profile.avatarTransform}
        />
      </div>

      {/* LAYER 3 (Full-Width Bottom Gradient Veil, z-25 — Melts bottom border cleanly without veiling display name) */}
      <div
        aria-hidden="true"
        className="hero-bottom-melt absolute inset-x-0 bottom-0 h-8 sm:h-12 bg-linear-to-t from-[#08080a] via-[#08080a]/55 to-transparent pointer-events-none z-25"
      />

      {/* LAYER 4 (Bottom Scroll Bar, z-30 — pl-12 clears the bottom-left LV BrandPortalOrb) */}
      <div className="relative z-30 max-w-(--container-max) mx-auto w-full flex items-center justify-center sm:justify-between gap-4 pl-12 sm:pl-14 2xl:pl-0 pr-12 sm:pr-14 2xl:pr-0 pt-2.5 sm:pt-3 border-t border-(--border-subtle)">
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
