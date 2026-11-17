"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { AnalyticsEvent } from "@/types/portfolio";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { shouldReduceMotion } from "@/lib/appearance";
import { Activity } from "lucide-react";

export interface TelemetryEventFeedProps {
  events: readonly AnalyticsEvent[];
}

type FeedFilterType = "all" | AnalyticsEvent["type"];

const EVENT_TYPE_META: Record<
  AnalyticsEvent["type"],
  {
    label: string;
    variant: "neutral" | "accent" | "success" | "warning" | "solid";
  }
> = {
  page_view: { label: "View", variant: "neutral" },
  chapter_view: { label: "Chapter", variant: "neutral" },
  project_click: { label: "Project", variant: "accent" },
  cv_download: { label: "CV Download", variant: "success" },
  contact_click: { label: "Contact", variant: "solid" },
};

/**
 * Chronological telemetry stream powered by full-width gliding Filter Tabs
 * showing real per-type counts inside the active time window.
 */
export function TelemetryEventFeed({ events }: TelemetryEventFeedProps) {
  const [typeFilter, setTypeFilter] = useState<FeedFilterType>("all");
  const feedBodyRef = useRef<HTMLDivElement>(null);

  const typeCounts = useMemo(() => {
    const counts: Record<FeedFilterType, number> = {
      all: events.length,
      page_view: 0,
      chapter_view: 0,
      project_click: 0,
      cv_download: 0,
      contact_click: 0,
    };
    for (const ev of events) {
      counts[ev.type] = (counts[ev.type] || 0) + 1;
    }
    return counts;
  }, [events]);

  const filterTabs: TabItem<FeedFilterType>[] = useMemo(
    () => [
      { id: "all", label: "All", badge: typeCounts.all },
      { id: "page_view", label: "Views", badge: typeCounts.page_view },
      { id: "chapter_view", label: "Chapters", badge: typeCounts.chapter_view },
      { id: "project_click", label: "Projects", badge: typeCounts.project_click },
      { id: "cv_download", label: "CV", badge: typeCounts.cv_download },
      { id: "contact_click", label: "Contact", badge: typeCounts.contact_click },
    ],
    [typeCounts]
  );

  const filteredEvents = useMemo(
    () =>
      events
        .filter((ev) => (typeFilter === "all" ? true : ev.type === typeFilter))
        .slice(0, 60),
    [events, typeFilter]
  );

  useEffect(() => {
    const el = feedBodyRef.current;
    if (!el || shouldReduceMotion()) return;

    const tween = gsap.fromTo(
      el,
      { opacity: 0.45 },
      { opacity: 1, duration: 0.24, ease: "power2.out", clearProps: "opacity" }
    );
    return () => {
      tween.kill();
    };
  }, [typeFilter]);

  return (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <SectionHeader
          eyebrow={`Live Telemetry Inspector · Showing latest ${filteredEvents.length}`}
          title="Recorded Event Stream"
          size="sm"
          rightSlot={
            <Activity className="w-4 h-4 text-(--text-accent) lg:hidden" />
          }
        />

        {/* Unobstructed Reusable Gliding Filter Tabs */}
        <Tabs
          items={filterTabs}
          value={typeFilter}
          onChange={setTypeFilter}
          ariaLabel="Filter recorded telemetry event types"
          size="sm"
          variant="accent"
        />
      </div>

      <div ref={feedBodyRef}>
        {filteredEvents.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-(--text-muted) border border-dashed border-(--border-subtle) rounded-(--radius-control)">
            No recorded telemetry events match this filter inside the selected window.
          </div>
        ) : (
          <ScrollArea
            maxHeight={260}
            viewportClassName="divide-y divide-(--border-subtle)"
          >
            {filteredEvents.map((ev) => {
              const meta = EVENT_TYPE_META[ev.type];
              return (
                <div
                  key={ev.id}
                  className="py-2.5 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-colors hover:bg-(--bg-surface-2)/55 rounded-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StatusPill
                      label={meta.label}
                      variant={meta.variant}
                      size="xs"
                    />
                    <span className="font-medium text-(--text-primary) truncate">
                      {ev.target}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 text-[10px] font-mono text-(--text-muted) tabular-nums">
                    {ev.device && (
                      <span className="px-1.5 py-0.5 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) uppercase">
                        {ev.device}
                      </span>
                    )}
                    {ev.referrer && (
                      <span className="px-1.5 py-0.5 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle)">
                        ref:{ev.referrer}
                      </span>
                    )}
                    {ev.sessionId && (
                      <span className="hidden md:inline text-(--text-muted)">
                        #{ev.sessionId.slice(0, 6)}
                      </span>
                    )}
                    <span suppressHydrationWarning>
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
