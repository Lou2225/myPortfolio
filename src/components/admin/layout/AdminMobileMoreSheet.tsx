"use client";

import { useEffect, useRef } from "react";
import { ChevronRight, ExternalLink, X } from "lucide-react";
import { usePresenceTransition } from "@/lib/usePresenceTransition";
import { AdminNavItem, AdminTab } from "./types";
import { cn } from "@/lib/utils";

export interface AdminMobileMoreSheetProps {
  open: boolean;
  items: AdminNavItem[];
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onOpenPublicPortfolio: () => void;
  onClose: () => void;
}

const SHEET_EXIT_MS = 220;

/**
 * GPU-accelerated mobile upward sheet triggered from the `More` dock button.
 * Houses secondary CMS modules (`Story`, `Skills`, `Settings`) plus a one-tap
 * redirect back to the live Public Portfolio (`/`).
 */
export function AdminMobileMoreSheet({
  open,
  items,
  activeTab,
  onSelectTab,
  onOpenPublicPortfolio,
  onClose,
}: AdminMobileMoreSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { mounted, visible } = usePresenceTransition(
    open,
    SHEET_EXIT_MS,
    panelRef
  );

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

  if (!mounted) return null;

  return (
    <>
      {/* Isolated GPU-promoted Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ transform: "translateZ(0)" }}
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/55 backdrop-blur-xs transition-opacity duration-220 ease-out will-change-[opacity]",
          visible
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
      />

      {/* Upward Slide Sheet above Dock */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="More CMS Modules and Live Portfolio"
        style={{ backfaceVisibility: "hidden" }}
        className={cn(
          "md:hidden fixed inset-x-3 bottom-21 z-45 rounded-2xl bg-(--bg-surface) border border-(--border-strong) shadow-[0_20px_50px_rgba(0,0,0,0.55)] overflow-hidden transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.34,1.35,0.64,1)] will-change-[transform,opacity]",
          visible
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 translate-y-4 scale-[0.97] pointer-events-none"
        )}
      >
        <div className="px-4 py-3 border-b border-(--border-subtle) bg-(--bg-surface-2)/75 flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-(--text-muted)">
            More Modules &amp; Live Site
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close more navigation menu"
            className="h-7 w-7 rounded-full border border-(--border-subtle) bg-(--bg-surface) hover:border-brand text-(--text-muted) hover:text-(--text-primary) inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-2.5 space-y-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className={cn(
                  "w-full rounded-xl p-2.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer active:scale-[0.99]",
                  isSelected
                    ? "bg-(--bg-badge-highlight) border border-brand/45"
                    : "hover:bg-(--bg-surface-2) border border-transparent"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={cn(
                      "w-9 h-9 rounded-(--radius-control) border flex items-center justify-center shrink-0",
                      isSelected
                        ? "bg-brand text-brand-contrast border-brand"
                        : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-accent)"
                    )}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium truncate",
                        isSelected ? "text-(--text-accent)" : "text-(--text-primary)"
                      )}
                    >
                      {item.label}
                    </p>
                    <p className="text-[11px] text-(--text-muted) truncate">
                      {item.description}
                    </p>
                  </div>
                </div>

                <ChevronRight
                  className={cn(
                    "w-4 h-4 shrink-0",
                    isSelected ? "text-(--text-accent)" : "text-(--text-muted)"
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        <div className="px-2.5 pb-2.5 pt-2 border-t border-(--border-subtle)">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPublicPortfolio();
            }}
            className="w-full rounded-full px-4 py-2.5 bg-(--bg-badge-highlight) hover:bg-brand/20 border border-brand/45 hover:border-brand text-(--text-primary) flex items-center justify-between gap-3 transition-colors cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ExternalLink
                className="w-4 h-4 text-(--text-accent) shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs font-mono uppercase tracking-[0.14em] font-semibold truncate">
                View Public Portfolio
              </span>
            </div>
            <span className="text-[10px] font-mono text-(--text-accent) shrink-0">
              / Live
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
