"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionHeaders, SkillCategory } from "@/types/portfolio";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";
import { ScrollReveal } from "@/components/motion/ScrollReveal";
import { BentoCard } from "@/components/ui/BentoCard";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import {
  Eyebrow,
  DisplayHeading,
  BodyText,
  MonoLabel,
} from "@/components/ui/Typography";
import { cn } from "@/lib/utils";

const AUTO_ROTATE_INTERVAL_MS = 4500;

export interface TechBentoProps {
  skills: SkillCategory[];
  sectionHeaders: SectionHeaders;
}

export function TechBento({ skills, sectionHeaders }: TechBentoProps) {
  const { appearance } = usePortfolio();
  const sectionRef = useRef<HTMLElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const lastInteractionAtRef = useRef<number>(0);

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isInView, setIsInView] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const markUserPresent = useCallback(() => {
    lastInteractionAtRef.current = Date.now();
  }, []);

  const reducedMotion = resolveEffectiveReducedMotion(appearance);
  const totalLayers = skills.length;
  const safeActiveIndex =
    totalLayers > 0
      ? ((activeIndex % totalLayers) + totalLayers) % totalLayers
      : 0;
  const activeLayer = skills[safeActiveIndex] ?? null;

  const layerTabItems = useMemo<TabItem<string>[]>(
    () =>
      skills.map((cat, idx) => ({
        id: cat.id,
        label: `${String(idx + 1).padStart(2, "0")} · ${cat.title}`,
        badge: cat.skills.length,
        badgeVariant: "neutral",
      })),
    [skills]
  );

  const stepLayer = useCallback(
    (delta: number) => {
      if (totalLayers <= 1) return;
      setActiveIndex(
        (prev) => (((prev + delta) % totalLayers) + totalLayers) % totalLayers
      );
    },
    [totalLayers]
  );

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        setIsInView(entries.some((entry) => entry.isIntersecting));
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (totalLayers <= 1 || !isInView || isPaused || reducedMotion) {
      return;
    }
    const timerId = window.setInterval(() => {
      if (Date.now() - lastInteractionAtRef.current < 9000) {
        return;
      }
      stepLayer(1);
    }, AUTO_ROTATE_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, [totalLayers, isInView, isPaused, reducedMotion, stepLayer]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    markUserPresent();
    setIsPaused(true);
    const touch = e.touches[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    markUserPresent();
    setIsPaused(false);
    if (touchStartXRef.current === null || touchStartYRef.current === null) {
      return;
    }
    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      stepLayer(deltaX < 0 ? 1 : -1);
    }
  };

  return (
    <section
      ref={sectionRef}
      id="skills"
      aria-label="Technical Skills and Architecture"
      onPointerDownCapture={markUserPresent}
      className="relative z-10 scroll-mt-20 w-full py-(--section-py) px-(--gutter) border-b border-(--border-subtle) bg-(--bg-canvas)/74"
    >
      <div className="max-w-(--container-max) mx-auto w-full flex flex-col gap-6 sm:gap-10">
        {/* Section Header */}
        <ScrollReveal
          variant="fade-up"
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-6"
        >
          <div>
            <Eyebrow withDot className="mb-2">
              {sectionHeaders.skillsEyebrow}
            </Eyebrow>
            <DisplayHeading as="h2" size="lg">
              {sectionHeaders.skillsHeading}
            </DisplayHeading>
          </div>
          <BodyText size="sm" tone="secondary" className="max-w-md">
            {sectionHeaders.skillsSubtitle}
          </BodyText>
        </ScrollReveal>

        {/* DESKTOP / TABLET (>= 768px): Asymmetric Editorial Bento Matrix */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-12 gap-5 lg:gap-6 w-full">
          {skills.map((category, idx) => {
            const bentoSpan =
              skills.length === 4
                ? idx === 0 || idx === 3
                  ? "lg:col-span-7"
                  : "lg:col-span-5"
                : skills.length === 3 && idx === 0
                  ? "lg:col-span-12"
                  : "lg:col-span-6";
            return (
              <ScrollReveal
                key={category.id}
                variant="fade-up"
                delayMs={idx * 75}
                className={cn("bento-card-item flex h-full w-full", bentoSpan)}
              >
                <BentoCard
                  category={category}
                  index={idx}
                  className="w-full h-full"
                />
              </ScrollReveal>
            );
          })}
        </div>

        {/* MOBILE (< 768px): Horizontally Scrollable Layer Tabs + Single Compact Bento Card */}
        {activeLayer && (
          <div
            onPointerEnter={() => {
              markUserPresent();
              setIsPaused(true);
            }}
            onPointerMove={markUserPresent}
            onPointerLeave={() => setIsPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex md:hidden flex-col gap-3 w-full"
          >
            {layerTabItems.length > 1 && (
              <Tabs
                items={layerTabItems}
                value={activeLayer.id}
                onChange={(nextId) => {
                  markUserPresent();
                  const foundIdx = skills.findIndex((c) => c.id === nextId);
                  if (foundIdx !== -1) setActiveIndex(foundIdx);
                }}
                ariaLabel="Select architecture system layer"
                variant="accent"
                size="sm"
                layout="fill"
                className="w-full"
              />
            )}

            <div className="relative w-full grid grid-cols-1 grid-rows-1">
              {skills.map((cat, idx) => {
                const isSelected = idx === safeActiveIndex;
                return (
                  <div
                    key={cat.id}
                    aria-hidden={!isSelected}
                    className={cn(
                      "bento-card-item col-start-1 row-start-1 w-full h-full flex transition-[opacity,transform,visibility] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity]",
                      isSelected
                        ? "opacity-100 translate-y-0 scale-100 z-10 pointer-events-auto visible"
                        : "opacity-0 translate-y-2.5 scale-[0.985] z-0 pointer-events-none invisible"
                    )}
                  >
                    <BentoCard
                      category={cat}
                      index={idx}
                      className="w-full h-full"
                    />
                  </div>
                );
              })}
            </div>

            {totalLayers > 1 && (
              <div className="w-full rounded-sm border border-(--border-subtle) bg-(--bg-surface-2) p-1 flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    markUserPresent();
                    stepLayer(-1);
                  }}
                  aria-label="Prev system layer"
                  className="h-[1.875rem] px-2.5 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) text-[0.6875rem] font-mono uppercase tracking-wider text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-(--text-accent)" />
                  <span>Prev</span>
                </button>

                <MonoLabel tone="secondary" className="truncate px-2">
                  <span className="text-(--text-accent) font-bold">
                    {String(safeActiveIndex + 1).padStart(2, "0")}
                  </span>{" "}
                  / {String(totalLayers).padStart(2, "0")} · {activeLayer.title}
                </MonoLabel>

                <button
                  type="button"
                  onClick={() => {
                    markUserPresent();
                    stepLayer(1);
                  }}
                  aria-label="Next system layer"
                  className="h-[1.875rem] px-2.5 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) text-[0.6875rem] font-mono uppercase tracking-wider text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5 text-(--text-accent)" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
