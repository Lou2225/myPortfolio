"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  PanelsLeftBottom,
} from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { resolveEffectiveReducedMotion } from "@/lib/appearance";
import { Magnetic } from "@/components/motion/Magnetic";
import { ProjectCard } from "@/components/ui/ProjectCard";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  Eyebrow,
  DisplayHeading,
  MonoLabel,
  BodyText,
  TechBadge,
} from "@/components/ui/Typography";
import { cn } from "@/lib/utils";

const AUTO_ROTATE_INTERVAL_MS = 4500;

export function Projects() {
  const { projects, sectionHeaders, appearance } = usePortfolio();
  const sectionRef = useRef<HTMLElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const lastInteractionAtRef = useRef<number>(0);

  const visibleProjects = useMemo(
    () => projects.filter((p) => p.published !== false),
    [projects]
  );

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [userViewMode, setUserViewMode] = useState<"spotlight" | "grid" | null>(
    null
  );
  const [isInView, setIsInView] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const viewMode: "spotlight" | "grid" =
    userViewMode ??
    (appearance.projectsLayout === "aligned" ? "grid" : "spotlight");

  const reducedMotion = resolveEffectiveReducedMotion(appearance);

  const markUserPresent = useCallback(() => {
    lastInteractionAtRef.current = Date.now();
  }, []);

  const totalProjects = visibleProjects.length;
  const safeActiveIndex =
    totalProjects > 0
      ? ((activeIndex % totalProjects) + totalProjects) % totalProjects
      : 0;
  const activeProject = visibleProjects[safeActiveIndex] ?? null;

  const projectTabItems = useMemo<TabItem<string>[]>(
    () =>
      visibleProjects.map((proj, idx) => ({
        id: proj.id,
        label: `${String(idx + 1).padStart(2, "0")} · ${proj.category}`,
        ariaLabel: `${proj.title} — ${proj.category}`,
      })),
    [visibleProjects]
  );

  const toggleViewLabel =
    viewMode === "spotlight"
      ? "Switch to Grid View"
      : "Switch to Spotlight View";

  const stepProject = useCallback(
    (delta: number) => {
      if (totalProjects <= 1) return;
      setActiveIndex(
        (prev) => (((prev + delta) % totalProjects) + totalProjects) % totalProjects
      );
    },
    [totalProjects]
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
    if (
      viewMode !== "spotlight" ||
      totalProjects <= 1 ||
      !isInView ||
      isPaused ||
      reducedMotion
    ) {
      return;
    }
    const timerId = window.setInterval(() => {
      if (Date.now() - lastInteractionAtRef.current < 9000) {
        return;
      }
      stepProject(1);
    }, AUTO_ROTATE_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, [viewMode, totalProjects, isInView, isPaused, reducedMotion, stepProject]);

  const handleStageKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    markUserPresent();
    if (totalProjects <= 1) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      stepProject(-1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      stepProject(1);
    }
  };

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
      stepProject(deltaX < 0 ? 1 : -1);
    }
  };

  return (
    <section
      ref={sectionRef}
      id="projects"
      aria-label="Selected Projects and Systems"
      onPointerDownCapture={markUserPresent}
      className="scroll-mt-20 w-full py-(--section-py) px-(--gutter) border-b border-(--border-subtle) bg-(--bg-canvas)"
    >
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-5 sm:gap-8">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-6">
          <div>
            <Eyebrow withDot className="mb-2">
              {sectionHeaders.projectsEyebrow}
            </Eyebrow>
            <DisplayHeading as="h2" size="lg">
              {sectionHeaders.projectsHeading}
            </DisplayHeading>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <MonoLabel tone="accent">
                {String(
                  viewMode === "spotlight" && totalProjects > 0
                    ? safeActiveIndex + 1
                    : totalProjects
                ).padStart(2, "0")}
              </MonoLabel>
              <MonoLabel tone="muted">
                / {String(totalProjects).padStart(2, "0")}{" "}
                {sectionHeaders.projectsCounterLabel}
              </MonoLabel>
            </div>

            {totalProjects > 1 && (
              <Magnetic strength={0.2}>
                <Tooltip content={toggleViewLabel} side="top">
                  <button
                    type="button"
                    onClick={() => {
                      markUserPresent();
                      setUserViewMode(
                        viewMode === "spotlight" ? "grid" : "spotlight"
                      );
                    }}
                    aria-label={toggleViewLabel}
                    aria-pressed={viewMode === "grid"}
                    className="relative w-8.5 h-8.5 rounded-full bg-(--bg-surface) border border-(--border-strong) hover:border-brand text-(--text-primary) hover:text-(--text-accent) shadow-sm inline-flex items-center justify-center transition-colors duration-300 cursor-pointer select-none active:scale-95 shrink-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="relative inline-flex items-center justify-center w-3.5 h-3.5">
                      <LayoutGrid
                        aria-hidden="true"
                        className={cn(
                          "w-3.5 h-3.5 transition-all duration-500 ease-out",
                          viewMode === "spotlight"
                            ? "rotate-0 scale-100 opacity-100 text-(--text-accent)"
                            : "rotate-90 scale-0 opacity-0 absolute"
                        )}
                      />
                      <PanelsLeftBottom
                        aria-hidden="true"
                        className={cn(
                          "w-3.5 h-3.5 transition-all duration-500 ease-out",
                          viewMode === "grid"
                            ? "rotate-0 scale-100 opacity-100 text-(--text-accent)"
                            : "-rotate-90 scale-0 opacity-0 absolute"
                        )}
                      />
                    </span>
                  </button>
                </Tooltip>
              </Magnetic>
            )}
          </div>
        </div>

        {/* Projects Showcase: Master-Detail Spotlight or 2-Column Grid */}
        {totalProjects === 0 ? (
          <div className="p-8 rounded-(--radius-card) border border-(--border-subtle) bg-(--bg-surface) text-center">
            <BodyText size="sm" tone="secondary">
              No published systems are currently available.
            </BodyText>
          </div>
        ) : viewMode === "grid" || totalProjects === 1 ? (
          <div
            key="projects-grid-view"
            className={cn(
              "grid grid-cols-1 gap-5 sm:gap-6 w-full",
              totalProjects === 1
                ? "max-w-[42rem] mx-auto"
                : "md:grid-cols-2"
            )}
          >
            {visibleProjects.map((project, idx) => (
              <div
                key={project.id}
                style={
                  !reducedMotion
                    ? { animationDelay: `${idx * 75}ms` }
                    : undefined
                }
                className="lou-view-morph w-full h-full flex"
              >
                <ProjectCard project={project} />
              </div>
            ))}
          </div>
        ) : (
          <div
            key="projects-spotlight-view"
            onKeyDown={handleStageKeyDown}
            onPointerEnter={() => {
              markUserPresent();
              setIsPaused(true);
            }}
            onPointerMove={markUserPresent}
            onPointerLeave={() => setIsPaused(false)}
            onFocusCapture={() => {
              markUserPresent();
              setIsPaused(true);
            }}
            onBlurCapture={() => setIsPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="w-full flex flex-col gap-3.5 md:grid md:grid-cols-12 md:gap-5 lg:gap-6 items-stretch"
          >
            {/* MOBILE (< 768px): Horizontally Scrollable System Tabs */}
            <div className="lou-view-morph md:hidden w-full">
              <Tabs
                items={projectTabItems}
                value={activeProject?.id ?? ""}
                onChange={(nextId) => {
                  markUserPresent();
                  const foundIdx = visibleProjects.findIndex(
                    (p) => p.id === nextId
                  );
                  if (foundIdx !== -1) setActiveIndex(foundIdx);
                }}
                ariaLabel="Select project system"
                variant="accent"
                size="sm"
                layout="fill"
                className="w-full"
              />
            </div>

            {/* TABLET & DESKTOP (>= 768px): Left 5-Column Master System Directory */}
            <div className="lou-view-morph hidden md:flex md:col-span-5 flex-col justify-between gap-2.5 lg:gap-3 w-full">
              <div
                role="tablist"
                aria-label="Featured Systems Directory"
                className="flex flex-col gap-2.5 flex-1"
              >
                {visibleProjects.map((proj, idx) => {
                  const isSelected = idx === safeActiveIndex;
                  return (
                    <button
                      key={proj.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      aria-label={`${String(idx + 1).padStart(2, "0")} ${proj.title} — ${proj.category}`}
                      onClick={() => {
                        markUserPresent();
                        setActiveIndex(idx);
                      }}
                      className={cn(
                        "group relative w-full text-left p-4 rounded-(--radius-card) border transition-[transform,background-color,border-color,box-shadow] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer overflow-hidden flex flex-col justify-between gap-2.5 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                        isSelected
                          ? "bg-(--bg-surface) border-brand/55 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.6),0_0_24px_-8px_var(--accent-glow)] translate-x-1"
                          : "bg-(--bg-surface)/60 border-(--border-subtle) hover:bg-(--bg-surface) hover:border-(--border-strong) hover:translate-x-0.5"
                      )}
                    >
                      {/* Left Active Accent Bar */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-y-0 left-0 w-1 bg-brand transition-transform duration-300 origin-top",
                          isSelected
                            ? "scale-y-100"
                            : "scale-y-0 group-hover:scale-y-50"
                        )}
                      />

                      <div className="pl-2">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.18em]">
                            <span
                              className={cn(
                                "font-bold tabular-nums",
                                isSelected
                                  ? "text-(--text-accent)"
                                  : "text-(--text-muted)"
                              )}
                            >
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <span className="text-(--text-secondary)">
                              · {proj.category}
                            </span>
                          </span>
                          <MonoLabel tone="muted">{proj.year}</MonoLabel>
                        </div>

                        <DisplayHeading
                          as="span"
                          size="sm"
                          tone={isSelected ? "accent" : "primary"}
                          className="block truncate"
                        >
                          {proj.title}
                        </DisplayHeading>

                        {proj.outcome && (
                          <span className="mt-1 inline-flex items-center gap-1.5 text-[0.6875rem] text-(--text-success) font-medium">
                            <CheckCircle2
                              className="w-3 h-3 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate">{proj.outcome}</span>
                          </span>
                        )}
                      </div>

                      <div className="pl-2 pt-2 border-t border-(--border-subtle) grid grid-cols-4 gap-1 w-full">
                        {proj.stack.slice(0, 4).map((tech) => (
                          <TechBadge
                            key={tech}
                            label={tech}
                            size="sm"
                            className="w-full h-[1.5rem] px-1.5 text-[0.5625rem] justify-center text-center"
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Desktop Directory Stepper Footer */}
              <div className="w-full rounded-sm border border-(--border-subtle) bg-(--bg-surface-2) p-1.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    markUserPresent();
                    stepProject(-1);
                  }}
                  aria-label="Previous system"
                  className="h-[2rem] px-3 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) hover:border-(--border-strong) text-[0.6875rem] font-mono uppercase tracking-wider text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-(--text-accent)" />
                  <span>Prev</span>
                </button>

                <MonoLabel tone="secondary" className="truncate px-2">
                  SYSTEM{" "}
                  <span className="text-(--text-accent) font-bold">
                    {String(safeActiveIndex + 1).padStart(2, "0")}
                  </span>{" "}
                  OF {String(totalProjects).padStart(2, "0")}
                </MonoLabel>

                <button
                  type="button"
                  onClick={() => {
                    markUserPresent();
                    stepProject(1);
                  }}
                  aria-label="Next system"
                  className="h-[2rem] px-3 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) hover:border-(--border-strong) text-[0.6875rem] font-mono uppercase tracking-wider text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5 text-(--text-accent)" />
                </button>
              </div>
            </div>

            {/* RIGHT 7-COLUMN (Tablet & Desktop) / MAIN STAGE (Mobile): Smooth Stacked GPU Crossfade Card */}
            {activeProject && (
              <div
                style={
                  !reducedMotion ? { animationDelay: "65ms" } : undefined
                }
                className="lou-view-morph md:col-span-7 flex flex-col gap-3 w-full h-full"
              >
                <div className="relative w-full flex-1 grid grid-cols-1 grid-rows-1">
                  {visibleProjects.map((proj, idx) => {
                    const isSelected = idx === safeActiveIndex;
                    return (
                      <div
                        key={proj.id}
                        aria-hidden={!isSelected}
                        className={cn(
                          "col-start-1 row-start-1 w-full h-full flex transition-[opacity,transform,visibility] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity]",
                          isSelected
                            ? "opacity-100 translate-y-0 scale-100 z-10 pointer-events-auto visible"
                            : "opacity-0 translate-y-2.5 scale-[0.985] z-0 pointer-events-none invisible"
                        )}
                      >
                        <ProjectCard project={proj} />
                      </div>
                    );
                  })}
                </div>

                {/* Mobile Bottom Stepper Bar */}
                <div className="flex md:hidden w-full rounded-sm border border-(--border-subtle) bg-(--bg-surface-2) p-1 items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      markUserPresent();
                      stepProject(-1);
                    }}
                    aria-label="Previous system"
                    className="h-[1.875rem] px-2.5 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) text-[0.6875rem] font-mono uppercase tracking-wider text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-(--text-accent)" />
                    <span>Prev</span>
                  </button>

                  <MonoLabel tone="secondary" className="truncate px-2">
                    <span className="text-(--text-accent) font-bold">
                      {String(safeActiveIndex + 1).padStart(2, "0")}
                    </span>{" "}
                    / {String(totalProjects).padStart(2, "0")} ·{" "}
                    {activeProject.category}
                  </MonoLabel>

                  <button
                    type="button"
                    onClick={() => {
                      markUserPresent();
                      stepProject(1);
                    }}
                    aria-label="Next system"
                    className="h-[1.875rem] px-2.5 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) text-[0.6875rem] font-mono uppercase tracking-wider text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5 text-(--text-accent)" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
