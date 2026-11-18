"use client";

import type { AnalyticsSnapshotSummary } from "@/lib/analytics";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { AnimatedBar, AnimatedCounter } from "@/components/motion/AdminMotion";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConversionFunnelCardProps {
  summary: AnalyticsSnapshotSummary;
}

/**
 * True-to-scale Portfolio Reading & Conversion Funnel strictly anchored
 * to Entry Views (`page_view` = 100%) without visual floor clamping.
 */
export function ConversionFunnelCard({ summary }: ConversionFunnelCardProps) {
  const { funnel, kpis, mode } = summary;

  return (
    <div className="h-full bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 flex flex-col justify-between gap-5">
      <div>
        <SectionHeader
          eyebrow="Business Analytics · True Funnel"
          title="Chapter Reach & Conversion Funnel"
          size="sm"
          className="mb-4"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="True funnel conversion logic"
                content="Anchors every chapter milestone against entry traffic inside the active filter window so you can spot drop-off between Story, Stack, Projects, and Contact goals."
              />
              <BarChart3 className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        {/* North-Star Conversion Rates */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 mb-5">
          <div className="p-2 sm:p-2.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) min-w-0">
            <span className="text-[0.5625rem] sm:text-[0.625rem] font-mono uppercase tracking-[0.08em] sm:tracking-[0.14em] text-(--text-muted) block leading-tight">
              Scroll Completion
            </span>
            <span className="font-mono text-sm sm:text-base font-semibold text-(--text-primary) tabular-nums">
              {kpis.scrollCompletionPct.toFixed(1)}%
            </span>
          </div>
          <div className="p-2 sm:p-2.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) min-w-0">
            <span className="text-[0.5625rem] sm:text-[0.625rem] font-mono uppercase tracking-[0.08em] sm:tracking-[0.14em] text-(--text-muted) block leading-tight">
              Project CTR
            </span>
            <span className="font-mono text-sm sm:text-base font-semibold text-(--text-primary) tabular-nums">
              {kpis.projectCtrPct.toFixed(1)}%
            </span>
          </div>
          <div className="p-2 sm:p-2.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) min-w-0">
            <span className="text-[0.5625rem] sm:text-[0.625rem] font-mono uppercase tracking-[0.08em] sm:tracking-[0.14em] text-(--text-muted) block leading-tight">
              Lead Conv Rate
            </span>
            <span className="font-mono text-sm sm:text-base font-semibold text-(--text-accent) tabular-nums">
              {kpis.conversionRatePct.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* True-to-Scale Bars (Synchronized Load Animation) */}
        <ScrollArea maxHeight={290} viewportClassName="space-y-3.5 pr-1">
          {funnel.map((step) => (
            <div key={step.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono text-(--text-primary) truncate">
                    CH // {step.chapterCode} · {step.label}
                  </span>
                  {step.note && (
                    <InfoTooltip label={step.label} content={step.note} />
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                  {step.prevStepDeltaPct !== null && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-sm border",
                        step.prevStepDeltaPct > 0
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : step.prevStepDeltaPct < 0
                            ? "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-muted)"
                            : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-muted)"
                      )}
                    >
                      {step.prevStepDeltaPct > 0 ? "+" : ""}
                      {step.prevStepDeltaPct.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-(--text-primary) font-semibold">
                    <AnimatedCounter value={step.count} durationMs={750} />
                  </span>
                  <span className="text-[11px] text-(--text-muted) w-11 text-right">
                    {step.pctOfEntry.toFixed(1)}%
                  </span>
                </div>
              </div>

              <AnimatedBar
                percentage={step.pctOfEntry}
                delayMs={0}
                barClassName={
                  step.id === "goal"
                    ? "bg-linear-to-r from-emerald-500 to-emerald-400"
                    : undefined
                }
              />
            </div>
          ))}
        </ScrollArea>
      </div>

      <p className="text-[11px] font-mono text-(--text-muted) border-t border-(--border-subtle) pt-3">
        Bars scale linearly relative to CH // 00 Entry Views (
        {mode === "sessions" ? "unique sessions" : "total hits"}). Step pills
        reflect transition change from the previous chapter.
      </p>
    </div>
  );
}
