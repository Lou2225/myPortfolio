"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { TimeSeriesBucket } from "@/lib/analytics";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { shouldReduceMotion } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { Activity, BarChart2 } from "lucide-react";

export interface TrafficTrendChartProps {
  series: readonly TimeSeriesBucket[];
  rangeLabel: string;
  countMode: "sessions" | "events";
}

type ChartRenderMode = "line" | "bars";

const CHART_MODE_TABS: readonly TabItem<ChartRenderMode>[] = [
  {
    id: "line",
    label: "Line",
    icon: <Activity className="w-3 h-3" aria-hidden="true" />,
    ariaLabel: "Line chart view",
  },
  {
    id: "bars",
    label: "Bars",
    icon: <BarChart2 className="w-3 h-3" aria-hidden="true" />,
    ariaLabel: "Bar chart view",
  },
];

const SVG_H = 236;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 20;
const PAD_B = 26;
const PLOT_H = SVG_H - PAD_T - PAD_B;

function computeNiceYMax(peak: number): number {
  if (peak <= 0) return 4;
  if (peak <= 4) return 4;
  if (peak <= 10) return Math.ceil(peak / 2) * 2;
  const magnitude = Math.pow(10, Math.floor(Math.log10(peak)));
  const fraction = peak / magnitude;
  if (fraction <= 1.5) return Math.ceil(1.5 * magnitude);
  if (fraction <= 2) return 2 * magnitude;
  if (fraction <= 3) return 3 * magnitude;
  if (fraction <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * Full-width edge-to-edge interactive chronological SVG chart strictly scaled
 * linearly from `0..yMax`. Syncs viewBox width 1:1 via ResizeObserver with
 * clamped hit-targets (zero edge overflow) and a single crisp load animation.
 */
export function TrafficTrendChart({
  series,
  rangeLabel,
  countMode,
}: TrafficTrendChartProps) {
  const [chartType, setChartType] = useState<ChartRenderMode>("line");
  const [showViews, setShowViews] = useState(true);
  const [showClicks, setShowClicks] = useState(true);
  const [showConversions, setShowConversions] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(960);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const hasPlayedLoadRef = useRef(false);
  const prevChartTypeRef = useRef<ChartRenderMode>(chartType);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = Math.round(el.clientWidth);
      if (next >= 240) {
        setContainerWidth((prev) => (prev === next ? prev : next));
      }
    };

    updateWidth();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const svgW = containerWidth;
  const plotW = Math.max(svgW - PAD_L - PAD_R, 120);

  const metrics = useMemo(() => {
    let peak = 0;
    for (const bucket of series) {
      if (showViews && bucket.views > peak) peak = bucket.views;
      if (showClicks && bucket.clicks > peak) peak = bucket.clicks;
      const convTotal = bucket.conversions + bucket.inquiries;
      if (showConversions && convTotal > peak) peak = convTotal;
    }
    const yMax = computeNiceYMax(peak);
    const yTicks = [0, Math.round(yMax / 2), yMax];

    const colW = plotW / Math.max(series.length, 1);

    const points = series.map((b, i) => {
      const denom = Math.max(series.length - 1, 1);
      const x =
        series.length === 1
          ? PAD_L + plotW / 2
          : chartType === "bars"
            ? PAD_L + (i + 0.5) * colW
            : PAD_L + (i / denom) * plotW;

      const yViews = PAD_T + PLOT_H - (b.views / yMax) * PLOT_H;
      const yClicks = PAD_T + PLOT_H - (b.clicks / yMax) * PLOT_H;
      const convTotal = b.conversions + b.inquiries;
      const yConv = PAD_T + PLOT_H - (convTotal / yMax) * PLOT_H;
      return {
        bucket: b,
        convTotal,
        x,
        yViews,
        yClicks,
        yConv,
      };
    });

    const buildLinePath = (coords: Array<{ x: number; y: number }>) =>
      coords
        .map(
          (pt, idx) =>
            `${idx === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
        )
        .join(" ");

    const viewsPath = buildLinePath(
      points.map((p) => ({ x: p.x, y: p.yViews }))
    );
    const clicksPath = buildLinePath(
      points.map((p) => ({ x: p.x, y: p.yClicks }))
    );
    const convPath = buildLinePath(
      points.map((p) => ({ x: p.x, y: p.yConv }))
    );

    const baselineY = PAD_T + PLOT_H;
    const viewsAreaPath =
      points.length > 0
        ? `${viewsPath} L ${points[points.length - 1].x.toFixed(1)} ${baselineY} L ${points[0].x.toFixed(1)} ${baselineY} Z`
        : "";

    return {
      peak,
      yMax,
      yTicks,
      colW,
      points,
      viewsPath,
      viewsAreaPath,
      clicksPath,
      convPath,
      baselineY,
    };
  }, [series, plotW, chartType, showViews, showClicks, showConversions]);

  // One-shot synchronized load animation (plus crisp reveal on chartType switch), zero cascade stagger
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || shouldReduceMotion()) return;

    const isInitialLoad = !hasPlayedLoadRef.current;
    const modeChanged = prevChartTypeRef.current !== chartType;
    prevChartTypeRef.current = chartType;

    if (!isInitialLoad && !modeChanged) return;
    hasPlayedLoadRef.current = true;

    const ctx = gsap.context(() => {
      if (chartType === "line") {
        const lines = svg.querySelectorAll<SVGPathElement>("[data-chart-line]");
        lines.forEach((path) => {
          const totalLen =
            typeof path.getTotalLength === "function"
              ? path.getTotalLength()
              : 0;
          if (totalLen > 0) {
            gsap.set(path, {
              strokeDasharray: totalLen,
              strokeDashoffset: totalLen,
            });
            gsap.to(path, {
              strokeDashoffset: 0,
              duration: 0.62,
              ease: "power3.out",
              clearProps: "strokeDasharray,strokeDashoffset",
            });
          }
        });

        const area = svg.querySelectorAll<SVGPathElement>("[data-chart-area]");
        if (area.length > 0) {
          gsap.fromTo(
            area,
            { opacity: 0 },
            { opacity: 1, duration: 0.55, ease: "power2.out" }
          );
        }

        const dots = svg.querySelectorAll<SVGCircleElement>("[data-chart-dot]");
        if (dots.length > 0) {
          gsap.fromTo(
            dots,
            { opacity: 0 },
            {
              opacity: 1,
              duration: 0.45,
              ease: "power2.out",
              clearProps: "opacity",
            }
          );
        }
      } else {
        const bars = svg.querySelectorAll<SVGRectElement>("[data-chart-bar]");
        if (bars.length > 0) {
          gsap.fromTo(
            bars,
            {
              scaleY: 0,
              opacity: 0.35,
              transformBox: "fill-box",
              transformOrigin: "bottom center",
            },
            {
              scaleY: 1,
              opacity: 1,
              duration: 0.5,
              ease: "power3.out",
              clearProps: "transform,opacity",
            }
          );
        }
      }
    }, svg);

    return () => ctx.revert();
  }, [chartType]);

  const highlightedIdx = hoveredIdx ?? focusedIdx;
  const activeIdx =
    highlightedIdx !== null &&
    highlightedIdx >= 0 &&
    highlightedIdx < series.length
      ? highlightedIdx
      : series.length > 0
        ? series.length - 1
        : null;
  const activePoint = activeIdx !== null ? metrics.points[activeIdx] : null;

  const labelStride =
    series.length > 18 ? 5 : series.length > 10 ? 2 : 1;

  return (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SectionHeader
          eyebrow={`Chronological Telemetry · ${rangeLabel}`}
          title="Traffic, Clicks & Conversions Trend"
          size="sm"
        />

        <Tabs
          items={CHART_MODE_TABS}
          value={chartType}
          onChange={setChartType}
          ariaLabel="Chart visualization mode"
          size="sm"
          variant="accent"
        />
      </div>

      {/* Unified Interactive Bucket Readout & Series Legend Toggles */}
      {activePoint && (
        <div className="px-3.5 py-2.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
            <span className="text-(--text-primary) font-semibold">
              {activePoint.bucket.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={showViews ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={showViews}
              onClick={() => setShowViews((v) => !v)}
              className={cn(
                "h-7 px-2.5 font-mono text-[11px]",
                showViews
                  ? "border-brand/45 bg-brand/10 text-(--text-primary)"
                  : "border border-(--border-subtle) opacity-55"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-brand shrink-0" />
              <span>{countMode === "sessions" ? "Sessions" : "Views"}:</span>
              <strong className="text-(--text-accent) tabular-nums">
                {activePoint.bucket.views}
              </strong>
            </Button>

            <Button
              type="button"
              variant={showClicks ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={showClicks}
              onClick={() => setShowClicks((v) => !v)}
              className={cn(
                "h-7 px-2.5 font-mono text-[11px]",
                showClicks
                  ? "border-sky-500/45 bg-sky-500/10 text-(--text-primary)"
                  : "border border-(--border-subtle) opacity-55"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
              <span>Project Clicks:</span>
              <strong className="text-sky-400 tabular-nums">
                {activePoint.bucket.clicks}
              </strong>
            </Button>

            <Button
              type="button"
              variant={showConversions ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={showConversions}
              onClick={() => setShowConversions((v) => !v)}
              className={cn(
                "h-7 px-2.5 font-mono text-[11px]",
                showConversions
                  ? "border-emerald-500/45 bg-emerald-500/10 text-(--text-primary)"
                  : "border border-(--border-subtle) opacity-55"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span>Goals &amp; Inbox:</span>
              <strong className="text-emerald-400 tabular-nums">
                {activePoint.convTotal}
              </strong>
            </Button>
          </div>
        </div>
      )}

      {/* Edge-to-Edge Responsive SVG Canvas (Strictly Contained Geometry, Zero Side Gutters) */}
      <div ref={wrapperRef} className="relative w-full overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgW} ${SVG_H}`}
          width="100%"
          height={SVG_H}
          className="block w-full select-none"
          role="img"
          aria-label="Chronological portfolio traffic, project clicks, and conversions chart"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="louViewsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal Y-Axis Gridlines Spanning 100% Width + Crisp Inset Tick Labels */}
          {metrics.yTicks.map((tick) => {
            const y = PAD_T + PLOT_H - (tick / metrics.yMax) * PLOT_H;
            return (
              <g key={tick}>
                <line
                  x1={0}
                  y1={y}
                  x2={svgW}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeDasharray={tick === 0 ? undefined : "3 4"}
                  strokeWidth="1"
                />
                <text
                  x={2}
                  y={y - 4}
                  textAnchor="start"
                  fill="var(--text-muted)"
                  stroke="var(--bg-surface)"
                  strokeWidth="3"
                  paintOrder="stroke"
                  fontSize="10"
                  fontFamily="var(--font-mono, monospace)"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Subtle Clamped Column Highlight & Guide Line on Active Bucket */}
          {activePoint && activeIdx !== null && (() => {
            const prevMid =
              activeIdx === 0
                ? 0
                : (metrics.points[activeIdx - 1].x + activePoint.x) / 2;
            const nextMid =
              activeIdx === metrics.points.length - 1
                ? svgW
                : (activePoint.x + metrics.points[activeIdx + 1].x) / 2;
            const bandX = Math.max(0, prevMid);
            const bandW = Math.max(1, Math.min(svgW, nextMid) - bandX);
            const showBand = hoveredIdx === activeIdx || focusedIdx === activeIdx;

            return (
              <>
                {showBand && (
                  <rect
                    x={bandX}
                    y={PAD_T}
                    width={bandW}
                    height={PLOT_H}
                    rx="4"
                    fill="var(--accent)"
                    fillOpacity={focusedIdx === activeIdx ? 0.08 : 0.04}
                    pointerEvents="none"
                  />
                )}
                <line
                  x1={activePoint.x}
                  y1={PAD_T}
                  x2={activePoint.x}
                  y2={metrics.baselineY}
                  stroke="var(--border-strong)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                  pointerEvents="none"
                />
              </>
            );
          })()}

          {chartType === "line" ? (
            <>
              {showViews && metrics.viewsAreaPath && (
                <path
                  data-chart-area
                  d={metrics.viewsAreaPath}
                  fill="url(#louViewsFill)"
                />
              )}
              {showViews && metrics.viewsPath && (
                <path
                  data-chart-line
                  d={metrics.viewsPath}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.25"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {showClicks && metrics.clicksPath && (
                <path
                  data-chart-line
                  d={metrics.clicksPath}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {showConversions && metrics.convPath && (
                <path
                  data-chart-line
                  d={metrics.convPath}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Data Points */}
              {metrics.points.map((pt, idx) => {
                const isSelected = idx === activeIdx;
                return (
                  <g key={pt.bucket.key} pointerEvents="none">
                    {showViews && isSelected && (
                      <circle
                        cx={pt.x}
                        cy={pt.yViews}
                        r="7"
                        fill="var(--accent)"
                        fillOpacity="0.18"
                      />
                    )}
                    {showViews && (
                      <circle
                        data-chart-dot
                        cx={pt.x}
                        cy={pt.yViews}
                        r={isSelected ? 4.5 : series.length <= 14 ? 3 : 2.25}
                        fill="var(--accent)"
                        stroke="var(--bg-surface)"
                        strokeWidth="1.5"
                      />
                    )}
                    {showClicks && (pt.bucket.clicks > 0 || isSelected) && (
                      <circle
                        data-chart-dot
                        cx={pt.x}
                        cy={pt.yClicks}
                        r={isSelected ? 4 : 2.5}
                        fill="#38bdf8"
                        stroke="var(--bg-surface)"
                        strokeWidth="1.2"
                      />
                    )}
                    {showConversions && (pt.convTotal > 0 || isSelected) && (
                      <circle
                        data-chart-dot
                        cx={pt.x}
                        cy={pt.yConv}
                        r={isSelected ? 4 : 2.5}
                        fill="#34d399"
                        stroke="var(--bg-surface)"
                        strokeWidth="1.2"
                      />
                    )}
                  </g>
                );
              })}
            </>
          ) : (
            metrics.points.map((pt) => {
              const slotW = Math.min(48, Math.max(10, metrics.colW * 0.65));
              const activeSeriesCount =
                Number(showViews) + Number(showClicks) + Number(showConversions);
              const gap = activeSeriesCount > 1 ? 2 : 0;
              const barW = Math.max(
                3,
                (slotW - gap * Math.max(activeSeriesCount - 1, 0)) /
                  Math.max(activeSeriesCount, 1)
              );

              const bars: Array<{ val: number; color: string }> = [];
              if (showViews) {
                bars.push({ val: pt.bucket.views, color: "var(--accent)" });
              }
              if (showClicks) {
                bars.push({ val: pt.bucket.clicks, color: "#38bdf8" });
              }
              if (showConversions) {
                bars.push({ val: pt.convTotal, color: "#34d399" });
              }

              const totalGroupW = bars.length * barW + (bars.length - 1) * gap;
              return (
                <g key={pt.bucket.key} pointerEvents="none">
                  {bars.map((bar, bIdx) => {
                    const barH = Math.max(
                      bar.val > 0 ? 3 : 0,
                      (bar.val / metrics.yMax) * PLOT_H
                    );
                    const bx = pt.x - totalGroupW / 2 + bIdx * (barW + gap);
                    return (
                      <rect
                        key={bIdx}
                        data-chart-bar
                        x={bx}
                        y={metrics.baselineY - barH}
                        width={barW}
                        height={barH}
                        rx="2"
                        fill={bar.color}
                      />
                    );
                  })}
                </g>
              );
            })
          )}

          {/* X-Axis Labels Clamped Inside Container Width */}
          {metrics.points.map((pt, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === series.length - 1;
            const showLabel = idx % labelStride === 0 || isLast;
            if (!showLabel) return null;

            const anchor =
              chartType === "line"
                ? isFirst
                  ? "start"
                  : isLast
                    ? "end"
                    : "middle"
                : "middle";
            const labelX =
              chartType === "line" && isFirst
                ? 2
                : chartType === "line" && isLast
                  ? svgW - 2
                  : pt.x;

            return (
              <text
                key={`lbl-${pt.bucket.key}`}
                x={labelX}
                y={SVG_H - 6}
                textAnchor={anchor}
                fill={
                  idx === activeIdx
                    ? "var(--text-primary)"
                    : "var(--text-muted)"
                }
                fontSize="9.5"
                fontWeight={idx === activeIdx ? 700 : 400}
                fontFamily="var(--font-mono, monospace)"
              >
                {pt.bucket.shortLabel}
              </text>
            );
          })}

          {/* Clamped Invisible Pointer & Keyboard Inspection Hit Regions (Zero White Focus Box Overflow) */}
          {metrics.points.map((pt, idx) => {
            const prevMid =
              idx === 0 ? 0 : (metrics.points[idx - 1].x + pt.x) / 2;
            const nextMid =
              idx === series.length - 1
                ? svgW
                : (pt.x + metrics.points[idx + 1].x) / 2;
            const hitX = Math.max(0, prevMid);
            const hitW = Math.max(1, Math.min(svgW, nextMid) - hitX);

            return (
              <rect
                key={`hit-${pt.bucket.key}`}
                x={hitX}
                y={PAD_T}
                width={hitW}
                height={PLOT_H}
                fill="transparent"
                className="cursor-crosshair outline-none focus:outline-none focus-visible:outline-none"
                onMouseEnter={() => setHoveredIdx(idx)}
                onFocus={() => setFocusedIdx(idx)}
                onBlur={() =>
                  setFocusedIdx((cur) => (cur === idx ? null : cur))
                }
                tabIndex={0}
                aria-label={`${pt.bucket.label}: ${pt.bucket.views} views, ${pt.bucket.clicks} clicks, ${pt.convTotal} conversions`}
              />
            );
          })}
        </svg>

        {metrics.peak === 0 && (
          <p className="text-center text-xs font-mono text-(--text-muted) pt-1">
            No telemetry events recorded inside {rangeLabel.toLowerCase()}.
          </p>
        )}
      </div>
    </div>
  );
}
