"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { ArrowLeft, ChevronRight, Search, X } from "lucide-react";
import { shouldReduceMotion } from "@/lib/appearance";
import {
  createSearchRowStaggerTween,
  useIsomorphicLayoutEffect,
} from "@/lib/searchMotion";
import {
  renderHighlightedSearchText,
  type SearchCommandItem,
} from "@/components/ui/SearchCommandBar";
import type { GlobalSearchEntry } from "./globalSearchIndex";
import { cn } from "@/lib/utils";

export interface AdminMobileSearchViewProps {
  open: boolean;
  origin: { x: number; y: number } | null;
  query: string;
  onQueryChange: (next: string) => void;
  items: readonly SearchCommandItem<GlobalSearchEntry>[];
  fallbackItems: readonly SearchCommandItem<GlobalSearchEntry>[];
  onSelect: (item: SearchCommandItem<GlobalSearchEntry>) => void;
  onClose: () => void;
}

/**
 * Full-screen Facebook-style expanding Search page for mobile `/admin` viewports.
 * Smoothly expands from the navbar Search icon's coordinates using GPU-only
 * `transform` + `opacity` compositing and staggers recommendations top-to-bottom.
 */
export function AdminMobileSearchView({
  open,
  origin,
  query,
  onQueryChange,
  items,
  fallbackItems,
  onSelect,
  onClose,
}: AdminMobileSearchViewProps) {
  const [mounted, setMounted] = useState(open);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const shellRef = useRef<HTMLDivElement>(null);
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const inputPillRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const subheaderRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const originRef = useRef(origin);
  const didInitialRevealRef = useRef(false);
  const prevQueryRef = useRef(query);

  useIsomorphicLayoutEffect(() => {
    originRef.current = origin;
  }, [origin]);

  const normalizedQuery = query.trim().toLowerCase();
  const hasMatches = items.length > 0;
  const activeItems = hasMatches ? items : fallbackItems;
  const safeHighlightIdx = Math.min(
    highlightedIdx,
    Math.max(0, activeItems.length - 1)
  );

  // Mount portal cleanly when `open` turns true
  useEffect(() => {
    if (!open) return;
    didInitialRevealRef.current = false;
    const rafId = requestAnimationFrame(() => {
      setMounted(true);
      setHighlightedIdx(0);
    });
    return () => cancelAnimationFrame(rafId);
  }, [open]);

  // Synchronous pre-paint GSAP expand from Search icon + staggered reveal (and reverse on close)
  useIsomorphicLayoutEffect(() => {
    if (!mounted) return;
    const shellEl = shellRef.current;
    if (!shellEl) return;

    const reducedMotion = shouldReduceMotion();
    const ox = originRef.current?.x ?? Math.round(window.innerWidth * 0.35);
    const oy = originRef.current?.y ?? 32;

    if (open) {
      if (reducedMotion) {
        gsap.set(shellEl, { clearProps: "all", opacity: 1 });
        didInitialRevealRef.current = true;
        inputRef.current?.focus({ preventScroll: true });
        return;
      }

      const ctx = gsap.context(() => {
        const tl = gsap.timeline({
          onComplete: () => {
            didInitialRevealRef.current = true;
            inputRef.current?.focus({ preventScroll: true });
          },
        });

        tl.fromTo(
          shellEl,
          {
            opacity: 0,
            scale: 0.92,
            transformOrigin: `${ox}px ${oy}px`,
          },
          {
            opacity: 1,
            scale: 1,
            duration: 0.28,
            ease: "power3.out",
            force3D: true,
            clearProps: "transform,opacity,transformOrigin",
          },
          0
        );

        if (inputPillRef.current) {
          const pillRect = inputPillRef.current.getBoundingClientRect();
          const startShiftX = Math.max(-72, Math.min(48, ox - (pillRect.left + 20)));
          tl.fromTo(
            inputPillRef.current,
            {
              opacity: 0.2,
              x: startShiftX,
              scaleX: 0.24,
              transformOrigin: "left center",
            },
            {
              opacity: 1,
              x: 0,
              scaleX: 1,
              duration: 0.3,
              ease: "power3.out",
              force3D: true,
              clearProps: "transform,opacity,transformOrigin",
            },
            0.01
          );
        }

        if (backBtnRef.current) {
          tl.fromTo(
            backBtnRef.current,
            { opacity: 0, x: -10, scale: 0.85 },
            {
              opacity: 1,
              x: 0,
              scale: 1,
              duration: 0.22,
              ease: "power2.out",
              force3D: true,
              clearProps: "transform,opacity",
            },
            0.05
          );
        }

        if (subheaderRef.current) {
          tl.fromTo(
            subheaderRef.current,
            { opacity: 0, y: -6 },
            {
              opacity: 1,
              y: 0,
              duration: 0.2,
              ease: "power2.out",
              clearProps: "transform,opacity",
            },
            0.07
          );
        }

        const rowsTween = createSearchRowStaggerTween(listRef.current, {
          maxRows: 14,
          fromY: 12,
          duration: 0.26,
          stagger: 0.028,
        });
        if (rowsTween) {
          tl.add(rowsTween, 0.09);
        }
      }, shellEl);

      return () => {
        ctx.revert();
      };
    }

    didInitialRevealRef.current = false;

    if (reducedMotion) {
      const rafId = requestAnimationFrame(() => setMounted(false));
      return () => cancelAnimationFrame(rafId);
    }

    const tween = gsap.to(shellEl, {
      opacity: 0,
      scale: 0.94,
      transformOrigin: `${ox}px ${oy}px`,
      duration: 0.2,
      ease: "power2.in",
      force3D: true,
      onComplete: () => {
        setMounted(false);
      },
    });

    return () => {
      tween.kill();
    };
  }, [mounted, open]);

  // Synchronous pre-paint stagger when filtering live recommendations
  useIsomorphicLayoutEffect(() => {
    const prev = prevQueryRef.current;
    prevQueryRef.current = normalizedQuery;
    if (!open || !mounted || !didInitialRevealRef.current) return;
    if (prev === normalizedQuery) return;
    if (shouldReduceMotion()) return;

    const listEl = listRef.current;
    if (!listEl) return;

    const ctx = gsap.context(() => {
      createSearchRowStaggerTween(listEl, {
        maxRows: 12,
        fromY: 8,
        duration: 0.22,
        stagger: 0.022,
      });
    }, listEl);

    return () => ctx.revert();
  }, [normalizedQuery, open, mounted]);

  // Lock background scroll while full-screen search page is mounted
  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [mounted]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const headerStatusText = normalizedQuery
    ? hasMatches
      ? `Matches (${items.length})`
      : `No exact matches for "${query.trim()}"`
    : "Suggested Actions & Quick Jump";

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        activeItems.length === 0 ? 0 : (prev + 1) % activeItems.length
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        activeItems.length === 0
          ? 0
          : (prev - 1 + activeItems.length) % activeItems.length
      );
    } else if (e.key === "Enter" && activeItems[safeHighlightIdx]) {
      e.preventDefault();
      onSelect(activeItems[safeHighlightIdx]);
    }
  };

  return createPortal(
    <div
      ref={shellRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-mobile-search-title"
      data-lenis-prevent
      className={cn(
        "fixed inset-0 z-120 flex flex-col bg-(--bg-canvas) text-(--text-primary) will-change-transform",
        !open && "pointer-events-none"
      )}
    >
      <h2 id="admin-mobile-search-title" className="sr-only">
        Global CMS Search
      </h2>

      {/* Facebook-style Top Search App Bar */}
      <div className="h-16 px-3 border-b border-(--border-subtle) bg-(--bg-canvas) flex items-center gap-2 shrink-0">
        <button
          ref={backBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Back from global search"
          className="h-9.5 w-9.5 rounded-full inline-flex items-center justify-center text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-surface-2) active:scale-95 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="w-4.5 h-4.5" aria-hidden="true" />
        </button>

        {/* Expanding Search Pill Input */}
        <div ref={inputPillRef} className="relative flex-1 min-w-0">
          <Search
            className="w-4 h-4 text-(--text-accent) absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            id="admin-mobile-global-search"
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value.slice(0, 80));
              setHighlightedIdx(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search fields, settings, suggestions..."
            aria-label="Search CMS fields, settings, and suggestions"
            className="theme-input w-full h-10 rounded-full bg-(--bg-surface-2) border border-(--border-strong) focus:border-brand pl-9.5 pr-9 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none transition-colors"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                setHighlightedIdx(0);
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6.5 w-6.5 rounded-full bg-(--bg-surface) hover:bg-(--bg-badge-highlight) border border-(--border-subtle) text-(--text-muted) hover:text-(--text-primary) inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Results Header Strip */}
      <div
        ref={subheaderRef}
        className="px-4 py-2.5 border-b border-(--border-subtle) bg-(--bg-surface)/70 flex items-center justify-between gap-2 shrink-0"
      >
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted) truncate">
          {headerStatusText}
        </span>
        {activeItems.length > 0 && (
          <span className="text-[10px] font-mono text-(--text-muted) tabular-nums shrink-0">
            {activeItems.length} {activeItems.length === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {/* Full-Height Scrollable Results Page with Sequential Stagger Reveal */}
      <div
        ref={listRef}
        role="listbox"
        aria-label={headerStatusText}
        className="flex-1 overflow-y-auto lou-scrollarea overscroll-contain divide-y divide-(--border-subtle) pb-8"
      >
        {activeItems.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs text-(--text-muted)">
            No workspace matches found. Try searching a section, field label, or setting keyword.
          </div>
        ) : (
          activeItems.map((item, idx) => {
            const isSelected = idx === safeHighlightIdx;
            return (
              <button
                key={item.id}
                data-search-row="true"
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(item)}
                className={cn(
                  "w-full text-left px-4 py-3.5 flex items-center justify-between gap-3 transition-colors duration-150 cursor-pointer active:bg-(--bg-badge-highlight)",
                  isSelected
                    ? "bg-(--bg-surface-2)/70"
                    : "hover:bg-(--bg-surface-2)/50"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex items-center justify-center shrink-0 text-(--text-accent)">
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-(--text-primary) truncate">
                      {renderHighlightedSearchText(item.title, query)}
                    </p>
                    <p className="text-xs text-(--text-muted) truncate mt-0.5">
                      {renderHighlightedSearchText(item.subtitle, query)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.badge && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted)">
                      {item.badge}
                    </span>
                  )}
                  <ChevronRight
                    className="w-4 h-4 text-(--text-muted)"
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );
}
