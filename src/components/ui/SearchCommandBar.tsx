"use client";

import {
  Fragment,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import { ChevronRight, Search, X } from "lucide-react";
import { shouldReduceMotion } from "@/lib/appearance";
import { createSearchRowStaggerTween } from "@/lib/searchMotion";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextField } from "@/components/ui/fields/TextField";
import { getFieldControlClassName } from "@/components/ui/fields/inputStyles";
import { cn } from "@/lib/utils";

export interface SearchCommandItem<TMeta = unknown> {
  id: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  badge?: string;
  badgeVariant?: "neutral" | "accent" | "success" | "warning" | "solid";
  meta: TMeta;
}

export interface SearchCommandBarHandle {
  focus: (selectAll?: boolean) => void;
  blur: () => void;
  open: () => void;
  close: () => void;
}

export interface SearchCommandBarProps<TMeta = unknown> {
  ref?: React.Ref<SearchCommandBarHandle>;
  id?: string;
  /** Optional field label (e.g. "Find a setting"); omit for compact navbar mode */
  label?: string;
  ariaLabel?: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  items: readonly SearchCommandItem<TMeta>[];
  /** Shown inside dropdown when `value` is non-empty and `items` is empty */
  fallbackItems?: readonly SearchCommandItem<TMeta>[];
  onSelect: (item: SearchCommandItem<TMeta>) => void;
  clearAriaLabel?: string;
  idleHeading?: string;
  emptyMatchesLabel?: string;
  shortcutHint?: string;
  maxLength?: number;
  maxDropdownHeightPx?: number;
  compact?: boolean;
  panelMode?: "floating" | "inline";
  panelClassName?: string;
  containerClassName?: string;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * Highlights case-insensitive substring matches using the CMS accent badge highlight tokens.
 */
export function renderHighlightedSearchText(
  text: string,
  query: string
): ReactNode {
  const clean = query.trim();
  if (!clean) return text;

  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "ig");
  const parts = text.split(regex);
  if (parts.length <= 1) return text;

  const lowerClean = clean.toLowerCase();
  return parts.map((part, idx) =>
    part.toLowerCase() === lowerClean ? (
      <mark
        key={`${part}-${idx}`}
        className="bg-(--bg-badge-highlight) text-(--text-accent) font-semibold px-0.5 rounded-sm"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={`${part}-${idx}`}>{part}</Fragment>
    )
  );
}

/**
 * Shared Windows-11-style Search Command Bar & Animated Recommendations Dropdown.
 * Powers both SettingsHub's "Find a setting" and the AdminNavbar Global Search.
 */
export function SearchCommandBar<TMeta = unknown>({
  ref,
  id,
  label,
  ariaLabel,
  value,
  onChange,
  placeholder = "Type a keyword or pick a suggestion...",
  items,
  fallbackItems = [],
  onSelect,
  clearAriaLabel = "Clear search",
  idleHeading = "Recommended Suggestions",
  emptyMatchesLabel,
  shortcutHint,
  maxLength = 80,
  maxDropdownHeightPx = 300,
  compact = false,
  panelMode = "floating",
  panelClassName,
  containerClassName,
  defaultOpen = false,
  onOpenChange,
}: SearchCommandBarProps<TMeta>) {
  const autoId = useId();
  const inputId = id || `search-cmd-${autoId.replace(/:/g, "")}`;
  const listboxId = `${inputId}-listbox`;

  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [rawHighlightedIdx, setRawHighlightedIdx] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownFrameRef = useRef<HTMLDivElement>(null);
  const dropdownInnerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevQueryRef = useRef("");

  const normalizedQuery = value.trim().toLowerCase();
  const hasMatches = items.length > 0;
  const activeItems = hasMatches ? items : fallbackItems;
  const highlightedIdx = Math.min(
    rawHighlightedIdx,
    Math.max(0, activeItems.length - 1)
  );

  const panelVisible = panelMode === "inline" ? true : isOpen;

  const updateOpen = useCallback(
    (next: boolean) => {
      setIsOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const getInputEl = useCallback((): HTMLInputElement | null => {
    return rootRef.current?.querySelector<HTMLInputElement>(
      `input#${CSS.escape(inputId)}`
    ) ?? null;
  }, [inputId]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (selectAll = false) => {
        updateOpen(true);
        const input = getInputEl();
        if (input) {
          input.focus();
          if (selectAll) input.select();
        }
      },
      blur: () => {
        updateOpen(false);
        getInputEl()?.blur();
      },
      open: () => updateOpen(true),
      close: () => updateOpen(false),
    }),
    [getInputEl, updateOpen]
  );

  // Close floating dropdown when clicking outside the search input + dropdown panel
  useEffect(() => {
    if (!isOpen || panelMode === "inline") return;

    const handleOutsidePointerDown = (e: PointerEvent) => {
      const targetEl = e.target as Node | null;
      if (!targetEl || !rootRef.current?.contains(targetEl)) {
        updateOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () =>
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true
      );
  }, [isOpen, panelMode, updateOpen]);

  // Smoothly interpolate recommendation dropdown height when matches dynamically change
  useEffect(() => {
    const frame = dropdownFrameRef.current;
    const inner = dropdownInnerRef.current;
    if (!frame || !inner) return;

    const prefersReducedMotion = shouldReduceMotion();

    const syncHeight = (animate: boolean) => {
      const targetHeight = Math.min(inner.scrollHeight, maxDropdownHeightPx);
      if (!animate || prefersReducedMotion) {
        gsap.set(frame, { height: targetHeight });
      } else {
        gsap.to(frame, {
          height: targetHeight,
          duration: 0.24,
          ease: "power3.out",
          overwrite: "auto",
        });
      }
    };

    syncHeight(false);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      syncHeight(panelVisible);
    });
    observer.observe(inner);

    return () => {
      observer.disconnect();
      gsap.killTweensOf(frame);
    };
  }, [maxDropdownHeightPx, panelVisible]);

  // Subtle row crossfade & settle when filtering recommendations live
  useEffect(() => {
    const prev = prevQueryRef.current;
    prevQueryRef.current = normalizedQuery;
    if (!panelVisible || prev === normalizedQuery) return;

    const inner = dropdownInnerRef.current;
    if (!inner) return;
    if (shouldReduceMotion()) return;

    const ctx = gsap.context(() => {
      createSearchRowStaggerTween(inner, {
        selector: "[data-rec-row]",
        maxRows: 16,
        fromOpacity: 0.45,
        fromY: 5,
        duration: 0.22,
        stagger: 0.018,
        ease: "power2.out",
      });
    }, inner);

    return () => ctx.revert();
  }, [normalizedQuery, panelVisible]);

  // Keep keyboard-selected recommendation visible
  useEffect(() => {
    if (!panelVisible) return;
    optionRefs.current[highlightedIdx]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [highlightedIdx, panelVisible]);

  const handleQueryChange = (next: string) => {
    onChange(next);
    setRawHighlightedIdx(0);
    if (!isOpen) {
      updateOpen(true);
    }
  };

  const handleSelectRow = (item: SearchCommandItem<TMeta>) => {
    updateOpen(false);
    onSelect(item);
  };

  const handleContainerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!panelVisible && e.key !== "ArrowDown") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) updateOpen(true);
      setRawHighlightedIdx((prev) =>
        activeItems.length === 0 ? 0 : (prev + 1) % activeItems.length
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setRawHighlightedIdx((prev) =>
        activeItems.length === 0
          ? 0
          : (prev - 1 + activeItems.length) % activeItems.length
      );
    } else if (e.key === "Enter" && activeItems[highlightedIdx]) {
      e.preventDefault();
      handleSelectRow(activeItems[highlightedIdx]);
    } else if (e.key === "Escape") {
      if (panelMode === "floating") {
        e.preventDefault();
        updateOpen(false);
        getInputEl()?.blur();
      }
    }
  };

  const handleContainerBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (panelMode === "inline") return;
    const nextFocused = e.relatedTarget as Node | null;
    if (!nextFocused) return;
    if (!rootRef.current?.contains(nextFocused)) {
      updateOpen(false);
    }
  };

  const handleClear = () => {
    onChange("");
    setRawHighlightedIdx(0);
    updateOpen(true);
    getInputEl()?.focus();
  };

  const headerStatusText = normalizedQuery
    ? hasMatches
      ? `Recommended Matches (${items.length})`
      : emptyMatchesLabel ||
        `No exact matches for "${value.trim()}" — Try one of these`
    : idleHeading;

  const showClearButton = value.length > 0;

  return (
    <div
      ref={rootRef}
      role="combobox"
      aria-expanded={panelVisible}
      aria-haspopup="listbox"
      aria-controls={listboxId}
      onFocusCapture={() => updateOpen(true)}
      onBlur={handleContainerBlur}
      onKeyDown={handleContainerKeyDown}
      className={cn("relative", containerClassName)}
    >
      {label && !compact ? (
        <TextField
          id={inputId}
          label={label}
          value={value}
          onChange={handleQueryChange}
          placeholder={placeholder}
          required={false}
          minLength={0}
          maxLength={maxLength}
          leftSlot={<Search className="w-3.5 h-3.5 text-(--text-muted)" />}
          rightSlot={
            showClearButton ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                shape="rounded"
                magnetic={false}
                onClick={handleClear}
                aria-label={clearAriaLabel}
                className="h-10.5 px-3 font-mono text-xs shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none select-none">
            <Search
              className={cn(
                "w-3.5 h-3.5 transition-colors",
                panelVisible ? "text-(--text-accent)" : "text-(--text-muted)"
              )}
            />
          </span>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            value={value}
            onChange={(e) => handleQueryChange(e.target.value.slice(0, maxLength))}
            placeholder={placeholder}
            maxLength={maxLength}
            aria-label={ariaLabel || label || placeholder}
            aria-activedescendant={
              panelVisible && activeItems[highlightedIdx]
                ? `${listboxId}-option-${highlightedIdx}`
                : undefined
            }
            className={getFieldControlClassName({
              hasLeftIcon: true,
              hasRightSlot: true,
              className: cn(
                "h-9.5 text-xs sm:text-[13px] pr-14 sm:pr-16 border-(--border-strong)",
                panelVisible && "border-brand"
              ),
            })}
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {showClearButton ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClear}
                aria-label={clearAriaLabel}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-(--bg-surface-2) hover:bg-(--bg-badge-highlight) border border-(--border-subtle) text-[10px] font-mono uppercase tracking-wider text-(--text-secondary) hover:text-(--text-primary) transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            ) : shortcutHint ? (
              <kbd
                aria-hidden="true"
                className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded-sm border border-(--border-subtle) bg-(--bg-surface-2) font-mono text-[9px] uppercase tracking-[0.08em] text-(--text-muted) select-none pointer-events-none"
              >
                {shortcutHint}
              </kbd>
            ) : null}
          </div>
        </div>
      )}

      {/* Anchored / Inline Recommendations Panel matching Find a Setting */}
      <div
        data-lenis-prevent
        id={listboxId}
        role="listbox"
        aria-label={idleHeading}
        aria-hidden={!panelVisible}
        inert={!panelVisible}
        className={cn(
          "rounded-sm bg-(--bg-surface-elevated) border border-(--border-strong) shadow-[0_18px_40px_rgba(0,0,0,0.22)] overflow-hidden",
          panelMode === "floating"
            ? cn(
                "absolute left-0 right-0 top-full mt-2 z-50 origin-top transition-[opacity,transform] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                panelVisible
                  ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                  : "opacity-0 -translate-y-2 scale-[0.985] pointer-events-none"
              )
            : "mt-3 w-full",
          panelClassName
        )}
      >
        <div className="px-3.5 py-2 border-b border-(--border-subtle) flex items-center justify-between gap-2 bg-(--bg-surface-2)">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted) truncate">
            {headerStatusText}
          </span>
          <span className="hidden sm:inline text-[10px] font-mono text-(--text-muted) shrink-0">
            ↑↓ Navigate · Enter Open · Esc Close
          </span>
        </div>

        <div
          ref={dropdownFrameRef}
          data-lenis-prevent
          className="lou-scrollarea overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          <div
            ref={dropdownInnerRef}
            className="divide-y divide-(--border-subtle)"
          >
            {activeItems.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-(--text-muted)">
                No workspace matches found. Try searching a section, field label, or setting keyword.
              </div>
            ) : (
              activeItems.map((item, idx) => {
                const isSelected = idx === highlightedIdx;
                return (
                  <button
                    key={item.id}
                    id={`${listboxId}-option-${idx}`}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    data-rec-row="true"
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={panelVisible ? 0 : -1}
                    onMouseEnter={() => setRawHighlightedIdx(idx)}
                    onMouseDown={(e) => {
                      // Avoid losing input focus before click handler runs
                      e.preventDefault();
                    }}
                    onClick={() => handleSelectRow(item)}
                    className={cn(
                      "w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors duration-150 cursor-pointer",
                      isSelected
                        ? "bg-(--bg-badge-highlight)"
                        : "hover:bg-(--bg-surface-2)"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-7.5 h-7.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex items-center justify-center shrink-0 text-(--text-accent)">
                        {item.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-(--text-primary) truncate">
                          {renderHighlightedSearchText(item.title, value)}
                        </p>
                        <p className="text-[11px] text-(--text-muted) truncate">
                          {renderHighlightedSearchText(item.subtitle, value)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.badge && (
                        <StatusPill
                          label={item.badge}
                          variant={item.badgeVariant || "neutral"}
                          size="xs"
                          className="hidden sm:inline-flex"
                        />
                      )}
                      <ChevronRight
                        className="w-3.5 h-3.5 text-(--text-muted)"
                        aria-hidden="true"
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

