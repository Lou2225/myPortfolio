"use client";

import { useEffect, useMemo, useState } from "react";
import { PortfolioDatabase } from "@/types/portfolio";
import {
  buildAnalyticsSnapshot,
  formatAnalyticsBriefMarkdown,
  serializeAnalyticsCsv,
  toLocalYmd,
  type AnalyticsCountMode,
  type AnalyticsDeviceOption,
  type AnalyticsRangeKey,
} from "@/lib/analytics";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useOfflineStatus, isNetworkOffline } from "@/components/pwa/OfflineManager";
import { AdminAlertBanner } from "@/components/admin/AdminAlertBanner";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import type { AdminTab, SettingsSectionId } from "./layout/types";
import { AnalyticsCommandCard } from "./analytics/AnalyticsCommandCard";
import { AnalyticsKpiGrid } from "./analytics/AnalyticsKpiGrid";
import { TrafficTrendChart } from "./analytics/TrafficTrendChart";
import { ConversionFunnelCard } from "./analytics/ConversionFunnelCard";
import { ProjectPerformanceCard } from "./analytics/ProjectPerformanceCard";
import { AudienceAttributionCard } from "./analytics/AudienceAttributionCard";
import { TelemetryEventFeed } from "./analytics/TelemetryEventFeed";

interface AnalyticsOverviewProps {
  db: PortfolioDatabase;
  storageMode: "local-json" | "supabase";
  onClearAnalytics: () => Promise<void>;
  onNavigateTab: (tab: AdminTab) => void;
  onNavigateSettingsSection?: (section: SettingsSectionId) => void;
}

function triggerBlobDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AnalyticsOverview({
  db,
  storageMode,
  onClearAnalytics,
  onNavigateTab,
  onNavigateSettingsSection,
}: AnalyticsOverviewProps) {
  const { isOnline } = useOfflineStatus();
  const [range, setRange] = useState<AnalyticsRangeKey>("7d");
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [countMode, setCountMode] = useState<AnalyticsCountMode>("sessions");
  const [selectedDevices, setSelectedDevices] = useState<AnalyticsDeviceOption[]>([]);
  const [selectedReferrers, setSelectedReferrers] = useState<string[]>([]);
  const [copiedBrief, setCopiedBrief] = useState(false);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.parse(db.updatedAt) || 0);
  const [syncTick, setSyncTick] = useState(0);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setNowMs(Date.now());
    });
    return () => cancelAnimationFrame(rafId);
  }, [db.analytics, db.messages, db.updatedAt, syncTick]);

  const maxYmd = useMemo(
    () => toLocalYmd(nowMs > 0 ? nowMs : Date.parse(db.updatedAt) || 0),
    [nowMs, db.updatedAt]
  );

  const summary = useMemo(
    () =>
      buildAnalyticsSnapshot(db, {
        range,
        mode: countMode,
        nowMs: nowMs > 0 ? nowMs : Date.parse(db.updatedAt) || 0,
        fromDate: customFromDate || undefined,
        toDate: customToDate || undefined,
        devices: selectedDevices,
        referrers: selectedReferrers,
      }),
    [
      db,
      range,
      countMode,
      nowMs,
      customFromDate,
      customToDate,
      selectedDevices,
      selectedReferrers,
    ]
  );

  const handleSelectRange = (nextRange: AnalyticsRangeKey) => {
    setRange(nextRange);
    if (nextRange !== "custom") {
      setCustomFromDate("");
      setCustomToDate("");
    }
  };

  const handleApplyCustomDates = (from: string, to: string) => {
    setCustomFromDate(from);
    setCustomToDate(to);
    setRange("custom");
  };

  const handleToggleDevice = (device: AnalyticsDeviceOption) => {
    setSelectedDevices((prev) =>
      prev.includes(device) ? prev.filter((d) => d !== device) : [...prev, device]
    );
  };

  const handleToggleReferrer = (referrer: string) => {
    const norm = referrer.trim().toLowerCase();
    setSelectedReferrers((prev) =>
      prev.includes(norm) ? prev.filter((r) => r !== norm) : [...prev, norm]
    );
  };

  const handleResetAllFilters = () => {
    setRange("7d");
    setCustomFromDate("");
    setCustomToDate("");
    setSelectedDevices([]);
    setSelectedReferrers([]);
  };

  const handleExportCsv = () => {
    const csv = serializeAnalyticsCsv(summary.eventsInWindow);
    const stampMs = nowMs > 0 ? nowMs : Date.parse(db.updatedAt) || 0;
    const stamp = new Date(stampMs).toISOString().slice(0, 10);
    triggerBlobDownload(
      `lou-analytics-${range}-${stamp}.csv`,
      csv,
      "text/csv;charset=utf-8;"
    );
  };

  const handleExportJson = () => {
    const stampMs = nowMs > 0 ? nowMs : Date.parse(db.updatedAt) || 0;
    const isoStamp = new Date(stampMs).toISOString();
    const stamp = isoStamp.slice(0, 10);
    const report = {
      exportedAt: isoStamp,
      range,
      rangeLabel: summary.rangeLabel,
      countMode,
      slicers: {
        fromDate: summary.slicers.fromDate,
        toDate: summary.slicers.toDate,
        devices: summary.slicers.devices,
        referrers: summary.slicers.referrers,
      },
      kpis: summary.kpis,
      funnel: summary.funnel,
      projects: summary.projects,
      devices: summary.devices,
      referrers: summary.referrers,
      conversionChannels: summary.conversionChannels,
      series: summary.series,
      events: summary.eventsInWindow,
    };
    triggerBlobDownload(
      `lou-analytics-${range}-${stamp}.json`,
      JSON.stringify(report, null, 2),
      "application/json;charset=utf-8;"
    );
  };

  const handleCopyBrief = async () => {
    const markdown = formatAnalyticsBriefMarkdown(summary, db);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopiedBrief(true);
      setTimeout(() => setCopiedBrief(false), 2000);
    } catch {
      setActionError("Unable to copy KPI brief to clipboard.");
    }
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <AdminAlertBanner
          variant="error"
          message={actionError}
          onDismiss={() => setActionError(null)}
        />
      )}

      {/* Row 1: Unified 1-Card Metrics Matrix (Left) + Combined Filters, Checkbox Slicers & Reports (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-7 flex flex-col [&>section]:flex-1">
          <AnalyticsKpiGrid
            db={db}
            summary={summary}
            onNavigateTab={onNavigateTab}
          />
        </div>

        <div className="xl:col-span-5 flex flex-col [&>section]:flex-1">
          <AnalyticsCommandCard
            storageMode={storageMode}
            updatedAt={db.updatedAt}
            totalEventsCount={db.analytics.length}
            range={range}
            countMode={countMode}
            fromDate={summary.slicers.fromDate}
            toDate={summary.slicers.toDate}
            maxDate={maxYmd}
            summary={summary}
            copiedBrief={copiedBrief}
            onSelectRange={handleSelectRange}
            onApplyCustomDates={handleApplyCustomDates}
            onChangeCountMode={setCountMode}
            onToggleDevice={handleToggleDevice}
            onClearDevices={() => setSelectedDevices([])}
            onToggleReferrer={handleToggleReferrer}
            onClearReferrers={() => setSelectedReferrers([])}
            onResetFilters={handleResetAllFilters}
            onSyncClock={() => setSyncTick((t) => t + 1)}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            onCopyBrief={() => void handleCopyBrief()}
            onRequestClearLogs={() => setConfirmClearOpen(true)}
            onNavigateSettingsSection={onNavigateSettingsSection}
          />
        </div>
      </div>

      {/* Row 2: Interactive Chronological SVG Multi-Series Trend Graph */}
      <TrafficTrendChart
        series={summary.series}
        rangeLabel={summary.rangeLabel}
        countMode={countMode}
      />

      {/* Row 3: Funnel & Grouped Project Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <ConversionFunnelCard summary={summary} />
        </div>
        <div className="lg:col-span-5">
          <ProjectPerformanceCard
            summary={summary}
            onManageProjects={() => onNavigateTab("projects")}
          />
        </div>
      </div>

      {/* Row 4: Device Donut & Conversion Channels / Referrer Attribution */}
      <AudienceAttributionCard summary={summary} />

      {/* Row 5: Filterable Chronological Event Stream */}
      <TelemetryEventFeed events={summary.eventsInWindow} />

      <ConfirmModal
        open={confirmClearOpen}
        variant="danger"
        title="Clear Analytics Telemetry Logs?"
        description={`This permanently removes all ${db.analytics.length} recorded telemetry events (page views, chapter views, project clicks, and contact clicks). Portfolio content and inbox messages will not be affected.`}
        confirmLabel="Clear Telemetry Logs"
        loading={clearingLogs}
        onCancel={() => {
          if (!clearingLogs) setConfirmClearOpen(false);
        }}
        onConfirm={async () => {
          setClearingLogs(true);
          setActionError(null);
          if (isNetworkOffline(isOnline)) {
            const msg = "Offline — Reconnect to clear server telemetry logs.";
            setActionError(msg);
            announceBrandPortalStatus({
              tone: "offline",
              label: "Offline Mode",
              detail: "Reconnect to clear telemetry",
            });
            setClearingLogs(false);
            setConfirmClearOpen(false);
            return;
          }
          try {
            await onClearAnalytics();
            announceBrandPortalStatus({
              tone: "synced",
              label: "Logs Cleared",
              detail: "Analytics telemetry wiped",
              durationMs: 2800,
            });
          } catch (err) {
            const msg =
              err instanceof Error
                ? err.message
                : "Failed to clear analytics logs.";
            setActionError(msg);
            announceBrandPortalStatus({
              tone: "error",
              label: "Clear Failed",
              detail: msg,
            });
          } finally {
            setClearingLogs(false);
            setConfirmClearOpen(false);
          }
        }}
      />
    </div>
  );
}
