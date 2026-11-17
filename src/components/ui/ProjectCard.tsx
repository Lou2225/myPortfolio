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
    <article className="group relative flex flex-col bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) overflow-hidden hover:border-(--border-strong) transition-all duration-500 shadow-xl">
      {/* Liquid Image Showcase with Hover Distortion */}
      <LiquidImage
        src={project.image}
        alt={project.title}
        placeholderText={project.title}
        aspectRatio="aspect-16/10"
        className="border-0 border-b border-(--border-subtle) rounded-none"
      />

      <div className="p-4 sm:p-6 md:p-8 flex flex-col flex-1 justify-between gap-5 sm:gap-6">
        <div>
          {/* Header row: Category, Featured badge & Year */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex flex-wrap items-center gap-2">
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
          <DisplayHeading as="h3" size="md" hoverAccent>
            {project.title}
          </DisplayHeading>

          {/* Role & Outcome Meta */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs uppercase tracking-[0.16em] text-(--text-muted) font-medium">
            <span>
              Role:{" "}
              <span className="text-(--text-primary) font-semibold">
                {project.role}
              </span>
            </span>
            {project.outcome && (
              <span className="inline-flex items-center gap-1.5 text-(--text-success)">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="normal-case tracking-normal font-medium">
                  {project.outcome}
                </span>
              </span>
            )}
          </div>

          {/* Description */}
          <BodyText size="sm" tone="secondary" className="mt-4">
            {project.description}
          </BodyText>

          {/* Problem / Solution Mini-Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 pt-5 border-t border-(--border-subtle)">
            <div className="bg-(--bg-surface-2) p-3.5 rounded-(--radius-control) border border-(--border-subtle)">
              <MonoLabel as="span" tone="accent" className="block mb-1">
                The Problem
              </MonoLabel>
              <BodyText size="xs" tone="secondary">
                {project.problem}
              </BodyText>
            </div>
            <div className="bg-(--bg-surface-2) p-3.5 rounded-(--radius-control) border border-(--border-subtle)">
              <MonoLabel as="span" tone="success" className="block mb-1">
                Engineered Solution
              </MonoLabel>
              <BodyText size="xs" tone="secondary">
                {project.solution}
              </BodyText>
            </div>
          </div>

          {/* Key Metric Highlight */}
          {project.metrics && (
            <div className="mt-4 flex items-center gap-2.5 p-3 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/30 text-xs text-(--text-primary) font-medium">
              <Sparkles className="w-4 h-4 text-(--text-accent) shrink-0" aria-hidden="true" />
              <span>{project.metrics}</span>
            </div>
          )}
        </div>

        {/* Footer: Tech Stack badges & Reusable Action Buttons */}
        <div className="pt-4 border-t border-(--border-subtle) flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {project.stack.map((tech) => (
              <TechBadge key={tech} label={tech} size="sm" />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
            <Button
              href={caseStudyHref}
              variant="secondary"
              size="sm"
              slideDirection="right"
              onClick={() =>
                trackEvent("project_click", `${project.title} (Case Study)`)
              }
              aria-label={`Read full case study for ${project.title}`}
            >
              <span>Case Study</span>
              <ArrowRight className="w-3.5 h-3.5 text-(--text-accent)" />
            </Button>

            {project.githubUrl && (
              <Button
                href={project.githubUrl}
                external
                variant="outline"
                size="icon"
                onClick={() =>
                  trackEvent("project_click", `${project.title} (GitHub)`)
                }
                aria-label={`View ${project.title} source code on GitHub`}
                title="View Source on GitHub"
              >
                <Github className="w-3.5 h-3.5" />
              </Button>
            )}
            {project.liveUrl && (
              <Button
                href={project.liveUrl}
                external
                variant="primary"
                size="sm"
                onClick={() =>
                  trackEvent("project_click", `${project.title} (Live Demo)`)
                }
                aria-label={`Visit live demo for ${project.title}`}
              >
                <span>Live Demo</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
