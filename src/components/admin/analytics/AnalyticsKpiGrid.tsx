"use client";

import type { PortfolioDatabase } from "@/types/portfolio";
import type { AnalyticsSnapshotSummary, PeriodDelta } from "@/lib/analytics";
import { InfoTooltip } from "@/components/ui/Tooltip";
import {
  AnimatedCounter,
  AnimatedSparkBars,
} from "@/components/motion/AdminMotion";
import {
  ArrowUpRight,
  Eye,
  Layers,
  Mail,
  MousePointerClick,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { AdminTab } from "@/components/admin/layout/types";

export interface AnalyticsKpiGridProps {
  db: PortfolioDatabase;
  summary: AnalyticsSnapshotSummary;
  onNavigateTab: (tab: AdminTab) => void;
}

function DeltaPill({
  delta,
  size = "sm",
}: {
  delta: PeriodDelta;
  size?: "sm" | "md";
}) {
  const pad =
    size === "md" ? "px-2 py-0.5 text-[10.5px]" : "px-1.5 py-0.5 text-[9.5px]";
  if (delta.direction === "up") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-emerald-500/12 border border-emerald-500/30 font-mono text-emerald-400 tabular-nums ${pad}`}
      >
        <TrendingUp className="w-2.5 h-2.5 shrink-0" />
        {delta.label}
      </span>
    );
  }
  if (delta.direction === "down") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-rose-500/12 border border-rose-500/30 font-mono text-rose-400 tabular-nums ${pad}`}
      >
        <TrendingDown className="w-2.5 h-2.5 shrink-0" />
        {delta.label}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full bg-(--bg-surface-2) border border-(--border-subtle) font-mono text-(--text-muted) tabular-nums ${pad}`}
    >
      {delta.label}
    </span>
  );
}

/**
 * Compact 1-Card Executive Metrics Matrix:
 * - Left Anchor (`md:col-span-6`): Prominent #1 Primary Hero Metric (`Unique Sessions` / `Page Views`).
 * - Right Stack (`md:col-span-6`): 3 Compact Stacked Companion Metrics (`Project Clicks`, `Inquiries & Goals`, `Published Inventory`).
 */
export function AnalyticsKpiGrid({
  db,
  summary,
  onNavigateTab,
}: AnalyticsKpiGridProps) {
  const { kpis, series, mode, rangeLabel, slicers } = summary;

  const sparkSlice = series.slice(-12);
  const sparkLabels = sparkSlice.map((b) => b.shortLabel);
  const viewsSpark = sparkSlice.map((b) => b.views);
  const clicksSpark = sparkSlice.map((b) => b.clicks + b.conversions);
  const inboxSpark = sparkSlice.map((b) => b.inquiries);

  const publishedProjects = db.projects.filter(
    (p) => p.published !== false
  ).length;
  const totalSkills = db.skills.reduce(
    (acc, cat) => acc + cat.skills.length,
    0
  );
  const skillCategoryCounts = db.skills.map((cat) => cat.skills.length);
  const skillCategoryLabels = db.skills.map(
    (cat) => `${cat.title} (Skills)`
  );

  return (
    <section
      data-cascade
      aria-label="Key Performance Metrics"
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) overflow-hidden shadow-lg h-full"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-px bg-(--border-subtle) h-full">
        {/* Left Anchor: Biggest Primary Metric (Traffic Sessions / Views) */}
        <div className="md:col-span-6 bg-(--bg-surface) p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono uppercase tracking-[0.16em] font-semibold text-(--text-primary) truncate">
                  {mode === "sessions" ? "Unique Sessions" : "Page Views"}
                </span>
                <InfoTooltip
                  label="Page view & session calculation"
                  content="Unique Sessions deduplicates reloads within the same browser tab using ephemeral sessionStorage (zero cookies). Switch Metric to Events for raw hits."
                />
              </div>
              <p className="text-[10.5px] font-mono text-(--text-muted) truncate mt-0.5">
                {rangeLabel}
                {slicers.isSliced ? " · Sliced View" : ""}
              </p>
            </div>

            <span className="w-8 h-8 rounded-full bg-(--bg-badge-highlight) border border-brand/35 flex items-center justify-center text-(--text-accent) shrink-0">
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </div>

          <div className="space-y-2.5 my-auto">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-display text-5xl sm:text-6xl xl:text-[4.25rem] text-(--text-primary) leading-none tracking-tight">
                <AnimatedCounter value={kpis.views.current} durationMs={850} />
              </span>
              <DeltaPill delta={kpis.views} size="md" />
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] font-mono text-(--text-muted)">
              <span>
                Goal{" "}
                <strong className="text-(--text-primary) tabular-nums">
                  {kpis.conversionRatePct.toFixed(1)}%
                </strong>
              </span>
              <span aria-hidden="true" className="text-(--border-strong)">
                ·
              </span>
              <span>
                CTR{" "}
                <strong className="text-(--text-primary) tabular-nums">
                  {kpis.projectCtrPct.toFixed(1)}%
                </strong>
              </span>
              <span aria-hidden="true" className="text-(--border-strong)">
                ·
              </span>
              <span>
                Reach{" "}
                <strong className="text-(--text-primary) tabular-nums">
                  {kpis.scrollCompletionPct.toFixed(0)}%
                </strong>
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-(--border-subtle)/60">
            <div className="flex items-center justify-between text-[9.5px] font-mono uppercase tracking-[0.14em] text-(--text-muted) mb-1.5">
              <span>Period Activity Curve</span>
              <span className="tabular-nums">
                {sparkSlice.length} intervals
              </span>
            </div>
            <AnimatedSparkBars
              values={viewsSpark}
              labels={sparkLabels}
              delayMs={0}
              staggerSec={0}
              className="h-10 w-full gap-1 [&>span]:flex-1"
            />
          </div>
        </div>

        {/* Right Stack: 3 Companion Metrics */}
        <div className="md:col-span-6 flex flex-col gap-px bg-(--border-subtle)">
          {/* Right Row 1: Project Engagement */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onNavigateTab("projects")}
            onKeyDown={(e) => {
              if (
                e.target !== e.currentTarget &&
                (e.target as HTMLElement).closest("button")
              ) {
                return;
              }
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onNavigateTab("projects");
              }
            }}
            className="flex-1 text-left bg-(--bg-surface) hover:bg-(--bg-surface-2)/75 px-4 py-3 flex flex-col justify-between gap-1.5 cursor-pointer transition-colors duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          >
            <div className="flex items-center justify-between gap-2 text-(--text-muted) w-full">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10.5px] font-mono uppercase tracking-[0.15em] truncate group-hover:text-(--text-primary) transition-colors">
                  Project Clicks
                </span>
                <InfoTooltip
                  label="Project clicks & CTR tracking"
                  content="Aggregates project card clicks, case-study modal opens, and live Demo/Repo link clicks. Tap this tile to open the Projects manager."
                />
              </div>
              <span className="inline-flex items-center gap-1 shrink-0">
                <MousePointerClick
                  className="w-3.5 h-3.5 text-(--text-accent)"
                  aria-hidden="true"
                />
                <ArrowUpRight
                  className="w-3.5 h-3.5 text-(--text-muted) opacity-75 group-hover:opacity-100 group-hover:text-(--text-accent) group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                  aria-hidden="true"
                />
              </span>
            </div>

            <div className="flex items-end justify-between gap-3 w-full">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display text-2xl sm:text-3xl text-(--text-primary) leading-none">
                    <AnimatedCounter
                      value={kpis.projectClicks.current}
                      durationMs={900}
                    />
                  </span>
                  <DeltaPill delta={kpis.projectClicks} />
                </div>
                <span className="text-[10.5px] text-(--text-muted) block mt-1 truncate">
                  CTR {kpis.projectCtrPct.toFixed(1)}% ·{" "}
                  {kpis.cvDownloads + kpis.directContacts} goal actions
                </span>
              </div>

              <AnimatedSparkBars
                values={clicksSpark}
                labels={sparkLabels}
                delayMs={0}
                staggerSec={0}
                className="h-7"
              />
            </div>
          </div>

          {/* Right Row 2: Inquiries & Conversions */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onNavigateTab("inbox")}
            onKeyDown={(e) => {
              if (
                e.target !== e.currentTarget &&
                (e.target as HTMLElement).closest("button")
              ) {
                return;
              }
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onNavigateTab("inbox");
              }
            }}
            className="flex-1 text-left bg-(--bg-surface) hover:bg-(--bg-surface-2)/75 px-4 py-3 flex flex-col justify-between gap-1.5 cursor-pointer transition-colors duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          >
            <div className="flex items-center justify-between gap-2 text-(--text-muted) w-full">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10.5px] font-mono uppercase tracking-[0.15em] truncate group-hover:text-(--text-primary) transition-colors">
                  Inquiries &amp; Goals
                </span>
                <InfoTooltip
                  label="Inquiries & conversion goals"
                  content="Tracks submitted contact messages alongside CV viewer opens and direct mailto clicks. Tap this tile to open the Inbox."
                />
              </div>
              <span className="inline-flex items-center gap-1 shrink-0">
                <Mail
                  className="w-3.5 h-3.5 text-(--text-accent)"
                  aria-hidden="true"
                />
                <ArrowUpRight
                  className="w-3.5 h-3.5 text-(--text-muted) opacity-75 group-hover:opacity-100 group-hover:text-(--text-accent) group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                  aria-hidden="true"
                />
              </span>
            </div>

            <div className="flex items-end justify-between gap-3 w-full">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap leading-none">
                  <span className="font-display text-2xl sm:text-3xl text-(--text-primary)">
                    <AnimatedCounter
                      value={kpis.inquiries.current}
                      durationMs={950}
                    />
                  </span>
                  {kpis.unreadInbox > 0 ? (
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] font-semibold text-(--text-accent)">
                      {kpis.unreadInbox} unread
                    </span>
                  ) : (
                    <DeltaPill delta={kpis.inquiries} />
                  )}
                </div>
                <span className="text-[10.5px] text-(--text-muted) block mt-1 truncate">
                  CV: {kpis.cvDownloads} · Contact: {kpis.directContacts} (
                  {kpis.conversionRatePct.toFixed(1)}% rate)
                </span>
              </div>

              <AnimatedSparkBars
                values={inboxSpark}
                labels={sparkLabels}
                delayMs={0}
                staggerSec={0}
                className="h-7"
              />
            </div>
          </div>

          {/* Right Row 3: Published Inventory */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onNavigateTab("skills")}
            onKeyDown={(e) => {
              if (
                e.target !== e.currentTarget &&
                (e.target as HTMLElement).closest("button")
              ) {
                return;
              }
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onNavigateTab("skills");
              }
            }}
            className="flex-1 text-left bg-(--bg-surface) hover:bg-(--bg-surface-2)/75 px-4 py-3 flex flex-col justify-between gap-1.5 cursor-pointer transition-colors duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          >
            <div className="flex items-center justify-between gap-2 text-(--text-muted) w-full">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10.5px] font-mono uppercase tracking-[0.15em] truncate group-hover:text-(--text-primary) transition-colors">
                  Published Inventory
                </span>
                <InfoTooltip
                  label="Skill distribution sparkline"
                  content="Sparkline bars show exact skill density across each configured system layer (Database, Backend, Frontend, Analytics) proportionally."
                />
              </div>
              <span className="inline-flex items-center gap-1 shrink-0">
                <Layers
                  className="w-3.5 h-3.5 text-(--text-accent)"
                  aria-hidden="true"
                />
                <ArrowUpRight
                  className="w-3.5 h-3.5 text-(--text-muted) opacity-75 group-hover:opacity-100 group-hover:text-(--text-accent) group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                  aria-hidden="true"
                />
              </span>
            </div>

            <div className="flex items-end justify-between gap-3 w-full">
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-2xl sm:text-3xl text-(--text-primary) leading-none">
                    <AnimatedCounter value={totalSkills} durationMs={1000} />
                  </span>
                  <span className="text-[11px] font-mono text-(--text-accent)">
                    Skills
                  </span>
                </div>
                <span className="text-[10.5px] text-(--text-muted) block mt-1 truncate">
                  {publishedProjects} Live Systems ({db.projects.length} total) ·{" "}
                  {db.skills.length} Layers
                </span>
              </div>

              <AnimatedSparkBars
                values={skillCategoryCounts}
                labels={skillCategoryLabels}
                delayMs={0}
                staggerSec={0}
                className="h-7"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
