"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Certificate, SectionHeaders } from "@/types/portfolio";
import { usePortfolio } from "@/context/PortfolioContext";
import { ScrollReveal } from "@/components/motion/ScrollReveal";
import { CertificateCard } from "@/components/ui/CertificateCard";
import { CertificateLightboxModal } from "@/components/common/CertificateLightboxModal";
import { Eyebrow, DisplayHeading, BodyText } from "@/components/ui/Typography";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const EMPTY_CERTIFICATES: Certificate[] = [];

export interface CertificatesProps {
  certificates?: Certificate[];
  sectionHeaders?: SectionHeaders;
}

export function Certificates({
  certificates: propCertificates,
  sectionHeaders: propSectionHeaders,
}: CertificatesProps) {
  const portfolio = usePortfolio();
  const certificates = propCertificates ?? portfolio.certificates ?? EMPTY_CERTIFICATES;
  const sectionHeaders = propSectionHeaders ?? portfolio.sectionHeaders;

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedCertIndex, setSelectedCertIndex] = useState<number | null>(null);

  // Filter only published certificates
  const publishedCertificates = useMemo(
    () => certificates.filter((c) => c.published !== false),
    [certificates]
  );

  const total = publishedCertificates.length;

  // Touch tracking for mobile swipe
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  const handlePrev = useCallback(() => {
    if (total === 0) return;
    setActiveSlideIndex((prev) => (prev - 1 + total) % total);
    portfolio.trackEvent?.("certificate_click", "carousel_prev");
  }, [total, portfolio]);

  const handleNext = useCallback(() => {
    if (total === 0) return;
    setActiveSlideIndex((prev) => (prev + 1) % total);
    portfolio.trackEvent?.("certificate_click", "carousel_next");
  }, [total, portfolio]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current === null || touchEndXRef.current === null) return;
    const diff = touchStartXRef.current - touchEndXRef.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  // Keyboard navigation when carousel stage is focused
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNext();
    }
  };

  const handleInspect = (cert: Certificate) => {
    const index = publishedCertificates.findIndex((c) => c.id === cert.id);
    setSelectedCertIndex(index >= 0 ? index : 0);
    portfolio.trackEvent?.("certificate_click", `certificate_inspect: ${cert.id}`);
  };

  const handleLightboxPrev = () => {
    if (selectedCertIndex === null || selectedCertIndex <= 0) return;
    setSelectedCertIndex(selectedCertIndex - 1);
  };

  const handleLightboxNext = () => {
    if (
      selectedCertIndex === null ||
      selectedCertIndex >= publishedCertificates.length - 1
    )
      return;
    setSelectedCertIndex(selectedCertIndex + 1);
  };

  // Calculate shortest wrapped offset for 3D carousel
  const getOffset = (index: number) => {
    let diff = index - activeSlideIndex;
    if (total > 2) {
      if (diff > total / 2) diff -= total;
      if (diff < -total / 2) diff += total;
    }
    return diff;
  };

  if (total === 0) {
    return null;
  }

  const activeCert =
    selectedCertIndex !== null && publishedCertificates[selectedCertIndex]
      ? publishedCertificates[selectedCertIndex]
      : null;

  return (
    <section
      id="certificates"
      aria-label="Certificates and Accreditations"
      className="relative z-10 scroll-mt-20 w-full py-(--section-py) px-(--gutter) border-b border-(--border-subtle) bg-(--bg-canvas)/80 backdrop-blur-xs overflow-hidden"
    >
      <div className="max-w-(--container-max) mx-auto w-full flex flex-col gap-8 sm:gap-12">
        {/* Section Header */}
        <ScrollReveal
          variant="fade-up"
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-6"
        >
          <div>
            <Eyebrow withDot className="mb-2">
              {sectionHeaders?.certificatesEyebrow || "CH // 03 · Certified Competence"}
            </Eyebrow>
            <DisplayHeading as="h2" size="lg">
              {sectionHeaders?.certificatesHeading || "CREDENTIALS & RECOGNITIONS."}
            </DisplayHeading>
          </div>
          <BodyText size="sm" tone="secondary" className="max-w-md">
            {sectionHeaders?.certificatesSubtitle ||
              "Academic honors, applied business analytics credentials, and engineering certifications."}
          </BodyText>
        </ScrollReveal>

        {/* 3D Perspective Carousel Stage */}
        <ScrollReveal variant="fade-up" delayMs={50}>
          <div
            role="region"
            aria-roledescription="carousel"
            aria-label="Certificates 3D Showcase"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative w-full h-[520px] sm:h-[560px] md:h-[600px] flex items-center justify-center select-none outline-none focus-visible:ring-1 focus-visible:ring-brand/50 rounded-(--radius-card)"
            style={{
              perspective: "1200px",
              perspectiveOrigin: "center center",
            }}
          >
            {/* Ambient Background Glow behind active card */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[460px] h-[340px] sm:h-[460px] bg-brand/10 rounded-full blur-3xl pointer-events-none -z-10" />

            {/* Side Left & Right Navigation Arrows */}
            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Previous certificate"
                  className="absolute left-1 sm:left-4 md:left-8 top-1/2 -translate-y-1/2 z-40 w-11 h-11 sm:w-13 sm:h-13 rounded-full border border-(--border-subtle) bg-(--bg-surface)/85 hover:bg-(--bg-surface) hover:border-brand text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-center backdrop-blur-md shadow-2xl hover:shadow-brand/25 transition-all duration-300 cursor-pointer active:scale-90 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 group-hover:-translate-x-0.5 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Next certificate"
                  className="absolute right-1 sm:right-4 md:right-8 top-1/2 -translate-y-1/2 z-40 w-11 h-11 sm:w-13 sm:h-13 rounded-full border border-(--border-subtle) bg-(--bg-surface)/85 hover:bg-(--bg-surface) hover:border-brand text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-center backdrop-blur-md shadow-2xl hover:shadow-brand/25 transition-all duration-300 cursor-pointer active:scale-90 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </>
            )}

            {/* 3D Certificate Cards */}
            {publishedCertificates.map((cert, idx) => {
              const offset = getOffset(idx);
              const absOffset = Math.abs(offset);
              const isActive = offset === 0;
              const isVisible = absOffset <= 2;

              // 3D positioning styles based on relative offset
              let transform = "";
              let zIndex = 10;
              let opacity = 0;
              let filter = "brightness(0.5) blur(2px)";
              let pointerEvents: "auto" | "none" = "none";

              if (isActive) {
                transform = "translateX(-50%) translateZ(0px) rotateY(0deg) scale(1)";
                zIndex = 30;
                opacity = 1;
                filter = "brightness(1) drop-shadow(0 25px 40px rgba(0,0,0,0.65))";
                pointerEvents = "auto";
              } else if (offset === -1) {
                // Left neighbor
                transform =
                  "translateX(calc(-50% - 62%)) translateZ(-90px) rotateY(24deg) scale(0.86)";
                zIndex = 20;
                opacity = 0.65;
                filter = "brightness(0.7) blur(0.5px)";
                pointerEvents = "auto";
              } else if (offset === 1) {
                // Right neighbor
                transform =
                  "translateX(calc(-50% + 62%)) translateZ(-90px) rotateY(-24deg) scale(0.86)";
                zIndex = 20;
                opacity = 0.65;
                filter = "brightness(0.7) blur(0.5px)";
                pointerEvents = "auto";
              } else if (offset === -2) {
                transform =
                  "translateX(calc(-50% - 105%)) translateZ(-200px) rotateY(32deg) scale(0.72)";
                zIndex = 10;
                opacity = 0.2;
                filter = "brightness(0.4) blur(2px)";
              } else if (offset === 2) {
                transform =
                  "translateX(calc(-50% + 105%)) translateZ(-200px) rotateY(-32deg) scale(0.72)";
                zIndex = 10;
                opacity = 0.2;
                filter = "brightness(0.4) blur(2px)";
              } else {
                transform = `translateX(${offset > 0 ? "150%" : "-150%"}) translateZ(-300px) scale(0.5)`;
                zIndex = 5;
                opacity = 0;
              }

              if (!isVisible) return null;

              return (
                <div
                  key={cert.id}
                  onClick={() => {
                    if (isActive) {
                      handleInspect(cert);
                    } else {
                      setActiveSlideIndex(idx);
                      portfolio.trackEvent?.("certificate_click", `carousel_jump: ${cert.id}`);
                    }
                  }}
                  className={cn(
                    "absolute top-1/2 left-1/2 -translate-y-1/2 w-[300px] sm:w-[380px] md:w-[420px] transition-all duration-500 ease-out cursor-pointer",
                    isActive
                      ? "ring-2 ring-brand/50 shadow-2xl rounded-(--radius-card)"
                      : "hover:opacity-90"
                  )}
                  style={{
                    transform,
                    zIndex,
                    opacity,
                    filter,
                    pointerEvents,
                    transformStyle: "preserve-3d",
                    willChange: "transform, opacity, filter",
                  }}
                  aria-hidden={!isActive}
                >
                  <CertificateCard
                    certificate={cert}
                    onInspect={handleInspect}
                    className="w-full h-full shadow-2xl"
                  />
                </div>
              );
            })}
          </div>
        </ScrollReveal>

        {/* Carousel Control Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-(--border-subtle)/60">
          {/* Slide Progress Counter */}
          <div className="flex items-center gap-2 font-mono text-xs text-(--text-muted) order-2 sm:order-1">
            <span className="text-(--text-accent) font-semibold text-sm">
              #{String(activeSlideIndex + 1).padStart(2, "0")}
            </span>
            <span className="text-(--text-muted)">/</span>
            <span>{String(total).padStart(2, "0")}</span>
            <span className="hidden sm:inline uppercase tracking-widest text-[10px] text-(--text-muted) ml-1.5">
              · Official Credentials
            </span>
          </div>

          {/* Center Indicator Dots */}
          <div className="flex items-center gap-1.5 order-1 sm:order-2">
            {publishedCertificates.map((cert, dotIdx) => {
              const isCurrent = dotIdx === activeSlideIndex;
              return (
                <button
                  key={cert.id}
                  type="button"
                  onClick={() => {
                    setActiveSlideIndex(dotIdx);
                    portfolio.trackEvent?.("certificate_click", `carousel_dot: ${dotIdx}`);
                  }}
                  aria-label={`Go to slide ${dotIdx + 1}: ${cert.title}`}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
                    isCurrent
                      ? "w-8 bg-brand shadow-sm shadow-brand/40"
                      : "w-2 bg-(--border-strong) hover:bg-(--text-muted)"
                  )}
                />
              );
            })}
          </div>

          {/* Quick Jump Action */}
          <div className="text-[11px] font-mono text-(--text-muted) order-3 hidden sm:block">
            Use side arrows or swipe to navigate
          </div>
        </div>

        {/* Lightbox Modal */}
        <CertificateLightboxModal
          certificate={activeCert}
          isOpen={selectedCertIndex !== null}
          onClose={() => setSelectedCertIndex(null)}
          onPrev={handleLightboxPrev}
          onNext={handleLightboxNext}
          hasPrev={selectedCertIndex !== null && selectedCertIndex > 0}
          hasNext={
            selectedCertIndex !== null &&
            selectedCertIndex < publishedCertificates.length - 1
          }
        />
      </div>
    </section>
  );
}
