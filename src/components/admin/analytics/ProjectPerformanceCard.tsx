"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { AnalyticsSnapshotSummary } from "@/lib/analytics";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { StatusPill } from "@/components/ui/StatusPill";
import { InfoTooltip, TruncatedText } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { AnimatedCounter } from "@/components/motion/AdminMotion";
import { shouldReduceMotion } from "@/lib/appearance";
import { FolderGit2 } from "lucide-react";

export interface ProjectPerformanceCardProps {
  summary: AnalyticsSnapshotSummary;
  onManageProjects: () => void;
}

/**
 * Grouped Project Click Leaderboard reconciling 100% of `project_click` events
 * into Live Demo vs GitHub shares while surfacing 0-click published systems.
 */
export function ProjectPerformanceCard({
  summary,
  onManageProjects,
}: ProjectPerformanceCardProps) {
  const { projects, kpis } = summary;
  const zeroClickCount = projects.filter(
    (p) => p.published && p.totalClicks === 0
  ).length;
  const listRef = useRef<HTMLDivElement>(null);
  const hasPlayedLoadRef = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el || shouldReduceMotion() || hasPlayedLoadRef.current) return;
    hasPlayedLoadRef.current = true;

    const ctx = gsap.context(() => {
      const tracks = el.querySelectorAll<HTMLElement>("[data-proj-track]");
      if (tracks.length === 0) return;

      gsap.fromTo(
        tracks,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.6,
          stagger: 0,
          ease: "power3.out",
          force3D: true,
          clearProps: "transform",
        }
      );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <div className="h-full bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 flex flex-col justify-between gap-4">
      <div>
        <SectionHeader
          eyebrow="Conversion Leaderboard · Grouped"
          title="Project Interactions"
          size="sm"
          className="mb-3"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Project engagement & attribution"
                content="Ranks published systems by total card interactions, modal case-study opens, external Demo/Repo clicks, and view-to-click CTR inside the active window."
              />
              <FolderGit2 className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        {/* Segmented Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-(--border-subtle) text-[10px] font-mono uppercase tracking-wider text-(--text-muted)">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-brand" />
              Live Demo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-sky-400" />
              GitHub Repo
            </span>
          </div>
          {zeroClickCount > 0 && (
            <span className="text-amber-400">
              {zeroClickCount} published w/ 0 clicks
            </span>
          )}
        </div>

        {projects.length === 0 ? (
          <p className="text-xs text-(--text-muted) py-6">
            No published projects configured yet. Add projects in the Projects module to track performance.
          </p>
        ) : (
          <ScrollArea maxHeight={290} viewportClassName="space-y-3.5 pr-1">
            <div ref={listRef} className="space-y-3.5">
              {projects.map((proj) => {
                const demoPctOfRow =
                  proj.totalClicks > 0
                    ? (proj.liveDemoClicks / proj.totalClicks) * 100
                    : 0;
                const githubPctOfRow =
                  proj.totalClicks > 0
                    ? (proj.githubClicks / proj.totalClicks) * 100
                    : 0;
                const otherPctOfRow = Math.max(
                  0,
                  100 - demoPctOfRow - githubPctOfRow
                );

                return (
                  <div key={proj.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TruncatedText
                          text={proj.title}
                          className="text-(--text-primary) font-medium min-w-0"
                        />
                        {!proj.published && (
                          <StatusPill
                            label="Archived"
                            variant="neutral"
                            size="xs"
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                        <span className="text-[10px] text-(--text-muted)">
                          {proj.liveDemoClicks}d · {proj.githubClicks}g
                        </span>
                        <span
                          className={
                            proj.totalClicks > 0
                              ? "text-(--text-accent) font-semibold"
                              : "text-(--text-muted)"
                          }
                        >
                          <AnimatedCounter
                            value={proj.totalClicks}
                            durationMs={750}
                          />
                        </span>
                        {kpis.projectClicks.current > 0 && (
                          <span className="text-[10px] text-(--text-muted) w-10 text-right">
                            {proj.sharePct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Proportional Segmented Track (GPU Animated, Zero Clamping) */}
                    <div className="w-full h-2 bg-(--bg-surface-2) rounded-full overflow-hidden">
                      {proj.totalClicks > 0 && (
                        <div
                          data-proj-track
                          style={{
                            width: `${proj.barPct}%`,
                            transformOrigin: "left center",
                          }}
                          className="h-full flex rounded-full overflow-hidden will-change-transform"
                        >
                          {demoPctOfRow > 0 && (
                            <div
                              style={{ width: `${demoPctOfRow}%` }}
                              className="h-full bg-brand"
                              title={`Live Demo: ${proj.liveDemoClicks}`}
                            />
                          )}
                          {githubPctOfRow > 0 && (
                            <div
                              style={{ width: `${githubPctOfRow}%` }}
                              className="h-full bg-sky-400"
                              title={`GitHub: ${proj.githubClicks}`}
                            />
                          )}
                          {otherPctOfRow > 0.1 && (
                            <div
                              style={{ width: `${otherPctOfRow}%` }}
                              className="h-full bg-amber-400"
                              title={`Other: ${proj.otherClicks}`}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      <div className="pt-3 border-t border-(--border-subtle) flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-(--text-muted)">
          Reconciled clicks: {kpis.projectClicks.current} total
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onManageProjects}
          className="h-7 px-2.5 text-[11px] font-mono text-(--text-accent)"
        >
          Edit Projects →
        </Button>
      </div>
    </div>
  );
}
