"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { AnalyticsSnapshotSummary } from "@/lib/analytics";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { AnimatedBar, AnimatedCounter } from "@/components/motion/AdminMotion";
import { shouldReduceMotion } from "@/lib/appearance";
import { Globe, MonitorSmartphone, Target } from "lucide-react";

export interface AudienceAttributionCardProps {
  summary: AnalyticsSnapshotSummary;
}

const DEVICE_COLORS: Record<string, string> = {
  desktop: "var(--accent)",
  mobile: "#38bdf8",
  tablet: "#34d399",
};

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Geometric SVG Device Donut & Conversion Channels / Traffic Source Attribution.
 * Transparently separates attributed records from legacy events with no metadata.
 */
export function AudienceAttributionCard({
  summary,
}: AudienceAttributionCardProps) {
  const { devices, referrers, conversionChannels } = summary;
  const donutRef = useRef<SVGSVGElement>(null);
  const hasPlayedLoadRef = useRef(false);

  // Build exact geometric SVG arcs without synthetic smoothing
  const segments = devices.slices.reduce<
    Array<{
      key: string;
      label: string;
      count: number;
      pct: number;
      dash: number;
      offset: number;
    }>
  >((acc, slice) => {
    const prevOffset =
      acc.length > 0
        ? acc[acc.length - 1].offset + acc[acc.length - 1].dash
        : 0;
    const dash =
      devices.attributedCount > 0
        ? (slice.count / devices.attributedCount) * CIRCUMFERENCE
        : 0;
    acc.push({
      ...slice,
      dash,
      offset: prevOffset,
    });
    return acc;
  }, []);

  useEffect(() => {
    const svg = donutRef.current;
    if (!svg || shouldReduceMotion() || hasPlayedLoadRef.current) return;
    hasPlayedLoadRef.current = true;

    const ctx = gsap.context(() => {
      const arcs = svg.querySelectorAll<SVGCircleElement>("[data-donut-seg]");
      if (arcs.length === 0) return;

      gsap.fromTo(
        svg,
        { opacity: 0.25, scale: 0.94, transformOrigin: "center" },
        {
          opacity: 1,
          scale: 1,
          duration: 0.55,
          ease: "power3.out",
          clearProps: "scale,opacity",
        }
      );

      arcs.forEach((arc) => {
        const targetDash = arc.getAttribute("data-dash") || "";
        if (!targetDash) return;
        gsap.fromTo(
          arc,
          { strokeDasharray: `0 ${CIRCUMFERENCE.toFixed(2)}` },
          {
            strokeDasharray: targetDash,
            duration: 0.6,
            ease: "power3.out",
          }
        );
      });
    }, svg);

    return () => ctx.revert();
  }, []);

  const totalGoalClicks = conversionChannels.reduce(
    (sum, c) => sum + c.count,
    0
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Device Viewport Donut */}
      <div className="lg:col-span-5 bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 flex flex-col justify-between gap-5">
        <div>
          <SectionHeader
            eyebrow="Viewport Telemetry"
            title="Device Class Split"
            size="sm"
            className="mb-4"
            rightSlot={
              <div className="flex items-center gap-2">
                <InfoTooltip
                  label="Device class classification"
                  content="Classifies active sessions into Desktop, Tablet, or Mobile using viewport dimensions recorded with each telemetry event."
                />
                <MonitorSmartphone className="w-5 h-5 text-(--text-accent)" />
              </div>
            }
          />

          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Exact Geometric SVG Ring */}
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg
                ref={donutRef}
                viewBox="0 0 96 96"
                className="w-full h-full -rotate-90"
                role="img"
                aria-label="Device category percentage ring"
              >
                <circle
                  cx="48"
                  cy="48"
                  r={RADIUS}
                  fill="none"
                  stroke="var(--bg-surface-2)"
                  strokeWidth="10"
                />
                {segments.map((seg) =>
                  seg.dash > 0 ? (
                    <circle
                      key={seg.key}
                      data-donut-seg
                      data-dash={`${seg.dash.toFixed(2)} ${(
                        CIRCUMFERENCE - seg.dash
                      ).toFixed(2)}`}
                      cx="48"
                      cy="48"
                      r={RADIUS}
                      fill="none"
                      stroke={DEVICE_COLORS[seg.key] || "var(--accent)"}
                      strokeWidth="10"
                      strokeDasharray={`${seg.dash.toFixed(2)} ${(
                        CIRCUMFERENCE - seg.dash
                      ).toFixed(2)}`}
                      strokeDashoffset={(-seg.offset).toFixed(2)}
                    />
                  ) : null
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="font-mono text-base font-bold text-(--text-primary) tabular-nums leading-none">
                  <AnimatedCounter
                    value={devices.attributedCount}
                    durationMs={850}
                  />
                </span>
                <span className="text-[9px] font-mono uppercase tracking-wider text-(--text-muted) mt-1">
                  Attributed
                </span>
              </div>
            </div>

            {/* Device Legend */}
            <div className="flex-1 w-full space-y-2.5">
              {devices.slices.map((slice) => (
                <div
                  key={slice.key}
                  className="flex items-center justify-between gap-2 text-xs font-mono"
                >
                  <span className="inline-flex items-center gap-2 text-(--text-secondary)">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{
                        backgroundColor:
                          DEVICE_COLORS[slice.key] || "var(--accent)",
                      }}
                    />
                    <span>{slice.label}</span>
                  </span>
                  <span className="tabular-nums text-(--text-primary) font-semibold">
                    {slice.count}{" "}
                    <span className="text-(--text-muted) font-normal">
                      ({slice.pct.toFixed(1)}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-(--border-subtle) flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-(--text-muted)">
          <span>
            {devices.attributedCount > 0
              ? `Measured across ${devices.attributedCount} attributed hits`
              : "Awaiting attributed client telemetry"}
          </span>
          {devices.unattributedCount > 0 && (
            <span className="text-[10px] font-mono text-(--text-muted)">
              {devices.unattributedCount} legacy pre-v2
            </span>
          )}
        </div>
      </div>

      {/* Right: Conversion Channels & Top Referrers */}
      <div className="lg:col-span-7 bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Conversion Action Breakdown */}
        <div className="space-y-4">
          <SectionHeader
            eyebrow="Conversion Channels"
            title="Goal Action Mix"
            size="sm"
            rightSlot={
              <div className="flex items-center gap-2">
                <InfoTooltip
                  label="Conversion action attribution"
                  content="Breaks down high-intent visitor actions across Resume/CV viewer opens, submitted contact forms, and direct mailto clicks."
                />
                <Target className="w-4 h-4 text-(--text-accent)" />
              </div>
            }
          />

          <div className="space-y-3">
            {conversionChannels.map((ch) => (
              <div key={ch.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-(--text-secondary) truncate pr-2">
                    {ch.label}
                  </span>
                  <span className="font-mono tabular-nums text-(--text-primary) font-semibold shrink-0">
                    {ch.count}{" "}
                    <span className="text-(--text-muted) font-normal text-[10px]">
                      ({ch.pct.toFixed(0)}%)
                    </span>
                  </span>
                </div>
                <AnimatedBar
                  percentage={ch.pct}
                  delayMs={0}
                  heightClassName="h-1.5"
                />
              </div>
            ))}
          </div>

          <p className="text-[10px] font-mono text-(--text-muted)">
            {totalGoalClicks} total direct CTA / resume conversions in window.
          </p>
        </div>

        {/* Acquisition Referrer Hosts */}
        <div className="space-y-4 md:border-l md:border-(--border-subtle) md:pl-6">
          <SectionHeader
            eyebrow="Acquisition Sources"
            title="Top Referrers"
            size="sm"
            rightSlot={
              <div className="flex items-center gap-2">
                <InfoTooltip
                  label="Referral source parsing"
                  content="Groups incoming traffic by parsed document referrer hostname, or marks visits as Direct when no upstream referrer host was provided."
                />
                <Globe className="w-4 h-4 text-(--text-accent)" />
              </div>
            }
          />

          {referrers.length === 0 ? (
            <div className="p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) text-xs text-(--text-muted) leading-relaxed">
              No referrer host headers recorded yet inside this window. Incoming
              visits with referral data appear automatically as visitors browse.
            </div>
          ) : (
            <div className="space-y-3">
              {referrers.map((ref) => (
                <div key={ref.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-(--text-primary) truncate pr-2">
                      {ref.label}
                    </span>
                    <span className="font-mono tabular-nums text-(--text-secondary) shrink-0">
                      {ref.count}{" "}
                      <span className="text-(--text-muted) text-[10px]">
                        ({ref.pct.toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <AnimatedBar
                    percentage={ref.pct}
                    delayMs={0}
                    heightClassName="h-1.5"
                    barClassName="bg-linear-to-r from-sky-500 to-sky-400"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
