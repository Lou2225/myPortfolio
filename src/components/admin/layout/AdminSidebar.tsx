"use client";

import { useId } from "react";
import { AdminNavItem, AdminTab } from "./types";
import { Tooltip } from "@/components/ui/Tooltip";
import { BadgeCounter } from "@/components/ui/BadgeCounter";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Magnetic } from "@/components/motion/Magnetic";
import { PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminSidebarProps {
  items: AdminNavItem[];
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

/**
 * Unified Sculpted Vertical Sidebar
 * The top and bottom S-curves are part of one continuous SVG container silhouette
 * (`M 0 0 C 0 52, 100 40, 100 96 L 100 904 C 100 960, 0 948, 0 1000 Z`)
 * with a spring-animated active squircle indicator and Expand/Collapse mode.
 */
export function AdminSidebar({
  items,
  activeTab,
  onSelectTab,
  expanded,
  onToggleExpand,
}: AdminSidebarProps) {
  const gradientId = useId();
  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.id === activeTab)
  );

  // Each button is 44px (h-11) + 8px (gap-2) = 52px vertical stride
  const ITEM_STRIDE_PX = 52;

  return (
    <aside
      aria-label="Portfolio CMS Module Rail"
      className="hidden md:flex fixed left-0 top-14 bottom-14 z-40 flex-col items-start justify-center pointer-events-none select-none"
    >
      {/* Unified Sculpted Sidebar Container (Curves are integral to the container body) */}
      <div
        className={cn(
          "pointer-events-auto relative flex flex-col justify-between pt-12 pb-12 px-2.5 text-brand-contrast drop-shadow-[10px_14px_34px_var(--accent-glow)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          expanded ? "w-57" : "w-17 lg:w-18.5"
        )}
      >
        {/* Continuous One-Piece Sculpted S-Curve SVG Body & Specular Border */}
        <svg
          aria-hidden="true"
          viewBox="0 0 100 1000"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 w-full h-full -z-10 overflow-visible"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="52%" stopColor="var(--accent-hover)" />
              <stop offset="100%" stopColor="var(--accent-deep)" />
            </linearGradient>
          </defs>

          {/* Unified Fill Shape (Top S-Curve -> Straight Right Wall -> Bottom S-Curve) */}
          <path
            d="M 0 0 C 0 54, 100 38, 100 98 L 100 902 C 100 962, 0 946, 0 1000 L 0 0 Z"
            fill={`url(#${gradientId})`}
          />

          {/* Continuous 1px Specular Highlight along the Sculpted Right Edge */}
          <path
            d="M 0 0 C 0 54, 100 38, 100 98 L 100 902 C 100 962, 0 946, 0 1000"
            fill="none"
            stroke="rgba(255, 255, 255, 0.24)"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Top decorative inner pill */}
        <div
          aria-hidden="true"
          className="w-6 h-1 rounded-full bg-white/35 mx-auto mb-3 shrink-0"
        />

        {/* Module Navigation Stack with Shared Sliding Active Indicator & ScrollArea */}
        <ScrollArea
          maxHeight="calc(100vh - 230px)"
          scrollbarVariant="hidden"
          fadeEdges={false}
          className="my-auto w-full"
          viewportClassName="overflow-visible"
        >
          <nav className="relative flex flex-col gap-2 w-full">
            {/* Shared GPU-Accelerated Active Squircle Indicator (Drops Down / Glides Up) */}
            <div
              aria-hidden="true"
              style={{
                transform: `translate3d(0, ${activeIndex * ITEM_STRIDE_PX}px, 0)`,
              }}
              className={cn(
                "pointer-events-none absolute top-0 left-0 right-0 h-11 rounded-2xl bg-(--bg-surface) shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform",
                !expanded && "w-11 lg:w-12 mx-auto"
              )}
            />

            {items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <Tooltip
                  key={item.id}
                  label={item.label}
                  badge={item.badge}
                  side="right"
                  disabled={expanded}
                  className="w-full justify-center"
                >
                  <Magnetic strength={expanded ? 0.08 : 0.2} fullWidth={expanded}>
                    <button
                      type="button"
                      onClick={() => onSelectTab(item.id)}
                      aria-label={item.label}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative z-10 h-11 rounded-2xl flex items-center transition-all duration-200 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                        expanded
                          ? "w-full px-3 gap-3 justify-start"
                          : "w-11 lg:w-12 justify-center mx-auto",
                        isActive
                          ? "text-(--text-accent) font-semibold"
                          : "text-brand-contrast/90 hover:text-brand-contrast hover:bg-white/12"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-5 h-5 shrink-0 transition-transform duration-300",
                          isActive ? "scale-110 text-(--text-accent)" : "text-brand-contrast"
                        )}
                      />

                      {/* Inline Label when Expanded */}
                      {expanded && (
                        <span
                          className={cn(
                            "text-xs tracking-wide truncate flex-1 text-left transition-colors duration-200",
                            isActive
                              ? "text-(--text-accent) font-semibold"
                              : "text-brand-contrast"
                          )}
                        >
                          {item.label}
                        </span>
                      )}

                      {/* Reusable Unified Theme-Proof Badge Counter */}
                      {item.badge !== undefined && (
                        <BadgeCounter
                          count={item.badge}
                          size="sm"
                          floating={!expanded}
                          onAccentSurface={!isActive}
                          variant={isActive ? "inverted" : "alert"}
                        />
                      )}
                    </button>
                  </Magnetic>
                </Tooltip>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Bottom Expand / Collapse Toggle Button */}
        <div className="mt-3 pt-2 border-t border-white/15 flex justify-center">
          <Tooltip
            label={expanded ? "Collapse Sidebar" : "Expand Sidebar"}
            side="right"
            disabled={expanded}
            className="w-full justify-center"
          >
            <Magnetic strength={expanded ? 0.08 : 0.2} fullWidth={expanded}>
              <button
                type="button"
                onClick={onToggleExpand}
                aria-label={expanded ? "Collapse Sidebar" : "Expand Sidebar"}
                className={cn(
                  "h-9 rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-all active:scale-95 flex items-center cursor-pointer",
                  expanded
                    ? "w-full px-3 gap-2.5 justify-start"
                    : "w-9 justify-center"
                )}
              >
                {expanded ? (
                  <>
                    <PanelLeftClose className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] font-mono uppercase tracking-wider">
                      Collapse Rail
                    </span>
                  </>
                ) : (
                  <PanelLeftOpen className="w-4 h-4 shrink-0" />
                )}
              </button>
            </Magnetic>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
