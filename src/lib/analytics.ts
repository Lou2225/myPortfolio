import { ANALYTICS_LOCAL_MAX_EVENTS } from "./storageConstants";
import type {
  AnalyticsDeviceType,
  AnalyticsEvent,
  PortfolioDatabase,
} from "@/types/portfolio";

export type AnalyticsRangeKey = "24h" | "7d" | "30d" | "90d" | "all" | "custom";
export type AnalyticsCountMode = "sessions" | "events";
export type AnalyticsDeviceOption = AnalyticsDeviceType | "unattributed";
export type AnalyticsDeviceFilter = AnalyticsDeviceOption | "all";

export interface AnalyticsSlicerMeta {
  fromDate: string;
  toDate: string;
  device: AnalyticsDeviceFilter | "multi";
  devices: AnalyticsDeviceOption[];
  referrer: string;
  referrers: string[];
  isSliced: boolean;
  totalUnfilteredInWindow: number;
  deviceCounts: Record<AnalyticsDeviceOption, number>;
  availableReferrers: Array<{ value: string; label: string; count: number }>;
}

export interface PeriodDelta {
  current: number;
  prior: number | null;
  pct: number | null;
  direction: "up" | "down" | "flat";
  label: string;
}

export interface TimeSeriesBucket {
  key: string;
  label: string;
  shortLabel: string;
  startMs: number;
  endMs: number;
  views: number;
  clicks: number;
  conversions: number;
  inquiries: number;
}

export interface FunnelStep {
  id: string;
  chapterCode: string;
  label: string;
  count: number;
  pctOfEntry: number;
  prevStepDeltaPct: number | null;
  note?: string;
}

export interface ProjectPerformanceRow {
  id: string;
  title: string;
  published: boolean;
  featured: boolean;
  liveDemoClicks: number;
  githubClicks: number;
  otherClicks: number;
  totalClicks: number;
  sharePct: number;
  barPct: number;
}

export interface DistributionSlice {
  key: string;
  label: string;
  count: number;
  pct: number;
}

export interface AnalyticsSnapshotSummary {
  range: AnalyticsRangeKey;
  mode: AnalyticsCountMode;
  rangeLabel: string;
  bounds: {
    startMs: number;
    endMs: number;
    priorStartMs: number | null;
  };
  eventsInWindow: AnalyticsEvent[];
  kpis: {
    views: PeriodDelta;
    projectClicks: PeriodDelta;
    conversions: PeriodDelta;
    inquiries: PeriodDelta;
    cvDownloads: number;
    directContacts: number;
    unreadInbox: number;
    conversionRatePct: number;
    projectCtrPct: number;
    scrollCompletionPct: number;
  };
  series: TimeSeriesBucket[];
  funnel: FunnelStep[];
  projects: ProjectPerformanceRow[];
  devices: {
    slices: DistributionSlice[];
    attributedCount: number;
    unattributedCount: number;
  };
  referrers: DistributionSlice[];
  conversionChannels: DistributionSlice[];
  buffer: {
    used: number;
    capacity: number;
    pct: number;
  };
  slicers: AnalyticsSlicerMeta;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const ANALYTICS_BUFFER_CAPACITY = ANALYTICS_LOCAL_MAX_EVENTS;

const ANALYTICS_RANGE_LABELS: Record<AnalyticsRangeKey, string> = {
  "24h": "Last 24 Hours",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
  all: "All Recorded History",
  custom: "Custom Date Range",
};

export function formatAnalyticsReferrerLabel(host: string): string {
  if (!host || host === "unattributed") return "Legacy Pre-v2";
  if (host === "direct") return "Direct / Bookmark";
  if (host === "internal") return "Internal Navigation";
  return host;
}

export function toLocalYmd(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalYmdStartMs(ymd?: string | null): number | null {
  if (!ymd) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d.getTime();
}

function startOfLocalDayMs(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseTimestampMs(iso: string): number | null {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function getSessionKey(ev: AnalyticsEvent): string {
  return ev.sessionId ? ev.sessionId : ev.id;
}

function countViewsInSlice(
  events: readonly AnalyticsEvent[],
  mode: AnalyticsCountMode
): number {
  const pageViews = events.filter((e) => e.type === "page_view");
  if (mode === "events") return pageViews.length;
  return new Set(pageViews.map(getSessionKey)).size;
}

function countReachForChapter(
  events: readonly AnalyticsEvent[],
  target: string,
  mode: AnalyticsCountMode
): number {
  const matches = events.filter(
    (e) => e.type === "chapter_view" && e.target === target
  );
  if (mode === "events") return matches.length;
  return new Set(matches.map(getSessionKey)).size;
}

function computePeriodDelta(
  current: number,
  prior: number | null
): PeriodDelta {
  if (prior === null) {
    return {
      current,
      prior: null,
      pct: null,
      direction: "flat",
      label: "All time",
    };
  }
  if (prior === 0 && current === 0) {
    return {
      current,
      prior: 0,
      pct: 0,
      direction: "flat",
      label: "0.0%",
    };
  }
  if (prior === 0 && current > 0) {
    return {
      current,
      prior: 0,
      pct: null,
      direction: "up",
      label: "New",
    };
  }

  const rawPct = ((current - prior) / prior) * 100;
  const rounded = Math.round(rawPct * 10) / 10;
  const prefix = rounded > 0 ? "+" : "";
  return {
    current,
    prior,
    pct: rounded,
    direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat",
    label: `${prefix}${rounded.toFixed(1)}%`,
  };
}

function buildBuckets(
  range: AnalyticsRangeKey,
  db: PortfolioDatabase,
  nowMs: number,
  fromDate?: string | null,
  toDate?: string | null
): {
  startMs: number;
  endMs: number;
  priorStartMs: number | null;
  buckets: TimeSeriesBucket[];
  rangeLabel: string;
  resolvedFromDate: string;
  resolvedToDate: string;
} {
  const buckets: TimeSeriesBucket[] = [];

  if (range === "24h") {
    const curHourStart = new Date(nowMs);
    curHourStart.setMinutes(0, 0, 0);
    const endMs = curHourStart.getTime() + HOUR_MS;
    const binMs = 2 * HOUR_MS;
    const startMs = endMs - 12 * binMs;
    const priorStartMs = startMs - 12 * binMs;

    for (let i = 0; i < 12; i++) {
      const bStart = startMs + i * binMs;
      const bEnd = bStart + binMs;
      const d = new Date(bStart);
      const hourLabel = d.toLocaleTimeString([], {
        hour: "numeric",
        hour12: true,
      });
      buckets.push({
        key: `h-${bStart}`,
        label: `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${hourLabel}`,
        shortLabel: hourLabel.replace(/\s+/g, ""),
        startMs: bStart,
        endMs: bEnd,
        views: 0,
        clicks: 0,
        conversions: 0,
        inquiries: 0,
      });
    }
    return {
      startMs,
      endMs,
      priorStartMs,
      buckets,
      rangeLabel: ANALYTICS_RANGE_LABELS["24h"],
      resolvedFromDate: toLocalYmd(startMs),
      resolvedToDate: toLocalYmd(endMs - 1),
    };
  }

  const todayMidnight = startOfLocalDayMs(nowMs);
  const endMs = todayMidnight + DAY_MS;

  if (range === "custom") {
    const parsedFrom = parseLocalYmdStartMs(fromDate);
    const parsedTo = parseLocalYmdStartMs(toDate);

    let customStartDay = parsedFrom ?? todayMidnight - 6 * DAY_MS;
    let customEndDay = parsedTo ?? todayMidnight;
    if (customStartDay > customEndDay) {
      [customStartDay, customEndDay] = [customEndDay, customStartDay];
    }

    const customStartMs = customStartDay;
    const customEndMs = customEndDay + DAY_MS;
    const dayCount = Math.max(
      1,
      Math.round((customEndMs - customStartMs) / DAY_MS)
    );
    const priorStartMs = customStartMs - dayCount * DAY_MS;

    if (dayCount <= 2) {
      const binCount = 12;
      const binSpan = (customEndMs - customStartMs) / binCount;
      for (let i = 0; i < binCount; i++) {
        const bStart = Math.round(customStartMs + i * binSpan);
        const bEnd =
          i === binCount - 1
            ? customEndMs
            : Math.round(customStartMs + (i + 1) * binSpan);
        const d = new Date(bStart);
        const hourLabel = d.toLocaleTimeString([], {
          hour: "numeric",
          hour12: true,
        });
        buckets.push({
          key: `ch-${i}-${bStart}`,
          label: `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${hourLabel}`,
          shortLabel:
            dayCount === 1
              ? hourLabel.replace(/\s+/g, "")
              : `${d.toLocaleDateString([], { month: "numeric", day: "numeric" })} ${hourLabel.replace(/\s+/g, "")}`,
          startMs: bStart,
          endMs: bEnd,
          views: 0,
          clicks: 0,
          conversions: 0,
          inquiries: 0,
        });
      }
    } else if (dayCount <= 35) {
      for (let i = 0; i < dayCount; i++) {
        const bStart = customStartMs + i * DAY_MS;
        const bEnd = bStart + DAY_MS;
        const d = new Date(bStart);
        const shortLabel =
          dayCount <= 7
            ? d.toLocaleDateString([], { weekday: "short" })
            : d.toLocaleDateString([], { month: "short", day: "numeric" });
        buckets.push({
          key: `cd-${bStart}`,
          label: d.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
          shortLabel,
          startMs: bStart,
          endMs: bEnd,
          views: 0,
          clicks: 0,
          conversions: 0,
          inquiries: 0,
        });
      }
    } else {
      const binCount = Math.min(18, Math.max(7, Math.ceil(dayCount / 7)));
      const binSpan = (customEndMs - customStartMs) / binCount;
      for (let i = 0; i < binCount; i++) {
        const bStart = Math.round(customStartMs + i * binSpan);
        const bEnd =
          i === binCount - 1
            ? customEndMs
            : Math.round(customStartMs + (i + 1) * binSpan);
        const d = new Date(bStart);
        const dEnd = new Date(Math.max(bStart, bEnd - 1));
        const shortLabel = d.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });
        buckets.push({
          key: `cw-${i}-${bStart}`,
          label: `${shortLabel} – ${dEnd.toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })}`,
          shortLabel,
          startMs: bStart,
          endMs: bEnd,
          views: 0,
          clicks: 0,
          conversions: 0,
          inquiries: 0,
        });
      }
    }

    const fromFmt = new Date(customStartMs).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
    const toFmt = new Date(customEndDay).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const rangeLabel =
      customStartDay === customEndDay ? toFmt : `${fromFmt} – ${toFmt}`;

    return {
      startMs: customStartMs,
      endMs: customEndMs,
      priorStartMs,
      buckets,
      rangeLabel,
      resolvedFromDate: toLocalYmd(customStartMs),
      resolvedToDate: toLocalYmd(customEndDay),
    };
  }

  if (range === "7d" || range === "30d") {
    const days = range === "7d" ? 7 : 30;
    const startMs = todayMidnight - (days - 1) * DAY_MS;
    const priorStartMs = startMs - days * DAY_MS;

    for (let i = 0; i < days; i++) {
      const bStart = startMs + i * DAY_MS;
      const bEnd = bStart + DAY_MS;
      const d = new Date(bStart);
      const isToday = i === days - 1;
      const label = isToday
        ? `Today (${d.toLocaleDateString([], { month: "short", day: "numeric" })})`
        : d.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
      const shortLabel = isToday
        ? "Today"
        : days === 7
          ? d.toLocaleDateString([], { weekday: "short" })
          : d.toLocaleDateString([], { month: "short", day: "numeric" });

      buckets.push({
        key: `d-${bStart}`,
        label,
        shortLabel,
        startMs: bStart,
        endMs: bEnd,
        views: 0,
        clicks: 0,
        conversions: 0,
        inquiries: 0,
      });
    }
    return {
      startMs,
      endMs,
      priorStartMs,
      buckets,
      rangeLabel: ANALYTICS_RANGE_LABELS[range],
      resolvedFromDate: toLocalYmd(startMs),
      resolvedToDate: toLocalYmd(todayMidnight),
    };
  }

  if (range === "90d") {
    const weeks = 13;
    const weekMs = 7 * DAY_MS;
    const startMs = endMs - weeks * weekMs;
    const priorStartMs = startMs - weeks * weekMs;

    for (let i = 0; i < weeks; i++) {
      const bStart = startMs + i * weekMs;
      const bEnd = bStart + weekMs;
      const d = new Date(bStart);
      const dEnd = new Date(bEnd - 1);
      const shortLabel = d.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
      buckets.push({
        key: `w-${bStart}`,
        label: `${shortLabel} – ${dEnd.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        })}`,
        shortLabel,
        startMs: bStart,
        endMs: bEnd,
        views: 0,
        clicks: 0,
        conversions: 0,
        inquiries: 0,
      });
    }
    return {
      startMs,
      endMs,
      priorStartMs,
      buckets,
      rangeLabel: ANALYTICS_RANGE_LABELS["90d"],
      resolvedFromDate: toLocalYmd(startMs),
      resolvedToDate: toLocalYmd(todayMidnight),
    };
  }

  // All-time range: span cleanly from earliest valid telemetry/message timestamp to end of today
  let minTs = todayMidnight - 6 * DAY_MS;
  for (const ev of db.analytics) {
    const ts = parseTimestampMs(ev.createdAt);
    if (ts !== null && ts < minTs) minTs = ts;
  }
  for (const msg of db.messages) {
    const ts = parseTimestampMs(msg.createdAt);
    if (ts !== null && ts < minTs) minTs = ts;
  }

  const startMs = startOfLocalDayMs(minTs);
  const totalDays = Math.max(7, Math.ceil((endMs - startMs) / DAY_MS));

  if (totalDays <= 14) {
    for (let i = 0; i < totalDays; i++) {
      const bStart = startMs + i * DAY_MS;
      const bEnd = bStart + DAY_MS;
      const d = new Date(bStart);
      const isToday = i === totalDays - 1;
      const shortLabel = isToday
        ? "Today"
        : d.toLocaleDateString([], { month: "short", day: "numeric" });
      buckets.push({
        key: `all-d-${bStart}`,
        label: d.toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        shortLabel,
        startMs: bStart,
        endMs: bEnd,
        views: 0,
        clicks: 0,
        conversions: 0,
        inquiries: 0,
      });
    }
  } else {
    const binCount = Math.min(18, Math.max(7, Math.ceil(totalDays / 7)));
    const binSpan = (endMs - startMs) / binCount;
    for (let i = 0; i < binCount; i++) {
      const bStart = Math.round(startMs + i * binSpan);
      const bEnd = i === binCount - 1 ? endMs : Math.round(startMs + (i + 1) * binSpan);
      const d = new Date(bStart);
      const dEnd = new Date(Math.max(bStart, bEnd - 1));
      const shortLabel = d.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
      buckets.push({
        key: `all-w-${i}-${bStart}`,
        label: `${shortLabel} – ${dEnd.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        })}`,
        shortLabel,
        startMs: bStart,
        endMs: bEnd,
        views: 0,
        clicks: 0,
        conversions: 0,
        inquiries: 0,
      });
    }
  }

  return {
    startMs,
    endMs,
    priorStartMs: null,
    buckets,
    rangeLabel: ANALYTICS_RANGE_LABELS.all,
    resolvedFromDate: toLocalYmd(startMs),
    resolvedToDate: toLocalYmd(todayMidnight),
  };
}

function parseProjectTarget(rawTarget: string): {
  title: string;
  channel: "demo" | "github" | "other";
} {
  const trimmed = rawTarget.trim();
  const match = trimmed.match(/^(.*?)\s*\((Live Demo|GitHub)\)$/i);
  if (!match) {
    return { title: trimmed || "Unspecified Project", channel: "other" };
  }
  const channel = match[2].toLowerCase() === "live demo" ? "demo" : "github";
  return {
    title: match[1].trim() || trimmed,
    channel,
  };
}

function buildCsvSafeCell(raw: string): string {
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function matchesAnalyticsSlicers(
  ev: AnalyticsEvent,
  selectedDevices: readonly AnalyticsDeviceOption[],
  selectedReferrers: readonly string[]
): boolean {
  if (selectedDevices.length > 0) {
    const devKey: AnalyticsDeviceOption = ev.device ?? "unattributed";
    if (!selectedDevices.includes(devKey)) {
      return false;
    }
  }

  if (selectedReferrers.length > 0) {
    const evRef = (ev.referrer || "").trim().toLowerCase() || "unattributed";
    if (!selectedReferrers.includes(evRef)) {
      return false;
    }
  }

  return true;
}

/**
 * Computes all real-data KPIs, chronological histograms, funnel conversion steps,
 * grouped project engagement, and attribution slices over a selected window and active slicers.
 */
export function buildAnalyticsSnapshot(
  db: PortfolioDatabase,
  options?: {
    range?: AnalyticsRangeKey;
    mode?: AnalyticsCountMode;
    nowMs?: number;
    fromDate?: string | null;
    toDate?: string | null;
    device?: AnalyticsDeviceFilter;
    devices?: readonly AnalyticsDeviceOption[];
    referrer?: string;
    referrers?: readonly string[];
  }
): AnalyticsSnapshotSummary {
  const range = options?.range ?? "7d";
  const mode = options?.mode ?? "sessions";
  const nowMs = options?.nowMs ?? Date.now();

  const normalizedDevices: AnalyticsDeviceOption[] = Array.from(
    new Set(
      options?.devices && options.devices.length > 0
        ? options.devices
        : options?.device && options.device !== "all"
          ? [options.device]
          : []
    )
  );
  const normalizedReferrers: string[] = Array.from(
    new Set(
      (options?.referrers && options.referrers.length > 0
        ? options.referrers
        : options?.referrer && options.referrer !== "all"
          ? [options.referrer]
          : []
      )
        .map((r) => r.trim().toLowerCase())
        .filter((r) => r && r !== "all")
    )
  );

  const activeDeviceSummary: AnalyticsDeviceFilter | "multi" =
    normalizedDevices.length === 0
      ? "all"
      : normalizedDevices.length === 1
        ? normalizedDevices[0]
        : "multi";
  const activeReferrerSummary =
    normalizedReferrers.length === 0
      ? "all"
      : normalizedReferrers.length === 1
        ? normalizedReferrers[0]
        : "multi";

  const {
    startMs,
    endMs,
    priorStartMs,
    buckets,
    rangeLabel,
    resolvedFromDate,
    resolvedToDate,
  } = buildBuckets(range, db, nowMs, options?.fromDate, options?.toDate);

  const rawWindowEvents: AnalyticsEvent[] = [];
  const rawPriorEvents: AnalyticsEvent[] = [];

  for (const ev of db.analytics) {
    const ts = parseTimestampMs(ev.createdAt);
    if (ts === null) continue;
    if (ts >= startMs && ts < endMs) {
      rawWindowEvents.push(ev);
    } else if (priorStartMs !== null && ts >= priorStartMs && ts < startMs) {
      rawPriorEvents.push(ev);
    }
  }

  // Extract slicer facet counts over the active date window prior to applying slices
  const facetDeviceCounts: Record<AnalyticsDeviceType | "unattributed", number> = {
    desktop: 0,
    mobile: 0,
    tablet: 0,
    unattributed: 0,
  };
  const facetDeviceSessions = new Set<string>();
  const facetReferrerMap = new Map<string, number>();

  for (const ev of rawWindowEvents) {
    const refKey = (ev.referrer || "").trim() || "unattributed";
    facetReferrerMap.set(refKey, (facetReferrerMap.get(refKey) || 0) + 1);

    if (mode === "sessions") {
      const sk = getSessionKey(ev);
      if (facetDeviceSessions.has(sk)) continue;
      facetDeviceSessions.add(sk);
    }
    if (ev.device && ev.device in facetDeviceCounts) {
      facetDeviceCounts[ev.device] += 1;
    } else {
      facetDeviceCounts.unattributed += 1;
    }
  }

  const availableReferrers = Array.from(facetReferrerMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({
      value,
      label: formatAnalyticsReferrerLabel(value),
      count,
    }));

  const eventsInWindow = rawWindowEvents.filter((ev) =>
    matchesAnalyticsSlicers(ev, normalizedDevices, normalizedReferrers)
  );
  const eventsInPrior = rawPriorEvents.filter((ev) =>
    matchesAnalyticsSlicers(ev, normalizedDevices, normalizedReferrers)
  );

  const messagesInWindow = db.messages.filter((m) => {
    const ts = parseTimestampMs(m.createdAt);
    return ts !== null && ts >= startMs && ts < endMs;
  });
  const messagesInPrior =
    priorStartMs === null
      ? null
      : db.messages.filter((m) => {
          const ts = parseTimestampMs(m.createdAt);
          return ts !== null && ts >= priorStartMs && ts < startMs;
        }).length;

  // Populate chronological buckets strictly (zero historical overflow distortion!)
  const bucketSessionViews = buckets.map(() => new Set<string>());

  for (const ev of eventsInWindow) {
    const ts = parseTimestampMs(ev.createdAt);
    if (ts === null) continue;
    const idx = buckets.findIndex((b) => ts >= b.startMs && ts < b.endMs);
    if (idx === -1) continue;

    if (ev.type === "page_view") {
      if (mode === "events") {
        buckets[idx].views += 1;
      } else {
        bucketSessionViews[idx].add(getSessionKey(ev));
      }
    } else if (ev.type === "project_click") {
      buckets[idx].clicks += 1;
    } else if (ev.type === "contact_click" || ev.type === "cv_download") {
      buckets[idx].conversions += 1;
    }
  }

  for (const msg of messagesInWindow) {
    const ts = parseTimestampMs(msg.createdAt);
    if (ts === null) continue;
    const idx = buckets.findIndex((b) => ts >= b.startMs && ts < b.endMs);
    if (idx === -1) continue;
    buckets[idx].inquiries += 1;
  }

  if (mode === "sessions") {
    buckets.forEach((b, i) => {
      b.views = bucketSessionViews[i].size;
    });
  }

  const curViews = countViewsInSlice(eventsInWindow, mode);
  const priorViews =
    priorStartMs === null ? null : countViewsInSlice(eventsInPrior, mode);

  const curProjectClicks = eventsInWindow.filter(
    (e) => e.type === "project_click"
  ).length;
  const priorProjectClicks =
    priorStartMs === null
      ? null
      : eventsInPrior.filter((e) => e.type === "project_click").length;

  const curCvDownloads = eventsInWindow.filter(
    (e) => e.type === "cv_download"
  ).length;
  const curDirectContacts = eventsInWindow.filter(
    (e) => e.type === "contact_click"
  ).length;
  const curConversions = curCvDownloads + curDirectContacts;
  const priorConversions =
    priorStartMs === null
      ? null
      : eventsInPrior.filter(
          (e) => e.type === "cv_download" || e.type === "contact_click"
        ).length;

  const unreadInbox = db.messages.filter((m) => !m.isRead).length;

  // Conversion Funnel strictly anchored at CH // 00 Entry Views (`page_view`)
  const rawChapters = [
    { id: "story", code: "01", label: "Origin Story", target: "01 Story" },
    { id: "skills", code: "02", label: "Skills & Bento", target: "02 Skills" },
    { id: "projects", code: "03", label: "Selected Systems", target: "03 Projects" },
    { id: "impact", code: "04", label: "Measured Impact", target: "04 Impact" },
    { id: "contact", code: "05", label: "Contact Section", target: "05 Contact" },
  ];

  const funnelBase = Math.max(curViews, 1);
  const funnel: FunnelStep[] = [
    {
      id: "entry",
      chapterCode: "00",
      label: "Portfolio Entry Views",
      count: curViews,
      pctOfEntry: curViews > 0 ? 100 : 0,
      prevStepDeltaPct: null,
      note: mode === "sessions" ? "Unique tab sessions" : "Total page_view hits",
    },
  ];

  let prevCount = curViews;
  for (const ch of rawChapters) {
    const chCount = countReachForChapter(eventsInWindow, ch.target, mode);
    const pctOfEntry =
      curViews === 0
        ? 0
        : Math.min(100, Math.round((chCount / funnelBase) * 1000) / 10);
    const prevStepDeltaPct =
      prevCount > 0
        ? Math.round(((chCount - prevCount) / prevCount) * 1000) / 10
        : null;

    funnel.push({
      id: ch.id,
      chapterCode: ch.code,
      label: ch.label,
      count: chCount,
      pctOfEntry,
      prevStepDeltaPct,
      note:
        ch.id === "projects" && chCount > prevCount
          ? "Higher than Skills due to direct Hero CTA jumps (#projects)"
          : undefined,
    });
    prevCount = chCount;
  }

  const goalActions = curConversions + messagesInWindow.length;
  funnel.push({
    id: "goal",
    chapterCode: "CV",
    label: "Goal Actions (CV / Contact / Form)",
    count: goalActions,
    pctOfEntry:
      curViews === 0
        ? 0
        : Math.min(100, Math.round((goalActions / funnelBase) * 1000) / 10),
    prevStepDeltaPct:
      prevCount > 0
        ? Math.round(((goalActions - prevCount) / prevCount) * 1000) / 10
        : null,
  });

  const projectsReached =
    funnel.find((s) => s.id === "projects")?.count ?? 0;
  const contactReached =
    funnel.find((s) => s.id === "contact")?.count ?? 0;

  const projectCtrPct =
    Math.max(projectsReached, curViews) > 0
      ? Math.round(
          (curProjectClicks / Math.max(projectsReached || curViews, 1)) * 1000
        ) / 10
      : 0;
  const scrollCompletionPct =
    curViews > 0
      ? Math.min(100, Math.round((contactReached / curViews) * 1000) / 10)
      : 0;
  const conversionRatePct =
    curViews > 0
      ? Math.round((goalActions / curViews) * 1000) / 10
      : 0;

  // Grouped Project Performance (reconciles 100% of `curProjectClicks` + surfaces 0-click published systems)
  const projectMap = new Map<string, ProjectPerformanceRow>();
  for (const proj of db.projects) {
    if (proj.published === false) continue;
    projectMap.set(proj.title, {
      id: proj.id,
      title: proj.title,
      published: true,
      featured: Boolean(proj.featured),
      liveDemoClicks: 0,
      githubClicks: 0,
      otherClicks: 0,
      totalClicks: 0,
      sharePct: 0,
      barPct: 0,
    });
  }

  for (const ev of eventsInWindow) {
    if (ev.type !== "project_click") continue;
    const { title, channel } = parseProjectTarget(ev.target);
    let row = projectMap.get(title);
    if (!row) {
      row = {
        id: `legacy-${title}`,
        title,
        published: false,
        featured: false,
        liveDemoClicks: 0,
        githubClicks: 0,
        otherClicks: 0,
        totalClicks: 0,
        sharePct: 0,
        barPct: 0,
      };
      projectMap.set(title, row);
    }
    if (channel === "demo") row.liveDemoClicks += 1;
    else if (channel === "github") row.githubClicks += 1;
    else row.otherClicks += 1;
    row.totalClicks += 1;
  }

  const projectRows = Array.from(projectMap.values()).sort(
    (a, b) =>
      b.totalClicks - a.totalClicks ||
      Number(b.featured) - Number(a.featured) ||
      a.title.localeCompare(b.title)
  );
  const peakProjectClicks = Math.max(0, ...projectRows.map((p) => p.totalClicks));
  for (const row of projectRows) {
    row.sharePct =
      curProjectClicks > 0
        ? Math.round((row.totalClicks / curProjectClicks) * 1000) / 10
        : 0;
    row.barPct =
      peakProjectClicks > 0
        ? Math.round((row.totalClicks / peakProjectClicks) * 1000) / 10
        : 0;
  }

  // Device Attribution (derived strictly from attributed page_view or session events)
  const deviceCounts: Record<AnalyticsDeviceType, number> = {
    desktop: 0,
    mobile: 0,
    tablet: 0,
  };
  let attributedCount = 0;
  let unattributedCount = 0;

  const seenDeviceSessions = new Set<string>();
  const deviceSourceEvents = eventsInWindow.filter((e) => e.type === "page_view");
  const fallbackEvents = deviceSourceEvents.length > 0 ? deviceSourceEvents : eventsInWindow;

  for (const ev of fallbackEvents) {
    if (mode === "sessions") {
      const sk = getSessionKey(ev);
      if (seenDeviceSessions.has(sk)) continue;
      seenDeviceSessions.add(sk);
    }
    if (ev.device && ev.device in deviceCounts) {
      deviceCounts[ev.device] += 1;
      attributedCount += 1;
    } else {
      unattributedCount += 1;
    }
  }

  const deviceLabels: Record<AnalyticsDeviceType, string> = {
    desktop: "Desktop",
    mobile: "Mobile",
    tablet: "Tablet",
  };
  const deviceSlices: DistributionSlice[] = (
    ["desktop", "mobile", "tablet"] as const
  ).map((key) => ({
    key,
    label: deviceLabels[key],
    count: deviceCounts[key],
    pct:
      attributedCount > 0
        ? Math.round((deviceCounts[key] / attributedCount) * 1000) / 10
        : 0,
  }));

  // Referrer Breakdown (across attributed page_views)
  const referrerCounts = new Map<string, number>();
  let totalReferrerHits = 0;
  for (const ev of deviceSourceEvents) {
    if (!ev.referrer) continue;
    referrerCounts.set(ev.referrer, (referrerCounts.get(ev.referrer) || 0) + 1);
    totalReferrerHits += 1;
  }
  const referrers: DistributionSlice[] = Array.from(referrerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([host, count]) => ({
      key: host,
      label: formatAnalyticsReferrerLabel(host),
      count,
      pct:
        totalReferrerHits > 0
          ? Math.round((count / totalReferrerHits) * 1000) / 10
          : 0,
    }));

  // Conversion Channels Breakdown
  const channelDefs: Array<{ key: string; label: string; count: number }> = [
    { key: "cv", label: "Resume / CV Downloads", count: curCvDownloads },
    {
      key: "form",
      label: "Contact Form Submissions",
      count: eventsInWindow.filter(
        (e) => e.type === "contact_click" && e.target.includes("Form")
      ).length,
    },
    {
      key: "email",
      label: "Direct Email Links",
      count: eventsInWindow.filter(
        (e) =>
          e.type === "contact_click" && e.target.toLowerCase().includes("email")
      ).length,
    },
    {
      key: "social",
      label: "Social Profiles (GitHub / LinkedIn)",
      count: eventsInWindow.filter(
        (e) =>
          e.type === "contact_click" &&
          !e.target.includes("Form") &&
          !e.target.toLowerCase().includes("email")
      ).length,
    },
  ];
  const channelTotal = channelDefs.reduce((sum, c) => sum + c.count, 0);
  const conversionChannels: DistributionSlice[] = channelDefs.map((c) => ({
    ...c,
    pct:
      channelTotal > 0 ? Math.round((c.count / channelTotal) * 1000) / 10 : 0,
  }));

  const isSliced = normalizedDevices.length > 0 || normalizedReferrers.length > 0;

  return {
    range,
    mode,
    rangeLabel,
    bounds: { startMs, endMs, priorStartMs },
    eventsInWindow,
    kpis: {
      views: computePeriodDelta(curViews, priorViews),
      projectClicks: computePeriodDelta(curProjectClicks, priorProjectClicks),
      conversions: computePeriodDelta(curConversions, priorConversions),
      inquiries: computePeriodDelta(messagesInWindow.length, messagesInPrior),
      cvDownloads: curCvDownloads,
      directContacts: curDirectContacts,
      unreadInbox,
      conversionRatePct,
      projectCtrPct,
      scrollCompletionPct,
    },
    series: buckets,
    funnel,
    projects: projectRows,
    devices: {
      slices: deviceSlices,
      attributedCount,
      unattributedCount,
    },
    referrers,
    conversionChannels,
    buffer: {
      used: db.analytics.length,
      capacity: ANALYTICS_BUFFER_CAPACITY,
      pct: Math.min(
        100,
        Math.round((db.analytics.length / ANALYTICS_BUFFER_CAPACITY) * 1000) /
          10
      ),
    },
    slicers: {
      fromDate: resolvedFromDate,
      toDate: resolvedToDate,
      device: activeDeviceSummary,
      devices: normalizedDevices,
      referrer: activeReferrerSummary,
      referrers: normalizedReferrers,
      isSliced,
      totalUnfilteredInWindow: rawWindowEvents.length,
      deviceCounts: facetDeviceCounts,
      availableReferrers,
    },
  };
}

/**
 * Formats an executive Markdown summary of the current filtered telemetry snapshot.
 */
export function formatAnalyticsBriefMarkdown(
  summary: AnalyticsSnapshotSummary,
  db: PortfolioDatabase
): string {
  const topProjects = summary.projects
    .filter((p) => p.totalClicks > 0)
    .slice(0, 3)
    .map((p) => `- ${p.title}: ${p.totalClicks} clicks (${p.sharePct}%)`)
    .join("\n");

  const activeFilters = [
    `Window: ${summary.rangeLabel}`,
    `Mode: ${summary.mode === "sessions" ? "Unique Sessions" : "Total Events"}`,
    summary.slicers.devices.length > 0
      ? `Device: ${summary.slicers.devices.join(", ")}`
      : null,
    summary.slicers.referrers.length > 0
      ? `Source: ${summary.slicers.referrers.map(formatAnalyticsReferrerLabel).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    `# ${db.profile.fullName || "Portfolio"} — Analytics Brief`,
    activeFilters,
    "",
    `- **${summary.mode === "sessions" ? "Unique Sessions" : "Page Views"}:** ${summary.kpis.views.current} (${summary.kpis.views.label})`,
    `- **Project Clicks:** ${summary.kpis.projectClicks.current} (CTR: ${summary.kpis.projectCtrPct.toFixed(1)}%)`,
    `- **Goal Conversions (CV/Contact):** ${summary.kpis.conversions.current} (Rate: ${summary.kpis.conversionRatePct.toFixed(1)}%)`,
    `- **Inquiries Received:** ${summary.kpis.inquiries.current} (${summary.kpis.unreadInbox} unread in inbox)`,
    `- **Scroll Completion (to Contact):** ${summary.kpis.scrollCompletionPct.toFixed(1)}%`,
    ...(topProjects ? ["", "## Top Projects", topProjects] : []),
  ].join("\n");
}

/**
 * Generates an RFC-4180 CSV export with formula-injection protection for the active window.
 */
export function serializeAnalyticsCsv(
  events: readonly AnalyticsEvent[]
): string {
  const header = ["ID", "Timestamp (ISO)", "Event Type", "Target", "Device", "Referrer", "Session ID"];
  const lines = [header.map(buildCsvSafeCell).join(",")];

  for (const ev of events) {
    lines.push(
      [
        ev.id,
        ev.createdAt,
        ev.type,
        ev.target,
        ev.device || "legacy-unattributed",
        ev.referrer || "legacy-unattributed",
        ev.sessionId || "",
      ]
        .map(buildCsvSafeCell)
        .join(",")
    );
  }

  return lines.join("\r\n");
}
