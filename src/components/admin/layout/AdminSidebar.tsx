"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  onCollapse?: () => void;
}

/**
 * Unified Sculpted Vertical Sidebar
 * The top and bottom S-curves are part of one continuous SVG container silhouette
 * (`M 0 0 C 0 52, 100 40, 100 96 L 100 904 C 100 960, 0 948, 0 1000 Z`)
 * with a spring-animated active squircle indicator, scroll-safe compact height mode
 * for zoomed/short viewports, and floating overlay expansion on `md` (`768px–1023px`).
 */
export function AdminSidebar({
  items,
  activeTab,
  onSelectTab,
  expanded,
  onToggleExpand,
  onCollapse,
}: AdminSidebarProps) {
  const gradientId = useId();
  const navRef = useRef<HTMLElement>(null);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.id === activeTab)
  );

  // Dynamic measurement on the untransformed direct child slot of <nav> keeps the sliding
  // active squircle locked onto the active button without being zeroed out by <Magnetic>'s transform.
  const [indicatorMetric, setIndicatorMetric] = useState<{
    top: number;
    height: number;
  } | null>(null);

  const syncIndicator = useCallback(() => {
    const activeSlot = slotRefs.current[activeTab];
    if (!activeSlot) return;
    const nextTop = activeSlot.offsetTop;
    const nextHeight = activeSlot.offsetHeight;
    if (nextHeight <= 0) return;
    setIndicatorMetric((prev) =>
      prev && prev.top === nextTop && prev.height === nextHeight
        ? prev
        : { top: nextTop, height: nextHeight }
    );
  }, [activeTab]);

  useEffect(() => {
    const rafId = requestAnimationFrame(syncIndicator);
    const navEl = navRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" && navEl
        ? new ResizeObserver(() => syncIndicator())
        : null;
    if (ro && navEl) {
      ro.observe(navEl);
    }
    window.addEventListener("resize", syncIndicator, { passive: true });
    window.visualViewport?.addEventListener("resize", syncIndicator, {
      passive: true,
    });
    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener("resize", syncIndicator);
      window.visualViewport?.removeEventListener("resize", syncIndicator);
    };
  }, [syncIndicator, items.length, expanded]);

  const handleTabClick = (tab: AdminTab) => {
    onSelectTab(tab);
    if (
      expanded &&
      typeof window !== "undefined" &&
      window.innerWidth < 1024
    ) {
      if (onCollapse) {
        onCollapse();
      } else {
        onToggleExpand();
      }
    }
  };

  const indicatorTop = indicatorMetric?.top ?? activeIndex * 52;
  const indicatorHeight = indicatorMetric?.height ?? 44;

  return (
    <>
      {/* Dismissible backdrop when expanded as a floating overlay rail on md (768px–1023px / zoomed laptop) */}
      {expanded && (
        <div
          aria-hidden="true"
          onClick={() => (onCollapse ? onCollapse() : onToggleExpand())}
          className="hidden md:block lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px]"
        />
      )}

      <aside
        aria-label="Portfolio CMS Module Rail"
        className="hidden md:flex fixed left-0 top-16 bottom-10 [@media(min-height:680px)]:bottom-14 [@media(max-height:640px)]:bottom-2 z-40 flex-col items-start justify-center pointer-events-none select-none"
      >
        {/* Unified Sculpted Sidebar Container (Curves are integral to the container body) */}
        <div
          className={cn(
            "pointer-events-auto relative flex flex-col justify-between pt-8 pb-8 lg:pt-11 lg:pb-11 [@media(max-height:640px)]:pt-5 [@media(max-height:640px)]:pb-5 px-3 text-brand-contrast drop-shadow-[10px_14px_34px_var(--accent-glow)] transition-[width] duration-420 ease-[cubic-bezier(0.22,1,0.36,1)] max-h-full will-change-[width]",
            expanded ? "w-57" : "w-17"
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
            className="w-6 h-1 rounded-full bg-white/35 mx-auto mb-2.5 [@media(max-height:640px)]:mb-1.5 shrink-0"
          />

          {/* Module Navigation Stack with Shared Sliding Active Indicator & True Vertical Scrolling */}
          <ScrollArea
            maxHeight="calc(100dvh - 11rem)"
            scrollbarVariant="hidden"
            fadeEdges={false}
            className="my-auto w-[calc(100%+1rem)] -mx-2"
            viewportClassName="py-1.5 px-2"
          >
            <nav
              ref={navRef}
              className="relative flex flex-col gap-2 [@media(max-height:640px)]:gap-1.5 w-full"
            >
              {/* Shared GPU-Accelerated Active Squircle Indicator */}
              <div
                aria-hidden="true"
                style={{
                  transform: `translate3d(0, ${indicatorTop}px, 0)`,
                  height: `${indicatorHeight}px`,
                }}
                className={cn(
                  "pointer-events-none absolute top-0 left-0 rounded-2xl bg-(--bg-surface) shadow-[0_8px_22px_rgba(0,0,0,0.35)] [transition:transform_500ms_cubic-bezier(0.34,1.56,0.64,1),width_420ms_cubic-bezier(0.22,1,0.36,1),height_220ms_ease] will-change-transform",
                  expanded ? "w-full" : "w-11"
                )}
              />

              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <div
                    key={item.id}
                    ref={(el) => {
                      slotRefs.current[item.id] = el;
                    }}
                    className="w-full"
                  >
                    <Tooltip
                      label={item.label}
                      badge={item.badge}
                      side="right"
                      disabled={expanded}
                      className="w-full"
                    >
                      <Magnetic strength={expanded ? 0.08 : 0.2} fullWidth>
                        <button
                          type="button"
                          onClick={() => handleTabClick(item.id)}
                          aria-label={item.label}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "relative z-10 h-11 [@media(max-height:640px)]:h-9.5 w-full rounded-2xl flex items-center justify-start transition-colors duration-200 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                            isActive
                              ? "text-(--text-accent) font-semibold"
                              : "text-brand-contrast/90 hover:text-brand-contrast hover:bg-white/12"
                          )}
                        >
                          {/* Fixed 44px Icon Track prevents icons from snapping horizontally on expand/collapse */}
                          <span className="relative w-11 h-full shrink-0 flex items-center justify-center">
                            <Icon
                              className={cn(
                                "w-5 h-5 [@media(max-height:640px)]:w-4.5 [@media(max-height:640px)]:h-4.5 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                                isActive ? "scale-110 text-(--text-accent)" : "text-brand-contrast"
                              )}
                            />

                            {item.badge !== undefined && (
                              <BadgeCounter
                                count={item.badge}
                                size="sm"
                                floating
                                onAccentSurface={!isActive}
                                variant={isActive ? "inverted" : "alert"}
                                className={cn(
                                  "pointer-events-none transition-[opacity,transform] duration-200 ease-out",
                                  expanded
                                    ? "opacity-0 scale-75"
                                    : "opacity-100 scale-100"
                                )}
                              />
                            )}
                          </span>

                          {/* Inline Label & Badge smoothly fade & glide alongside container expansion */}
                          <span
                            aria-hidden={!expanded}
                            className={cn(
                              "flex items-center gap-2 min-w-0 flex-1 overflow-hidden transition-[opacity,transform,max-width,padding] duration-360 ease-[cubic-bezier(0.22,1,0.36,1)]",
                              expanded
                                ? "opacity-100 translate-x-0 max-w-44 pr-2.5"
                                : "opacity-0 -translate-x-2 max-w-0 pr-0 pointer-events-none"
                            )}
                          >
                            <span
                              className={cn(
                                "text-xs tracking-wide whitespace-nowrap truncate flex-1 text-left transition-colors duration-200",
                                isActive
                                  ? "text-(--text-accent) font-semibold"
                                  : "text-brand-contrast"
                              )}
                            >
                              {item.label}
                            </span>

                            {item.badge !== undefined && (
                              <BadgeCounter
                                count={item.badge}
                                size="sm"
                                onAccentSurface={!isActive}
                                variant={isActive ? "inverted" : "alert"}
                              />
                            )}
                          </span>
                        </button>
                      </Magnetic>
                    </Tooltip>
                  </div>
                );
              })}
            </nav>
          </ScrollArea>

          {/* Bottom Expand / Collapse Toggle Button */}
          <div className="mt-2.5 [@media(max-height:640px)]:mt-1.5 pt-2 [@media(max-height:640px)]:pt-1.5 border-t border-white/15 shrink-0">
            <Tooltip
              label={expanded ? "Collapse Sidebar" : "Expand Sidebar"}
              side="right"
              disabled={expanded}
              className="w-full"
            >
              <Magnetic strength={expanded ? 0.08 : 0.2} fullWidth>
                <button
                  type="button"
                  onClick={onToggleExpand}
                  aria-label={expanded ? "Collapse Sidebar" : "Expand Sidebar"}
                  className="h-9 [@media(max-height:640px)]:h-8 w-full rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors duration-200 active:scale-95 flex items-center justify-start overflow-hidden cursor-pointer"
                >
                  <span className="relative w-11 h-full shrink-0 flex items-center justify-center">
                    <PanelLeftOpen
                      className={cn(
                        "w-4 h-4 absolute transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        expanded ? "opacity-0 scale-75 rotate-12" : "opacity-100 scale-100 rotate-0"
                      )}
                      aria-hidden="true"
                    />
                    <PanelLeftClose
                      className={cn(
                        "w-4 h-4 absolute transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        expanded ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-75 -rotate-12"
                      )}
                      aria-hidden="true"
                    />
                  </span>

                  <span
                    aria-hidden={!expanded}
                    className={cn(
                      "text-[11px] font-mono uppercase tracking-wider whitespace-nowrap overflow-hidden transition-[opacity,transform,max-width,padding] duration-360 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      expanded
                        ? "opacity-100 translate-x-0 max-w-36 pr-3"
                        : "opacity-0 -translate-x-2 max-w-0 pr-0 pointer-events-none"
                    )}
                  >
                    Collapse Rail
                  </span>
                </button>
              </Magnetic>
            </Tooltip>
          </div>
        </div>
      </aside>
    </>
  );
}
