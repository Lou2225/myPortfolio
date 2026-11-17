"use client";

import {
  Check,
  Copy,
  Database,
  Download,
  FileJson,
  Globe,
  HardDrive,
  Monitor,
  RefreshCw,
  RotateCcw,
  Sliders,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import {
  type AnalyticsCountMode,
  type AnalyticsDeviceOption,
  type AnalyticsRangeKey,
  type AnalyticsSnapshotSummary,
} from "@/lib/analytics";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tooltip } from "@/components/ui/Tooltip";
import { AnalyticsDateRangePicker } from "./AnalyticsDateRangePicker";
import type { SettingsSectionId } from "@/components/admin/layout/types";
import { cn } from "@/lib/utils";

export interface AnalyticsCommandCardProps {
  storageMode: "local-json" | "supabase";
  updatedAt: string;
  totalEventsCount: number;
  range: AnalyticsRangeKey;
  countMode: AnalyticsCountMode;
  fromDate: string;
  toDate: string;
  maxDate: string;
  summary: AnalyticsSnapshotSummary;
  copiedBrief: boolean;
  onSelectRange: (next: AnalyticsRangeKey) => void;
  onApplyCustomDates: (fromDate: string, toDate: string) => void;
  onChangeCountMode: (next: AnalyticsCountMode) => void;
  onToggleDevice: (device: AnalyticsDeviceOption) => void;
  onClearDevices: () => void;
  onToggleReferrer: (referrer: string) => void;
  onClearReferrers: () => void;
  onResetFilters: () => void;
  onSyncClock: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onCopyBrief: () => void;
  onRequestClearLogs: () => void;
  onNavigateSettingsSection?: (section: SettingsSectionId) => void;
}

const COUNT_MODE_TABS: readonly TabItem<AnalyticsCountMode>[] = [
  { id: "sessions", label: "Sessions" },
  { id: "events", label: "Events" },
];

/**
 * Compact Right-Column Control & Operations Card:
 * - Fixed non-shifting header (Reset always anchored in place via disabled state)
 * - Date Filter Dropdown (quick preselect rail left of calendar) + Metric Toggle
 * - Scrollbar-free Device & Source Checkbox Slicer Lists
 * - Operations & Reports Footer (CSV, JSON, Brief, Clear)
 */
export function AnalyticsCommandCard({
  storageMode,
  updatedAt,
  totalEventsCount,
  range,
  countMode,
  fromDate,
  toDate,
  maxDate,
  summary,
  copiedBrief,
  onSelectRange,
  onApplyCustomDates,
  onChangeCountMode,
  onToggleDevice,
  onClearDevices,
  onToggleReferrer,
  onClearReferrers,
  onResetFilters,
  onSyncClock,
  onExportCsv,
  onExportJson,
  onCopyBrief,
  onRequestClearLogs,
  onNavigateSettingsSection,
}: AnalyticsCommandCardProps) {
  const { slicers } = summary;
  const activeSliceCount = summary.eventsInWindow.length;
  const bufferNearCap = storageMode !== "supabase" && summary.buffer.pct >= 80;
  const hasActiveFilter = range !== "7d" || slicers.isSliced;

  const deviceItems: Array<{
    id: AnalyticsDeviceOption;
    label: string;
    count: number;
    icon: React.ReactNode;
  }> = [
    {
      id: "desktop",
      label: "Desktop",
      count: slicers.deviceCounts.desktop,
      icon: <Monitor className="w-3 h-3 shrink-0" aria-hidden="true" />,
    },
    {
      id: "mobile",
      label: "Mobile",
      count: slicers.deviceCounts.mobile,
      icon: <Smartphone className="w-3 h-3 shrink-0" aria-hidden="true" />,
    },
    {
      id: "tablet",
      label: "Tablet",
      count: slicers.deviceCounts.tablet,
      icon: <Tablet className="w-3 h-3 shrink-0" aria-hidden="true" />,
    },
    ...(slicers.deviceCounts.unattributed > 0
      ? [
          {
            id: "unattributed" as const,
            label: "Legacy",
            count: slicers.deviceCounts.unattributed,
            icon: null,
          },
        ]
      : []),
  ];

  // Keep source list compact and scrollbar-free while prioritizing active/top hosts
  const visibleReferrers = slicers.availableReferrers.slice(0, 4);

  return (
    <section
      data-cascade
      aria-label="Analytics Filters, Slicers and Reports"
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-4 flex flex-col justify-between gap-2.5 shadow-lg h-full"
    >
      {/* Header: Non-shifting single-row toolbar */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-(--border-subtle)">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7.5 h-7.5 rounded-full bg-(--bg-badge-highlight) border border-brand/35 flex items-center justify-center text-(--text-accent) shrink-0">
            {storageMode === "supabase" ? (
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] font-semibold text-(--text-primary) truncate">
                Filters &amp; Reports
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-(--text-success) shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-(--text-success) animate-pulse" />
                {storageMode === "supabase" ? "Postgres" : "Local"}
              </span>
            </div>
            <p
              suppressHydrationWarning
              className="text-[10px] font-mono text-(--text-muted) truncate"
            >
              {activeSliceCount.toLocaleString()}/
              {totalEventsCount.toLocaleString()} events ·{" "}
              {new Date(updatedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        {/* Fixed control cluster (zero DOM mount/unmount shifting) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusPill
            label={
              storageMode === "supabase"
                ? `${summary.buffer.used.toLocaleString()} rows`
                : `${summary.buffer.pct}%`
            }
            variant={bufferNearCap ? "warning" : "neutral"}
            size="xs"
            className="hidden sm:inline-flex"
          />

          <Button
            type="button"
            variant={hasActiveFilter ? "secondary" : "ghost"}
            size="sm"
            disabled={!hasActiveFilter}
            onClick={onResetFilters}
            aria-label="Reset analytics filters to default Last 7 Days"
            className={cn(
              "h-7.5 px-2.5 text-[10px] font-mono transition-opacity",
              hasActiveFilter
                ? "opacity-100 border-brand/40 text-(--text-accent)"
                : "opacity-35"
            )}
          >
            <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>

          <Tooltip content="Sync live time window & recalculate deltas" side="bottom">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onSyncClock}
              aria-label="Refresh analytics time calculations"
              className="h-7.5 w-7.5"
            >
              <RefreshCw className="w-3 h-3 text-(--text-accent)" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Row 1: Unified Date Dropdown + Counting Mode */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AnalyticsDateRangePicker
          range={range}
          rangeLabel={summary.rangeLabel}
          fromDate={fromDate}
          toDate={toDate}
          maxDate={maxDate}
          onSelectRange={onSelectRange}
          onApplyRange={onApplyCustomDates}
        />

        <Tabs
          items={COUNT_MODE_TABS}
          value={countMode}
          onChange={onChangeCountMode}
          ariaLabel="Counting methodology"
          size="sm"
          variant="surface"
        />
      </div>

      {/* Row 2: Compact Side-by-Side Checkbox Slicer Lists (Zero Scrollbars) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-stretch">
        {/* Device Checkbox List */}
        <div
          role="group"
          aria-label="Slice telemetry by device type"
          className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-2)/40 flex flex-col overflow-hidden"
        >
          <div className="px-2.5 py-1 border-b border-(--border-subtle) flex items-center justify-between gap-1.5 bg-(--bg-surface-2)/75">
            <span className="inline-flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-[0.14em] text-(--text-muted)">
              <SlidersHorizontal
                className="w-2.5 h-2.5 text-(--text-accent)"
                aria-hidden="true"
              />
              <span>Device</span>
            </span>
            <button
              type="button"
              disabled={slicers.devices.length === 0}
              onClick={onClearDevices}
              className={cn(
                "text-[9.5px] font-mono transition-colors",
                slicers.devices.length > 0
                  ? "text-(--text-accent) hover:underline cursor-pointer"
                  : "text-(--text-muted) cursor-default"
              )}
            >
              {slicers.devices.length > 0
                ? `Clear (${slicers.devices.length})`
                : "All"}
            </button>
          </div>

          <div className="p-1 space-y-0.5">
            {deviceItems.map((item) => {
              const checked = slicers.devices.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => onToggleDevice(item.id)}
                  className={cn(
                    "w-full px-2 py-1 rounded-md flex items-center justify-between gap-1.5 text-left text-[10.5px] font-mono transition-colors cursor-pointer",
                    checked
                      ? "bg-(--bg-badge-highlight) text-(--text-primary) font-semibold"
                      : "text-(--text-secondary) hover:bg-(--bg-surface-2)"
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 transition-colors",
                        checked
                          ? "bg-brand border-brand text-brand-contrast"
                          : "border-(--border-strong) bg-(--bg-surface)"
                      )}
                    >
                      {checked && (
                        <Check className="w-2.5 h-2.5 stroke-[2.75]" />
                      )}
                    </span>
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="text-[10px] text-(--text-muted) tabular-nums shrink-0">
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Traffic Source Checkbox List */}
        <div
          role="group"
          aria-label="Slice telemetry by referral source"
          className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-2)/40 flex flex-col overflow-hidden"
        >
          <div className="px-2.5 py-1 border-b border-(--border-subtle) flex items-center justify-between gap-1.5 bg-(--bg-surface-2)/75">
            <span className="inline-flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-[0.14em] text-(--text-muted)">
              <Globe
                className="w-2.5 h-2.5 text-(--text-accent)"
                aria-hidden="true"
              />
              <span>Source</span>
            </span>
            <button
              type="button"
              disabled={slicers.referrers.length === 0}
              onClick={onClearReferrers}
              className={cn(
                "text-[9.5px] font-mono transition-colors",
                slicers.referrers.length > 0
                  ? "text-(--text-accent) hover:underline cursor-pointer"
                  : "text-(--text-muted) cursor-default"
              )}
            >
              {slicers.referrers.length > 0
                ? `Clear (${slicers.referrers.length})`
                : "All"}
            </button>
          </div>

          <div className="p-1 space-y-0.5 flex-1">
            {visibleReferrers.length === 0 ? (
              <p className="px-2 py-2.5 text-[10.5px] font-mono text-(--text-muted) text-center">
                No sources in window
              </p>
            ) : (
              visibleReferrers.map((src) => {
                const keyLower = src.value.toLowerCase();
                const checked = slicers.referrers.includes(keyLower);
                return (
                  <button
                    key={src.value}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => onToggleReferrer(keyLower)}
                    className={cn(
                      "w-full px-2 py-1 rounded-md flex items-center justify-between gap-1.5 text-left text-[10.5px] font-mono transition-colors cursor-pointer",
                      checked
                        ? "bg-(--bg-badge-highlight) text-(--text-primary) font-semibold"
                        : "text-(--text-secondary) hover:bg-(--bg-surface-2)"
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 transition-colors",
                          checked
                            ? "bg-brand border-brand text-brand-contrast"
                            : "border-(--border-strong) bg-(--bg-surface)"
                        )}
                      >
                        {checked && (
                          <Check className="w-2.5 h-2.5 stroke-[2.75]" />
                        )}
                      </span>
                      <span className="truncate">{src.label}</span>
                    </span>
                    <span className="text-[10px] text-(--text-muted) tabular-nums shrink-0">
                      {src.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer: Compact Operations & Reports Toolbar */}
      <div className="pt-2 border-t border-(--border-subtle) space-y-1.5">
        {bufferNearCap && onNavigateSettingsSection && (
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-amber-400">
            <span>Buffer at {summary.buffer.pct}% capacity</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onNavigateSettingsSection("maintenance")}
              className="h-6 px-2 text-[10px] font-mono text-(--text-accent)"
            >
              <Sliders className="w-2.5 h-2.5" aria-hidden="true" />
              <span>Prune</span>
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <Button
            type="button"
            variant="primary"
            size="sm"
            fullWidth
            disabled={activeSliceCount === 0}
            onClick={onExportCsv}
            aria-label="Export filtered analytics as CSV"
            className="h-8 px-2 text-[10.5px] font-mono"
          >
            <Download className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>CSV</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            fullWidth
            onClick={onExportJson}
            aria-label="Export filtered analytics report as JSON"
            className="h-8 px-2 text-[10.5px] font-mono"
          >
            <FileJson
              className="w-3 h-3 text-(--text-accent) shrink-0"
              aria-hidden="true"
            />
            <span>JSON</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            fullWidth
            onClick={onCopyBrief}
            aria-label="Copy formatted KPI brief to clipboard"
            className="h-8 px-2 text-[10.5px] font-mono"
          >
            {copiedBrief ? (
              <>
                <Check className="w-3 h-3 text-(--text-success) shrink-0" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-(--text-accent) shrink-0" />
                <span>Brief</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="danger"
            size="sm"
            fullWidth
            disabled={totalEventsCount === 0}
            onClick={onRequestClearLogs}
            aria-label="Clear telemetry logs"
            className="h-8 px-2 text-[10.5px] font-mono"
          >
            <Trash2 className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>Clear</span>
          </Button>
        </div>
      </div>
    </section>
  );
}
