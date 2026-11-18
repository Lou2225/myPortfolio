"use client";

import { useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { Button } from "@/components/ui/Button";
import { toLocalYmd, type AnalyticsRangeKey } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export interface AnalyticsDateRangePickerProps {
  range: AnalyticsRangeKey;
  rangeLabel: string;
  fromDate: string;
  toDate: string;
  maxDate: string;
  onSelectRange: (next: AnalyticsRangeKey) => void;
  onApplyRange: (fromDate: string, toDate: string) => void;
}

const QUICK_RANGE_PRESETS: Array<{
  id: Exclude<AnalyticsRangeKey, "custom">;
  label: string;
}> = [
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "all", label: "All" },
];

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function parseYmdParts(
  ymd: string
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || "").trim());
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  };
}

function buildMonthCells(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();
  const cells: Array<{ ymd: string; day: number; inMonth: boolean }> = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    const day = prevMonthDays - i;
    const d = new Date(year, month - 2, day);
    cells.push({ ymd: toLocalYmd(d.getTime()), day, inMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, month - 1, day);
    cells.push({ ymd: toLocalYmd(d.getTime()), day, inMonth: true });
  }

  while (cells.length < 42) {
    const idx = cells.length - (firstDay + daysInMonth) + 1;
    const d = new Date(year, month, idx);
    cells.push({
      ymd: toLocalYmd(d.getTime()),
      day: d.getDate(),
      inMonth: false,
    });
  }

  return cells;
}

function formatCompactRange(fromYmd: string, toYmd: string): string {
  const f = parseYmdParts(fromYmd);
  const t = parseYmdParts(toYmd);
  if (!f || !t) return "Custom Dates";
  const fromLabel = `${MONTH_SHORT[f.month - 1]} ${f.day}`;
  const toLabel = `${MONTH_SHORT[t.month - 1]} ${t.day}`;
  return fromYmd === toYmd
    ? `${fromLabel}, ${f.year}`
    : `${fromLabel} – ${toLabel}`;
}

/**
 * Compact Date Filter Dropdown with quick date preselect rail on the LEFT
 * and an interactive range-selection calendar on the RIGHT.
 */
export function AnalyticsDateRangePicker({
  range,
  rangeLabel,
  fromDate,
  toDate,
  maxDate,
  onSelectRange,
  onApplyRange,
}: AnalyticsDateRangePickerProps) {
  const initialRef = parseYmdParts(toDate) ||
    parseYmdParts(maxDate) || {
      year: 2026,
      month: 11,
      day: 16,
    };
  const [viewYear, setViewYear] = useState(initialRef.year);
  const [viewMonth, setViewMonth] = useState(initialRef.month);
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);

  const cells = buildMonthCells(viewYear, viewMonth);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setDraftFrom(fromDate);
      setDraftTo(toDate);
      const anchor = parseYmdParts(toDate) || parseYmdParts(maxDate);
      if (anchor) {
        setViewYear(anchor.year);
        setViewMonth(anchor.month);
      }
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  const handleDayClick = (ymd: string) => {
    if (ymd > maxDate) return;
    if (!draftFrom || (draftFrom && draftTo && draftFrom !== draftTo)) {
      setDraftFrom(ymd);
      setDraftTo(ymd);
      return;
    }
    if (ymd < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(ymd);
    } else {
      setDraftTo(ymd);
    }
  };

  const applyCalendarPreset = (daysBack: number | "mtd", close: () => void) => {
    const endParts = parseYmdParts(maxDate);
    if (!endParts) return;
    const endMs = new Date(
      endParts.year,
      endParts.month - 1,
      endParts.day
    ).getTime();
    let startYmd = maxDate;
    if (daysBack === "mtd") {
      startYmd = toLocalYmd(
        new Date(endParts.year, endParts.month - 1, 1).getTime()
      );
    } else if (daysBack > 0) {
      startYmd = toLocalYmd(endMs - daysBack * 24 * 60 * 60 * 1000);
    }
    setDraftFrom(startYmd);
    setDraftTo(maxDate);
    onApplyRange(startYmd, maxDate);
    close();
  };

  const orderedFrom = draftFrom <= draftTo ? draftFrom : draftTo;
  const orderedTo = draftFrom <= draftTo ? draftTo : draftFrom;
  const isCustomActive = range === "custom";
  const isNonDefault = range !== "7d";

  const triggerText = isCustomActive
    ? formatCompactRange(fromDate, toDate)
    : rangeLabel;

  return (
    <DropdownPopover
      portal
      align="start"
      minWidth={410}
      widthClassName="w-[calc(100vw-1.5rem)] sm:w-[424px]"
      overflowMode="auto"
      onOpenChange={handleOpenChange}
      trigger={({ isOpen, toggle }) => (
        <Button
          type="button"
          variant={isNonDefault ? "primary" : "outline"}
          size="sm"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-label="Filter analytics date range"
          className={cn(
            "h-8 px-3 text-[11px] font-mono normal-case tracking-normal justify-between gap-2",
            isNonDefault && "keep-white"
          )}
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{triggerText}</span>
          </span>
          <ChevronDown
            className={cn(
              "w-3 h-3 shrink-0 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
            aria-hidden="true"
          />
        </Button>
      )}
    >
      {({ close }) => (
        <div className="p-3 text-xs grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3">
          {/* Left Rail: Quick Date Preselects */}
          <div className="sm:pr-3 sm:border-r border-b sm:border-b-0 border-(--border-subtle) pb-2.5 sm:pb-0 flex flex-col justify-between gap-2">
            <div className="space-y-1.5">
              <span className="block text-[9px] font-mono uppercase tracking-[0.16em] text-(--text-muted)">
                Preselects
              </span>
              <div className="flex flex-wrap sm:flex-col gap-1">
                {QUICK_RANGE_PRESETS.map((preset) => {
                  const active = range === preset.id;
                  return (
                    <Button
                      key={preset.id}
                      type="button"
                      size="sm"
                      variant={active ? "primary" : "ghost"}
                      onClick={() => {
                        onSelectRange(preset.id);
                        close();
                      }}
                      className={cn(
                        "h-6.5 px-2.5 text-[10px] font-mono sm:w-full sm:justify-start",
                        active && "keep-white"
                      )}
                    >
                      {preset.label}
                    </Button>
                  );
                })}
                <div className="hidden sm:block my-0.5 border-t border-(--border-subtle)/60" />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => applyCalendarPreset(0, close)}
                  className="h-6.5 px-2.5 text-[10px] font-mono sm:w-full sm:justify-start"
                >
                  Today
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => applyCalendarPreset("mtd", close)}
                  className="h-6.5 px-2.5 text-[10px] font-mono sm:w-full sm:justify-start"
                >
                  This Month
                </Button>
              </div>
            </div>

            {isNonDefault && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onSelectRange("7d");
                  close();
                }}
                className="h-6.5 px-2 text-[10px] font-mono sm:w-full"
              >
                <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                <span>Default 7D</span>
              </Button>
            )}
          </div>

          {/* Right Pane: Interactive Range Calendar */}
          <div className="space-y-2.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="h-6.5 w-6.5 rounded-full border border-(--border-subtle) hover:border-brand text-(--text-secondary) hover:text-(--text-accent) inline-flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="font-mono text-[11px] font-semibold text-(--text-primary) uppercase tracking-wider">
                {MONTH_SHORT[viewMonth - 1]} {viewYear}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="h-6.5 w-6.5 rounded-full border border-(--border-subtle) hover:border-brand text-(--text-secondary) hover:text-(--text-accent) inline-flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-mono text-(--text-muted)">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((c) => {
                const disabled = c.ymd > maxDate;
                const isEdge = c.ymd === orderedFrom || c.ymd === orderedTo;
                const inRange = c.ymd > orderedFrom && c.ymd < orderedTo;
                return (
                  <button
                    key={c.ymd}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleDayClick(c.ymd)}
                    className={cn(
                      "h-6.5 rounded-full text-[10px] font-mono tabular-nums transition-colors cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed",
                      isEdge
                        ? "bg-brand text-brand-contrast font-bold shadow-[0_0_10px_var(--accent-glow)]"
                        : inRange
                          ? "bg-(--bg-badge-highlight) text-(--text-accent) font-medium"
                          : c.inMonth
                            ? "text-(--text-primary) hover:bg-(--bg-surface-2)"
                            : "text-(--text-muted)/60 hover:bg-(--bg-surface-2)"
                    )}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-(--border-subtle) flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-(--text-muted) truncate">
                {formatCompactRange(orderedFrom, orderedTo)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => {
                  onApplyRange(orderedFrom, orderedTo);
                  close();
                }}
                className="h-7 px-3 text-[10px] font-mono keep-white shrink-0"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </DropdownPopover>
  );
}
