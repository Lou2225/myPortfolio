"use client";

import { useId, useState } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { FieldWrapper } from "./FieldWrapper";
import { getFieldControlClassName } from "./inputStyles";
import { validateBirthDate } from "@/lib/validation";
import {
  calculateAge,
  formatBirthDateReadable,
  getBirthDateBounds,
  parseIsoDate,
} from "@/lib/date";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

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
const YEARS_PER_PAGE = 16;

type CalendarViewMode = "days" | "months" | "years";

interface CalendarCell {
  year: number;
  month: number;
  day: number;
  iso: string;
  inCurrentMonth: boolean;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampCursorToBounds(
  year: number,
  month: number,
  minIso: string,
  maxIso: string
): { year: number; month: number } {
  const minParts = parseIsoDate(minIso);
  const maxParts = parseIsoDate(maxIso);
  if (!minParts || !maxParts) return { year, month };

  let nextYear = Math.min(Math.max(year, minParts.year), maxParts.year);
  let nextMonth = month;

  if (nextYear === minParts.year && nextMonth < minParts.month) {
    nextMonth = minParts.month;
  }
  if (nextYear === maxParts.year && nextMonth > maxParts.month) {
    nextMonth = maxParts.month;
  }
  if (nextMonth < 1) {
    nextYear = Math.max(minParts.year, nextYear - 1);
    nextMonth = 12;
  } else if (nextMonth > 12) {
    nextYear = Math.min(maxParts.year, nextYear + 1);
    nextMonth = 1;
  }
  return { year: nextYear, month: nextMonth };
}

function buildCalendarCells(year: number, month: number): CalendarCell[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const currentDays = getDaysInMonth(year, month);

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevDays = getDaysInMonth(prevYear, prevMonth);

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const cells: CalendarCell[] = [];

  for (let i = 0; i < firstWeekday; i++) {
    const day = prevDays - firstWeekday + 1 + i;
    cells.push({
      year: prevYear,
      month: prevMonth,
      day,
      iso: toIsoDate(prevYear, prevMonth, day),
      inCurrentMonth: false,
    });
  }

  for (let day = 1; day <= currentDays; day++) {
    cells.push({
      year,
      month,
      day,
      iso: toIsoDate(year, month, day),
      inCurrentMonth: true,
    });
  }

  let trailingDay = 1;
  while (cells.length < 42) {
    cells.push({
      year: nextYear,
      month: nextMonth,
      day: trailingDay,
      iso: toIsoDate(nextYear, nextMonth, trailingDay),
      inCurrentMonth: false,
    });
    trailingDay++;
  }

  return cells;
}

export interface DateFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (isoDate: string) => void;
  onValidChange?: (isValid: boolean) => void;
  required?: boolean;
  minAge?: number;
  maxAge?: number;
  showComputedAgeBadge?: boolean;
  forceTouched?: boolean;
  hint?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function DateField({
  id,
  label = "Birth Date",
  value,
  onChange,
  onValidChange,
  required = true,
  minAge = 15,
  maxAge = 100,
  showComputedAgeBadge = true,
  forceTouched = false,
  hint,
  className,
  inputClassName,
  disabled = false,
}: DateFieldProps) {
  const autoId = useId();
  const fieldId = id || `date-field-${autoId}`;
  const [blurred, setBlurred] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const bounds = getBirthDateBounds(minAge, maxAge);
  const minParts = parseIsoDate(bounds.min);
  const maxParts = parseIsoDate(bounds.max);
  const minYear = minParts?.year ?? 1926;
  const maxYear = maxParts?.year ?? 2011;
  const totalYearPages = Math.max(
    1,
    Math.ceil((maxYear - minYear + 1) / YEARS_PER_PAGE)
  );

  const initialParts = parseIsoDate(value);
  const defaultCursor = clampCursorToBounds(
    initialParts?.year ?? Math.min(2004, maxYear),
    initialParts?.month ?? 6,
    bounds.min,
    bounds.max
  );

  const [viewMode, setViewMode] = useState<CalendarViewMode>("days");
  const [viewYear, setViewYear] = useState<number>(defaultCursor.year);
  const [viewMonth, setViewMonth] = useState<number>(defaultCursor.month);
  const [yearPage, setYearPage] = useState<number>(() =>
    Math.min(
      totalYearPages - 1,
      Math.max(0, Math.floor((maxYear - defaultCursor.year) / YEARS_PER_PAGE))
    )
  );

  const computedAge = calculateAge(value);
  const validation = validateBirthDate(value, {
    label,
    minAge,
    maxAge,
    required,
  });

  const parsedValue = parseIsoDate(value);
  const formattedDisplay = parsedValue ? formatBirthDateReadable(value) : "";

  const shouldShowError =
    !isDropdownOpen && !validation.valid && (forceTouched || blurred);

  const handleOpenChange = (nextOpen: boolean) => {
    setIsDropdownOpen(nextOpen);
    if (nextOpen) {
      const targetParts = parseIsoDate(value);
      const nextCursor = clampCursorToBounds(
        targetParts?.year ?? Math.min(2004, maxYear),
        targetParts?.month ?? 6,
        bounds.min,
        bounds.max
      );
      setViewYear(nextCursor.year);
      setViewMonth(nextCursor.month);
      setYearPage(
        Math.min(
          totalYearPages - 1,
          Math.max(0, Math.floor((maxYear - nextCursor.year) / YEARS_PER_PAGE))
        )
      );
      setViewMode("days");
    } else {
      setBlurred(true);
      onValidChange?.(validation.valid);
    }
  };

  const handleSelectIso = (iso: string, close: () => void) => {
    onChange(iso);
    const nextCheck = validateBirthDate(iso, {
      label,
      minAge,
      maxAge,
      required,
    });
    onValidChange?.(nextCheck.valid);
    setBlurred(true);
    close();
  };

  const prevMonthYear = viewMonth === 1 ? viewYear - 1 : viewYear;
  const prevMonthNum = viewMonth === 1 ? 12 : viewMonth - 1;
  const canGoPrevMonth =
    toIsoDate(
      prevMonthYear,
      prevMonthNum,
      getDaysInMonth(prevMonthYear, prevMonthNum)
    ) >= bounds.min;

  const nextMonthYear = viewMonth === 12 ? viewYear + 1 : viewYear;
  const nextMonthNum = viewMonth === 12 ? 1 : viewMonth + 1;
  const canGoNextMonth =
    toIsoDate(nextMonthYear, nextMonthNum, 1) <= bounds.max;

  const canGoPrevYear = viewYear > minYear;
  const canGoNextYear = viewYear < maxYear;
  const canGoOlderYears = yearPage < totalYearPages - 1;
  const canGoNewerYears = yearPage > 0;

  const handleStepPrev = () => {
    if (viewMode === "days" && canGoPrevMonth) {
      setViewYear(prevMonthYear);
      setViewMonth(prevMonthNum);
    } else if (viewMode === "months" && canGoPrevYear) {
      const clamped = clampCursorToBounds(
        viewYear - 1,
        viewMonth,
        bounds.min,
        bounds.max
      );
      setViewYear(clamped.year);
      setViewMonth(clamped.month);
    } else if (viewMode === "years" && canGoOlderYears) {
      setYearPage((p) => Math.min(totalYearPages - 1, p + 1));
    }
  };

  const handleStepNext = () => {
    if (viewMode === "days" && canGoNextMonth) {
      setViewYear(nextMonthYear);
      setViewMonth(nextMonthNum);
    } else if (viewMode === "months" && canGoNextYear) {
      const clamped = clampCursorToBounds(
        viewYear + 1,
        viewMonth,
        bounds.min,
        bounds.max
      );
      setViewYear(clamped.year);
      setViewMonth(clamped.month);
    } else if (viewMode === "years" && canGoNewerYears) {
      setYearPage((p) => Math.max(0, p - 1));
    }
  };

  const calendarCells = buildCalendarCells(viewYear, viewMonth);

  const pageEndYear = maxYear - yearPage * YEARS_PER_PAGE;
  const pageStartYear = Math.max(minYear, pageEndYear - YEARS_PER_PAGE + 1);
  const pagedYears: number[] = [];
  for (let y = pageStartYear; y <= pageEndYear; y++) {
    pagedYears.push(y);
  }

  return (
    <FieldWrapper
      id={fieldId}
      label={label}
      required={required}
      touched={shouldShowError}
      valid={validation.valid}
      error={validation.error}
      hint={hint}
      showCounter={false}
      className={className}
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <DropdownPopover
            align="start"
            portal
            overflowMode="none"
            minWidth={304}
            estimatedHeight={296}
            widthClassName="w-76 max-w-[calc(100vw-1.5rem)]"
            className="w-full block"
            disabled={disabled}
            onOpenChange={handleOpenChange}
            trigger={({ isOpen, toggle }) => (
              <button
                id={fieldId}
                type="button"
                role="combobox"
                onClick={toggle}
                disabled={disabled}
                aria-haspopup="dialog"
                aria-controls={`${fieldId}-calendar`}
                aria-expanded={isOpen}
                aria-invalid={shouldShowError}
                aria-describedby={
                  shouldShowError ? `${fieldId}-error` : undefined
                }
                className={getFieldControlClassName({
                  hasError: shouldShowError,
                  hasLeftIcon: true,
                  hasRightSlot: true,
                  mono: true,
                  className: cn(
                    "flex items-center justify-between text-left cursor-pointer",
                    isOpen && "border-brand ring-2 ring-(--accent-ring)",
                    inputClassName
                  ),
                })}
              >
                <Calendar className="w-4 h-4 text-(--text-muted) absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />

                <span
                  className={cn(
                    "truncate text-xs",
                    formattedDisplay
                      ? "text-(--text-primary)"
                      : "text-(--text-muted)"
                  )}
                >
                  {formattedDisplay || "Select birth date..."}
                </span>

                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-(--text-muted)">
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 transition-transform duration-200",
                      isOpen && "rotate-180 text-(--text-accent)"
                    )}
                  />
                </span>
              </button>
            )}
          >
            {({ close }) => (
              <div
                id={`${fieldId}-calendar`}
                role="dialog"
                aria-label={`${label} picker`}
                className="divide-y divide-(--border-subtle) text-xs select-none overflow-hidden rounded-xl"
              >
                {/* Compact Header Navigation Bar */}
                <div className="p-2 flex items-center justify-between gap-1.5 bg-(--bg-surface-2)/70">
                  <button
                    type="button"
                    onClick={handleStepPrev}
                    disabled={
                      viewMode === "days"
                        ? !canGoPrevMonth
                        : viewMode === "months"
                          ? !canGoPrevYear
                          : !canGoOlderYears
                    }
                    aria-label={
                      viewMode === "years"
                        ? "Older years"
                        : viewMode === "months"
                          ? "Previous year"
                          : "Previous month"
                    }
                    className="w-7.5 h-7.5 rounded-lg inline-flex items-center justify-center border border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary) hover:border-brand/60 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {viewMode === "years" ? (
                      <button
                        type="button"
                        onClick={() => setViewMode("days")}
                        aria-label="Back to calendar days"
                        className="h-7.5 px-3 rounded-lg font-mono text-[11px] tabular-nums border bg-brand/15 border-brand/50 text-(--text-accent) font-semibold cursor-pointer"
                      >
                        {pageStartYear} – {pageEndYear}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setViewMode((prev) =>
                              prev === "months" ? "days" : "months"
                            )
                          }
                          aria-label="Choose month"
                          aria-pressed={viewMode === "months"}
                          className={cn(
                            "h-7.5 px-2.5 rounded-lg font-mono text-[11px] uppercase tracking-wider border transition-colors cursor-pointer",
                            viewMode === "months"
                              ? "bg-brand/15 border-brand/50 text-(--text-accent) font-semibold"
                              : "bg-(--bg-surface) border-(--border-subtle) text-(--text-primary) hover:border-brand/50"
                          )}
                        >
                          {MONTH_NAMES[viewMonth - 1]}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setYearPage(
                              Math.min(
                                totalYearPages - 1,
                                Math.max(
                                  0,
                                  Math.floor(
                                    (maxYear - viewYear) / YEARS_PER_PAGE
                                  )
                                )
                              )
                            );
                            setViewMode("years");
                          }}
                          aria-label="Choose year"
                          className="h-7.5 px-2.5 rounded-lg font-mono text-[11px] tabular-nums border bg-(--bg-surface) border-(--border-subtle) text-(--text-primary) hover:border-brand/50 transition-colors cursor-pointer"
                        >
                          {viewYear}
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleStepNext}
                    disabled={
                      viewMode === "days"
                        ? !canGoNextMonth
                        : viewMode === "months"
                          ? !canGoNextYear
                          : !canGoNewerYears
                    }
                    aria-label={
                      viewMode === "years"
                        ? "Newer years"
                        : viewMode === "months"
                          ? "Next year"
                          : "Next month"
                    }
                    className="w-7.5 h-7.5 rounded-lg inline-flex items-center justify-center border border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary) hover:border-brand/60 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Compact Non-Scrolling Calendar Views */}
                <div className="p-2">
                  {viewMode === "days" && (
                    <div>
                      <div className="grid grid-cols-7 gap-0.5 mb-1">
                        {WEEKDAYS.map((dayName) => (
                          <div
                            key={dayName}
                            className="h-6 flex items-center justify-center text-[10px] font-mono uppercase tracking-wider text-(--text-muted)"
                          >
                            {dayName}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-0.5">
                        {calendarCells.map((cell) => {
                          const isOutOfBounds =
                            cell.iso < bounds.min || cell.iso > bounds.max;
                          const isSelected = cell.iso === value;

                          return (
                            <button
                              key={cell.iso}
                              type="button"
                              disabled={isOutOfBounds}
                              onClick={() => handleSelectIso(cell.iso, close)}
                              aria-label={formatBirthDateReadable(cell.iso)}
                              aria-pressed={isSelected}
                              className={cn(
                                "h-7.5 rounded-md text-xs font-mono tabular-nums inline-flex items-center justify-center transition-colors",
                                isOutOfBounds
                                  ? "opacity-25 text-(--text-muted) cursor-not-allowed"
                                  : isSelected
                                    ? "bg-brand text-brand-contrast font-bold shadow-[0_2px_8px_var(--accent-glow)] cursor-pointer"
                                    : cell.inCurrentMonth
                                      ? "text-(--text-primary) hover:bg-brand/15 hover:text-(--text-accent) cursor-pointer"
                                      : "text-(--text-muted)/65 hover:bg-(--bg-surface-2) hover:text-(--text-primary) cursor-pointer"
                              )}
                            >
                              {cell.day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {viewMode === "months" && (
                    <div className="grid grid-cols-3 gap-1.5 py-1">
                      {MONTH_SHORT.map((shortLabel, idx) => {
                        const mNum = idx + 1;
                        const mStart = toIsoDate(viewYear, mNum, 1);
                        const mEnd = toIsoDate(
                          viewYear,
                          mNum,
                          getDaysInMonth(viewYear, mNum)
                        );
                        const monthDisabled =
                          mEnd < bounds.min || mStart > bounds.max;
                        const isActiveMonth = mNum === viewMonth;

                        return (
                          <button
                            key={shortLabel}
                            type="button"
                            disabled={monthDisabled}
                            onClick={() => {
                              setViewMonth(mNum);
                              setViewMode("days");
                            }}
                            aria-pressed={isActiveMonth}
                            className={cn(
                              "h-8.5 rounded-lg font-mono text-[11px] uppercase tracking-wider border transition-colors",
                              monthDisabled
                                ? "opacity-25 border-transparent text-(--text-muted) cursor-not-allowed"
                                : isActiveMonth
                                  ? "bg-brand border-brand text-brand-contrast font-semibold cursor-pointer"
                                  : "bg-(--bg-surface-2)/40 border-(--border-subtle) text-(--text-primary) hover:border-brand/50 hover:text-(--text-accent) cursor-pointer"
                            )}
                          >
                            {shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {viewMode === "years" && (
                    <div className="grid grid-cols-4 gap-1.5 py-1">
                      {pagedYears.map((yr) => {
                        const isActiveYear = yr === viewYear;
                        return (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => {
                              const clamped = clampCursorToBounds(
                                yr,
                                viewMonth,
                                bounds.min,
                                bounds.max
                              );
                              setViewYear(clamped.year);
                              setViewMonth(clamped.month);
                              setViewMode("days");
                            }}
                            aria-pressed={isActiveYear}
                            className={cn(
                              "h-8.5 rounded-lg font-mono text-xs tabular-nums border transition-colors cursor-pointer",
                              isActiveYear
                                ? "bg-brand border-brand text-brand-contrast font-semibold"
                                : "bg-(--bg-surface-2)/40 border-(--border-subtle) text-(--text-primary) hover:border-brand/50 hover:text-(--text-accent)"
                            )}
                          >
                            {yr}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer Status */}
                <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 bg-(--bg-surface-2)/40 text-[10px] font-mono text-(--text-muted)">
                  <span className="truncate tabular-nums">
                    {parsedValue
                      ? `${value} · Age ${computedAge ?? "--"}`
                      : `${minYear}–${maxYear} allowed`}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    {!required && value && (
                      <button
                        type="button"
                        onClick={() => {
                          onChange("");
                          onValidChange?.(true);
                          close();
                        }}
                        className="inline-flex items-center gap-1 text-(--text-muted) hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={close}
                      className="text-(--text-secondary) hover:text-(--text-primary) uppercase tracking-wider cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </DropdownPopover>
        </div>

        {showComputedAgeBadge && (
          <div
            aria-live="polite"
            title="Automatically computed age"
            className={cn(
              "h-10.5 min-w-19 px-3 rounded-(--radius-control) border font-mono inline-flex flex-col items-center justify-center text-center leading-none gap-0.5 shrink-0 select-none",
              computedAge !== null && validation.valid
                ? "bg-brand/10 border-brand/40 text-(--text-primary)"
                : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-muted)"
            )}
          >
            <span className="text-[9px] uppercase tracking-[0.18em] text-(--text-muted)">
              Age
            </span>
            <span className="text-xs font-bold text-(--text-accent) tabular-nums">
              {computedAge !== null ? computedAge : "--"}
            </span>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}
