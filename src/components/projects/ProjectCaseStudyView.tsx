"use client";

import { usePortfolio } from "@/context/PortfolioContext";
import { StarfieldCanvas } from "@/components/motion/StarfieldCanvas";
import { LiquidImage } from "@/components/motion/LiquidImage";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  BodyText,
  DisplayHeading,
  Eyebrow,
  MonoLabel,
  TechBadge,
} from "@/components/ui/Typography";
import type { Project } from "@/types/portfolio";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Github,
  Sparkles,
  Star,
} from "lucide-react";

export interface ProjectCaseStudyViewProps {
  project: Project;
  prevProject: Project | null;
  nextProject: Project | null;
}

export function ProjectCaseStudyView({
  project,
  prevProject,
  nextProject,
}: ProjectCaseStudyViewProps) {
  const { trackEvent } = usePortfolio();

  return (
    <main className="lou-public-root relative min-h-screen w-full text-(--text-primary) overflow-x-clip">
      <StarfieldCanvas />
      <div className="relative z-10 min-h-screen w-full bg-(--bg-canvas)/74 pt-24 sm:pt-32 pb-20 sm:pb-28 px-(--gutter)">
        <article className="max-w-5xl mx-auto w-full space-y-8 sm:space-y-12">
        {/* Back Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button
            href="/#projects"
            variant="outline"
            size="sm"
            slideDirection="left"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-(--text-accent)" />
            <span>Back to Selected Systems</span>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {project.featured && (
              <StatusPill
                label="Featured System"
                variant="accent"
                size="sm"
                icon={
                  <Star
                    className="w-3 h-3 fill-current"
                    aria-hidden="true"
                  />
                }
              />
            )}
            <MonoLabel tone="muted">{project.year}</MonoLabel>
          </div>
        </div>

        {/* Title & Summary */}
        <header className="space-y-5">
          <Eyebrow withDot>{project.category}</Eyebrow>
          <DisplayHeading as="h1" size="xl">
            {project.title}
          </DisplayHeading>
          <BodyText size="md" tone="secondary" className="max-w-3xl">
            {project.description}
          </BodyText>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            {project.liveUrl && (
              <Button
                href={project.liveUrl}
                external
                variant="primary"
                size="md"
                onClick={() =>
                  trackEvent("project_click", `${project.title} (Live Demo)`)
                }
              >
                <span>Launch Live System</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            )}
            {project.githubUrl && (
              <Button
                href={project.githubUrl}
                external
                variant="outline"
                size="md"
                onClick={() =>
                  trackEvent("project_click", `${project.title} (GitHub)`)
                }
              >
                <Github className="w-4 h-4" />
                <span>View Repository</span>
              </Button>
            )}
          </div>
        </header>

        {/* Key Role / Outcome / Metrics Ribbon */}
        <section
          aria-label="System Metadata"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <div className="p-4 sm:p-5 rounded-(--radius-card) bg-(--bg-surface) border border-(--border-subtle)">
            <MonoLabel as="span" tone="muted" className="block mb-1.5">
              Ownership Role
            </MonoLabel>
            <p className="text-sm font-semibold text-(--text-primary)">
              {project.role}
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-(--radius-card) bg-(--bg-surface) border border-(--border-subtle)">
            <MonoLabel as="span" tone="success" className="block mb-1.5">
              Delivered Outcome
            </MonoLabel>
            <p className="text-sm font-semibold text-(--text-primary) flex items-start gap-2">
              <CheckCircle2
                className="w-4 h-4 text-(--text-success) shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{project.outcome || "Production Deployed"}</span>
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-(--radius-card) bg-(--bg-badge-highlight) border border-brand/30">
            <MonoLabel as="span" tone="accent" className="block mb-1.5">
              Key Impact Metric
            </MonoLabel>
            <p className="text-sm font-semibold text-(--text-primary) flex items-start gap-2">
              <Sparkles
                className="w-4 h-4 text-(--text-accent) shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{project.metrics || "End-to-End Architecture"}</span>
            </p>
          </div>
        </section>

        {/* Hero Case Study Visual */}
        <LiquidImage
          src={project.image}
          alt={`${project.title} showcase preview`}
          placeholderText={project.title}
          aspectRatio="aspect-16/9"
        />

        {/* Problem & Solution Architectural Deep Dive */}
        <section
          aria-label="Technical Case Study"
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          <div className="p-6 sm:p-8 rounded-(--radius-card) bg-(--bg-surface) border border-(--border-subtle) space-y-3">
            <MonoLabel as="span" tone="accent" className="block">
              01 // The Problem
            </MonoLabel>
            <DisplayHeading as="h2" size="sm">
              Core Engineering Challenge
            </DisplayHeading>
            <BodyText size="sm" tone="secondary">
              {project.problem}
            </BodyText>
          </div>

          <div className="p-6 sm:p-8 rounded-(--radius-card) bg-(--bg-surface) border border-(--border-subtle) space-y-3">
            <MonoLabel as="span" tone="success" className="block">
              02 // Engineered Solution
            </MonoLabel>
            <DisplayHeading as="h2" size="sm">
              Architecture &amp; Execution
            </DisplayHeading>
            <BodyText size="sm" tone="secondary">
              {project.solution}
            </BodyText>
          </div>
        </section>

        {/* Technology Stack */}
        <section
          aria-label="Technology Stack"
          className="p-5 sm:p-8 rounded-(--radius-card) bg-(--bg-surface) border border-(--border-subtle) space-y-4 w-full"
        >
          <MonoLabel as="span" tone="muted" className="block">
            03 // Production Tech Stack
          </MonoLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 w-full">
            {project.stack.map((tech) => (
              <TechBadge
                key={tech}
                label={tech}
                size="md"
                className="w-full justify-center text-center"
              />
            ))}
          </div>
        </section>

        {/* Previous / Next Navigation */}
        {(prevProject || nextProject) && (
          <nav
            aria-label="Other Case Studies"
            className="pt-8 border-t border-(--border-subtle) grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div>
              {prevProject && (
                <Button
                  href={`/projects/${encodeURIComponent(prevProject.id)}`}
                  variant="outline"
                  size="lg"
                  fullWidth
                  slideDirection="left"
                  className="justify-start normal-case tracking-normal h-auto py-4 px-5 text-left"
                >
                  <ArrowLeft className="w-4 h-4 text-(--text-accent) shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
                      Previous Case Study
                    </span>
                    <span className="block font-display text-lg uppercase text-(--text-primary) truncate">
                      {prevProject.title}
                    </span>
                  </span>
                </Button>
              )}
            </div>

            <div>
              {nextProject && (
                <Button
                  href={`/projects/${encodeURIComponent(nextProject.id)}`}
                  variant="outline"
                  size="lg"
                  fullWidth
                  slideDirection="right"
                  className="justify-end normal-case tracking-normal h-auto py-4 px-5 text-right"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
                      Next Case Study
                    </span>
                    <span className="block font-display text-lg uppercase text-(--text-primary) truncate">
                      {nextProject.title}
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-(--text-accent) shrink-0" />
                </Button>
              )}
            </div>
          </nav>
        )}
      </article>
      </div>
    </main>
  );
}
