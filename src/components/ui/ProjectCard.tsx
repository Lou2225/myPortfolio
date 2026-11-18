"use client";

import { Project } from "@/types/portfolio";
import { usePortfolio } from "@/context/PortfolioContext";
import { LiquidImage } from "@/components/motion/LiquidImage";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  Eyebrow,
  DisplayHeading,
  BodyText,
  MonoLabel,
  TechBadge,
} from "@/components/ui/Typography";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Github,
  Sparkles,
  Star,
} from "lucide-react";

export function ProjectCard({ project }: { project: Project }) {
  const { trackEvent } = usePortfolio();
  const caseStudyHref = `/projects/${encodeURIComponent(project.id)}`;

  return (
    <article className="group relative h-full w-full flex flex-col bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) overflow-hidden hover:border-(--border-strong) transition-all duration-500 shadow-xl">
      {/* Compact Widescreen Liquid Image Showcase with Hover Distortion */}
      <LiquidImage
        src={project.image}
        alt={project.title}
        placeholderText={project.title}
        aspectRatio="h-[6rem] sm:h-[8.5rem] md:h-[9.5rem]"
        className="border-0 border-b border-(--border-subtle) rounded-none shrink-0"
      />

      <div className="p-3 sm:p-4 md:p-5 flex flex-col flex-1 justify-between gap-2.5 sm:gap-3">
        <div>
          {/* Header row: Category, Featured badge & Year */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Eyebrow withDot>{project.category}</Eyebrow>
              {project.featured && (
                <StatusPill
                  label="Featured"
                  variant="accent"
                  size="xs"
                  icon={<Star className="w-2.5 h-2.5 fill-current" aria-hidden="true" />}
                />
              )}
            </div>
            <MonoLabel tone="muted">{project.year}</MonoLabel>
          </div>

          {/* Title with hover color spring */}
          <DisplayHeading as="h3" size="sm" hoverAccent>
            {project.title}
          </DisplayHeading>

          {/* Role & Outcome Meta */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.6875rem] uppercase tracking-[0.12em] text-(--text-muted) font-medium">
            <span className="truncate">
              Role:{" "}
              <span className="text-(--text-primary) font-semibold">
                {project.role}
              </span>
            </span>
            {project.outcome && (
              <span className="inline-flex items-center gap-1 text-(--text-success)">
                <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="normal-case tracking-normal font-medium">
                  {project.outcome}
                </span>
              </span>
            )}
          </div>

          {/* Description */}
          <BodyText size="xs" tone="secondary" className="mt-1.5 sm:mt-2 line-clamp-2">
            {project.description}
          </BodyText>

          {/* Problem / Solution Equal-Height Mini-Grid (Shown on Tablet/Desktop; Full Detail in Case Study on Mobile) */}
          <div className="hidden sm:grid sm:grid-cols-2 gap-2.5 mt-2.5 pt-2.5 border-t border-(--border-subtle)">
            <div className="h-full bg-(--bg-surface-2) p-2.5 rounded-(--radius-control) border border-(--border-subtle) flex flex-col">
              <MonoLabel as="span" tone="accent" className="block mb-0.5">
                The Problem
              </MonoLabel>
              <BodyText size="xs" tone="secondary" className="line-clamp-2">
                {project.problem}
              </BodyText>
            </div>
            <div className="h-full bg-(--bg-surface-2) p-2.5 rounded-(--radius-control) border border-(--border-subtle) flex flex-col">
              <MonoLabel as="span" tone="success" className="block mb-0.5">
                Engineered Solution
              </MonoLabel>
              <BodyText size="xs" tone="secondary" className="line-clamp-2">
                {project.solution}
              </BodyText>
            </div>
          </div>

          {/* Key Metric Highlight */}
          {project.metrics && (
            <div className="mt-2 sm:mt-2.5 flex items-center gap-2 py-1.5 px-2.5 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/30 text-[0.6875rem] text-(--text-primary) font-medium">
              <Sparkles className="w-3.5 h-3.5 text-(--text-accent) shrink-0" aria-hidden="true" />
              <span className="line-clamp-1">{project.metrics}</span>
            </div>
          )}
        </div>

        {/* Footer: Uniform Tech Stack Grid + Equal-Width Action Bar */}
        <div className="pt-2.5 border-t border-(--border-subtle) flex flex-col gap-2 w-full">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 w-full">
            {project.stack.slice(0, 6).map((tech) => (
              <TechBadge
                key={tech}
                label={tech}
                size="sm"
                className="w-full h-[1.625rem] px-1.5 text-[0.625rem] justify-center text-center"
              />
            ))}
          </div>

          <div className="flex items-center gap-2 w-full">
            <Button
              href={caseStudyHref}
              variant="secondary"
              size="sm"
              fullWidth
              magnetic={false}
              slideDirection="right"
              onClick={() =>
                trackEvent("project_click", `${project.title} (Case Study)`)
              }
              aria-label={`Read full case study for ${project.title}`}
              className="flex-1 h-[2rem]"
            >
              <span>Case Study</span>
              <ArrowRight className="w-3.5 h-3.5 text-(--text-accent)" />
            </Button>

            {project.liveUrl && (
              <Button
                href={project.liveUrl}
                external
                variant="primary"
                size="sm"
                fullWidth
                magnetic={false}
                onClick={() =>
                  trackEvent("project_click", `${project.title} (Live Demo)`)
                }
                aria-label={`Visit live demo for ${project.title}`}
                className="flex-1 h-[2rem]"
              >
                <span>Live Demo</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            )}

            {project.githubUrl && (
              <Button
                href={project.githubUrl}
                external
                variant="outline"
                size="icon"
                magnetic={false}
                onClick={() =>
                  trackEvent("project_click", `${project.title} (GitHub)`)
                }
                aria-label={`View ${project.title} source code on GitHub`}
                title="View Source on GitHub"
                className="shrink-0 h-[2rem] w-[2rem]"
              >
                <Github className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
