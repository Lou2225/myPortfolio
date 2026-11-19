"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  PenLine,
  Radio,
  WifiOff,
  X,
} from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { useOfflineStatus } from "@/components/pwa/OfflineManager";
import { MonogramBadge } from "@/components/common/MonogramBadge";
import { Magnetic } from "@/components/motion/Magnetic";
import { shouldReduceMotion } from "@/lib/appearance";
import {
  BrandPortalTone,
  announceBrandPortalStatus,
  dismissBrandPortalNotice,
  formatPortalTimestamp,
  getBrandPortalToneTheme,
  useBrandPortalStatus,
} from "@/lib/brandPortalStatus";
import { cn } from "@/lib/utils";

export interface BrandPortalOrbProps {
  logoButtonRef: React.RefObject<HTMLDivElement | null>;
  isAdminRoute: boolean;
  isRegisteredDevice: boolean;
  isAnimating: boolean;
  isSlideTransition?: boolean;
  onOrbAction: () => void;
  onOrbLongPress?: () => void;
}

function StatusGlyph({
  tone,
  className,
}: {
  tone: BrandPortalTone;
  className?: string;
}) {
  switch (tone) {
    case "saving":
      return <Loader2 className={cn("w-3.5 h-3.5 animate-spin", className)} />;
    case "live":
      return <Radio className={cn("w-3.5 h-3.5", className)} />;
    case "synced":
      return <CheckCircle2 className={cn("w-3.5 h-3.5", className)} />;
    case "draft":
      return <PenLine className={cn("w-3.5 h-3.5", className)} />;
    case "offline":
      return <WifiOff className={cn("w-3.5 h-3.5", className)} />;
    case "error":
      return <AlertCircle className={cn("w-3.5 h-3.5", className)} />;
  }
}

export function BrandPortalOrb({
  logoButtonRef,
  isAdminRoute,
  isRegisteredDevice,
  isAnimating,
  isSlideTransition = false,
  onOrbAction,
  onOrbLongPress,
}: BrandPortalOrbProps) {
  const { profile, updatedAt } = usePortfolio();
  const {
    isOnline,
    pendingOutboxCount,
    lastSyncedOutboxCount,
    dismissSyncNotice,
  } = useOfflineStatus();
  const { workspace, meta, notice } = useBrandPortalStatus();

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const haloRef = useRef<HTMLSpanElement>(null);
  const textSlotRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOnlineRef = useRef(isOnline);
  const prevNoticeIdRef = useRef<number | null>(null);

  const monogram = profile?.monogram || "LDV";

  // Bridge global network transitions & queued outbox sync notices into Brand Portal
  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    if (wasOnline === isOnline) return;
    prevOnlineRef.current = isOnline;

    const rafId = requestAnimationFrame(() => {
      if (!isOnline) {
        announceBrandPortalStatus({
          tone: "offline",
          label: "Offline Mode",
          detail: isAdminRoute
            ? "Reconnect to save changes"
            : pendingOutboxCount > 0
            ? `Cached · ${pendingOutboxCount} queued`
            : "Viewing cached portfolio",
          durationMs: 3600,
        });
      } else if (lastSyncedOutboxCount === 0) {
        announceBrandPortalStatus({
          tone: "live",
          label: "Back Online",
          detail: "Connection restored",
          durationMs: 2800,
        });
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [isOnline, isAdminRoute, pendingOutboxCount, lastSyncedOutboxCount]);

  useEffect(() => {
    if (!isOnline || lastSyncedOutboxCount <= 0) return;

    const count = lastSyncedOutboxCount;
    const rafId = requestAnimationFrame(() => {
      announceBrandPortalStatus({
        tone: "live",
        label: "Message Synced",
        detail: `Sent ${count} queued inquiry${count > 1 ? "s" : ""}`,
        durationMs: 4200,
      });
      dismissSyncNotice();
    });

    return () => cancelAnimationFrame(rafId);
  }, [isOnline, lastSyncedOutboxCount, dismissSyncNotice]);

  // Ambient steady-state status shown on the orb dot + hover/focus peek
  const publishedIso = meta.lastPublishedAt || updatedAt;
  const formattedTime = formatPortalTimestamp(publishedIso);

  let ambientTone: BrandPortalTone = "live";
  let ambientLabel = "Portfolio Live";
  let ambientDetail = isRegisteredDevice
    ? "Click orb to open CMS"
    : profile?.contact?.status?.trim() || "Systems operational";

  if (!isOnline) {
    ambientTone = "offline";
    ambientLabel = "Offline Mode";
    ambientDetail = isAdminRoute
      ? "Reconnect to save changes"
      : pendingOutboxCount > 0
      ? `Cached · ${pendingOutboxCount} queued`
      : "Viewing cached portfolio";
  } else if (isAdminRoute) {
    if (workspace.saving) {
      ambientTone = "saving";
      ambientLabel = "Publishing...";
      ambientDetail = workspace.moduleLabel
        ? `Syncing ${workspace.moduleLabel} live`
        : "Saving changes live";
    } else if (workspace.hasUnsavedChanges) {
      ambientTone = "draft";
      ambientLabel = "Unsaved Draft";
      ambientDetail = workspace.moduleLabel
        ? `${workspace.moduleLabel} · Save to publish`
        : "Save & Publish to go live";
    } else {
      ambientTone = "synced";
      ambientLabel = "Synced & Live";
      ambientDetail = formattedTime
        ? `Updated ${formattedTime}`
        : "Portfolio up to date";
    }
  }

  // Active status resolves transient notice first, otherwise ambient steady state
  const activeTone: BrandPortalTone = notice ? notice.tone : ambientTone;
  const activeLabel = notice ? notice.label : ambientLabel;
  const activeDetail = notice ? notice.detail : ambientDetail;
  const activeDisplayKey = notice
    ? `notice-${notice.id}`
    : `ambient-${ambientTone}-${ambientLabel}`;

  const isExpanded = Boolean(notice) || hovered || focused;
  const theme = getBrandPortalToneTheme(activeTone);

  // Auto-collapse transient notices after durationMs (pauses while hovered/focused)
  useEffect(() => {
    if (!notice || notice.durationMs <= 0) return;
    if (hovered || focused) return;

    const timerId = setTimeout(() => {
      dismissBrandPortalNotice(notice.id);
    }, notice.durationMs);

    return () => clearTimeout(timerId);
  }, [notice, hovered, focused]);

  // Clean hover & long-press timers on unmount
  useEffect(() => {
    return () => {
      if (hoverCloseTimerRef.current) {
        clearTimeout(hoverCloseTimerRef.current);
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    if (canNavigate || isAnimating || !onOrbLongPress) return;
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      onOrbLongPress();
    }, 650);
  };

  // Kinetic GSAP orb spring + halo pulse whenever a new status notice is announced
  const activeNoticeId = notice?.id ?? null;

  useEffect(() => {
    if (activeNoticeId === null || prevNoticeIdRef.current === activeNoticeId) {
      return;
    }
    prevNoticeIdRef.current = activeNoticeId;

    if (shouldReduceMotion()) {
      return;
    }

    const orbEl = logoButtonRef.current;
    const haloEl = haloRef.current;
    const slotEl = textSlotRef.current;
    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    void import("gsap").then(({ default: gsap }) => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        if (orbEl && !isAnimating) {
          gsap.fromTo(
            orbEl,
            { scale: 0.9 },
            {
              scale: 1,
              duration: 0.48,
              ease: "elastic.out(1, 0.55)",
              overwrite: "auto",
            }
          );
        }

        if (haloEl) {
          gsap.fromTo(
            haloEl,
            { scale: 0.92, opacity: 0.85 },
            {
              scale: 1.72,
              opacity: 0,
              duration: 0.65,
              ease: "power3.out",
              overwrite: "auto",
            }
          );
        }

        if (slotEl) {
          gsap.fromTo(
            slotEl,
            { opacity: 0, x: -6 },
            {
              opacity: 1,
              x: 0,
              duration: 0.24,
              ease: "power2.out",
              overwrite: "auto",
            }
          );
        }
      });
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [activeNoticeId, logoButtonRef, isAnimating]);

  const handlePointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    setHovered(true);
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
    }
    hoverCloseTimerRef.current = setTimeout(() => {
      setHovered(false);
    }, 150);
  };

  const orbAriaLabel = isRegisteredDevice
    ? isAdminRoute
      ? `Return to Public Portfolio (${activeLabel})`
      : `Open Portfolio Manager (${activeLabel})`
    : activeLabel;

  const canNavigate = isRegisteredDevice;
  const showDesktopAdmin = isAdminRoute;
  const showMobileAdmin =
    isAdminRoute && ((isAnimating && !isSlideTransition) || isExpanded);

  const orbZIndex = isSlideTransition
    ? 140
    : isAdminRoute || isAnimating
    ? 9995
    : 140;

  return (
    <div
      style={{ zIndex: orbZIndex }}
      className={cn(
        "fixed left-4 items-center select-none pointer-events-none transition-[opacity,transform] duration-220 ease-out",
        isSlideTransition && "opacity-0 scale-95",
        showDesktopAdmin ? "bottom-22 md:bottom-4" : "bottom-4",
        showDesktopAdmin
          ? showMobileAdmin
            ? "flex"
            : "hidden md:flex"
          : "flex"
      )}
    >
      <div
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        className="relative inline-flex items-center pointer-events-auto"
      >
        {/* Local Radial Status Halo Wave */}
        <span
          ref={haloRef}
          aria-hidden="true"
          style={{
            border: `2px solid ${theme.haloColor}`,
            boxShadow: theme.haloGlow,
          }}
          className="pointer-events-none absolute left-0 top-0 w-10 h-10 rounded-full opacity-0 will-change-transform"
        />

        {/* Unified Dynamic-Island Capsule */}
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex items-center h-10 rounded-full bg-(--bg-surface) border shadow-[0_10px_30px_rgba(0,0,0,0.42)] transition-[border-color,box-shadow] duration-300",
            theme.capsuleBorderClass
          )}
        >
          {/* Left: 40x40 Circular Brand Monogram Orb */}
          <div
            ref={logoButtonRef}
            onPointerDown={startLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onClick={
              canNavigate && !isAnimating
                ? (e) => {
                    e.currentTarget.blur();
                    setFocused(false);
                    setHovered(false);
                    onOrbAction();
                  }
                : undefined
            }
            role={canNavigate ? "button" : undefined}
            tabIndex={canNavigate ? 0 : undefined}
            onFocus={canNavigate ? () => setFocused(true) : undefined}
            onBlur={canNavigate ? () => setFocused(false) : undefined}
            onKeyDown={
              canNavigate
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOrbAction();
                    }
                  }
                : undefined
            }
            aria-label={canNavigate ? orbAriaLabel : undefined}
            className={cn(
              "relative w-10 h-10 rounded-full shrink-0 flex items-center justify-center p-0.5 will-change-transform transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              canNavigate && !isAnimating
                ? "cursor-pointer hover:scale-105 active:scale-95"
                : "cursor-default"
            )}
          >
            <MonogramBadge
              monogram={monogram}
              imageUrl={profile?.monogramImageUrl}
              transform={profile?.monogramTransform}
              alt="Brand portal monogram"
              className="w-full h-full rounded-full font-display text-xs tracking-wider text-(--text-primary)"
            />

            {/* Orbital Spinner Ring while Publishing/Saving */}
            {activeTone === "saving" && (
              <span
                aria-hidden="true"
                className="pointer-events-none -inset-0.5 absolute rounded-full border-2 border-transparent border-t-brand border-r-brand/40 animate-spin"
              />
            )}

            {/* Ambient Corner Status Dot */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-(--bg-surface) transition-colors duration-300",
                theme.dotBgClass
              )}
            >
              {theme.shouldPulseDot && (
                <span
                  className={cn(
                    "absolute inset-0 rounded-full animate-ping opacity-75",
                    theme.dotBgClass
                  )}
                />
              )}
            </span>
          </div>

          {/* Right: Morphing Status Drawer (`grid-template-columns: 0fr -> 1fr`) */}
          <div
            className={cn(
              "grid transition-[grid-template-columns,opacity,padding] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isExpanded
                ? "grid-cols-[1fr] opacity-100 pl-2 pr-3"
                : "grid-cols-[0fr] opacity-0 pl-0 pr-0 pointer-events-none"
            )}
          >
            <div className="overflow-hidden min-w-0 flex items-center gap-2.5 whitespace-nowrap">
              <div
                ref={textSlotRef}
                key={activeDisplayKey}
                onClick={
                  canNavigate && !isAnimating
                    ? () => {
                        setFocused(false);
                        setHovered(false);
                        onOrbAction();
                      }
                    : undefined
                }
                className={cn(
                  "flex items-center gap-2 min-w-0",
                  canNavigate && !isAnimating && "cursor-pointer"
                )}
              >
                <StatusGlyph
                  tone={activeTone}
                  className={cn("shrink-0", theme.iconClass)}
                />

                <div className="flex flex-col leading-tight min-w-0">
                  <span
                    className={cn(
                      "text-[10px] font-mono uppercase tracking-[0.15em] font-semibold",
                      theme.textClass
                    )}
                  >
                    {activeLabel}
                  </span>
                  {activeDetail && (
                    <span
                      suppressHydrationWarning
                      className="text-[10px] text-(--text-muted) truncate max-w-44 sm:max-w-56"
                    >
                      {activeDetail}
                    </span>
                  )}
                </div>
              </div>

              {/* Navigation Pill on Registered Idle Hover */}
              {!notice && isRegisteredDevice && (
                <Magnetic strength={0.18}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAnimating) onOrbAction();
                    }}
                    aria-label={isAdminRoute ? "Go to Public Site" : "Open CMS"}
                    className="ml-0.5 pl-2 border-l border-(--border-subtle) inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-(--text-muted) hover:text-(--text-primary) cursor-pointer transition-colors"
                  >
                    <span>{isAdminRoute ? "SITE" : "CMS"}</span>
                    <ArrowUpRight className="w-3 h-3 text-(--text-accent)" />
                  </button>
                </Magnetic>
              )}

              {/* Dismiss Button for Active Notices (except ongoing "saving") */}
              {notice && notice.durationMs > 0 && (
                <Magnetic strength={0.2}>
                  <button
                    type="button"
                    onClick={() => dismissBrandPortalNotice(notice.id)}
                    aria-label="Dismiss status notification"
                    className="ml-0.5 p-1 rounded-full text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-surface-2) cursor-pointer transition-all active:scale-95"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Magnetic>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
