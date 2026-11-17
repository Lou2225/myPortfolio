"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Palette,
  Moon,
  Sun,
  Sparkles,
  Check,
  Monitor,
  Type,
  LayoutGrid,
  Save,
  RotateCcw,
  Loader2,
  SlidersHorizontal,
  Gauge,
  RefreshCw,
} from "lucide-react";
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  FONT_PAIRINGS,
  RADIUS_PRESETS,
} from "@/data/appearance";
import {
  APPEARANCE_SYNC_EVENT,
  PRELOADER_SEEN_SESSION_KEY,
  applyAppearanceToDocument,
  getStoredDeviceMotionOverride,
  getStoredDeviceThemeOverride,
  normalizeHexColor,
  resolveEffectiveReducedMotion,
  resolveEffectiveTheme,
  sanitizeAppearanceConfig,
  setStoredDeviceMotionOverride,
  setStoredDeviceThemeOverride,
  type DeviceMotionOverride,
  type DeviceThemeOverride,
} from "@/lib/appearance";
import {
  announceBrandPortalStatus,
  useBrandPortalWorkspaceSync,
} from "@/lib/brandPortalStatus";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  isNetworkOffline,
  useOfflineStatus,
} from "@/components/pwa/OfflineManager";
import {
  useThemePreference,
  triggerThemePulseWave,
} from "@/components/ui/ThemeToggle";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { ColorPickerDropdown } from "@/components/ui/fields";
import { AppearancePreviewCard } from "./AppearancePreviewCard";
import type { SettingsFeedback } from "./types";
import type {
  AppearanceConfig,
  CanvasTextureMode,
  DisplayScaleMode,
  ImageColorMode,
  MarqueeSpeedMode,
  MotionPreferenceMode,
  NavbarStyleMode,
  PortfolioDatabase,
  PortfolioThemeMode,
  PreloaderMode,
  ProjectsLayoutMode,
} from "@/types/portfolio";
import { cn } from "@/lib/utils";

export interface AppearanceSettingsProps {
  db: PortfolioDatabase;
  onDatabaseSync: (nextDb: PortfolioDatabase) => Promise<void> | void;
  onFeedback: (next: SettingsFeedback | null) => void;
}

const FONT_BUTTON_STYLE_MAP: Record<
  AppearanceConfig["fontPairing"],
  { display: string; sans: string }
> = {
  editorial: {
    display: 'var(--font-anton), "Anton", sans-serif',
    sans: 'var(--font-onest), "Onest", sans-serif',
  },
  geometric: {
    display: 'var(--font-space-grotesk), "Space Grotesk", sans-serif',
    sans: 'var(--font-jakarta), "Plus Jakarta Sans", sans-serif',
  },
  monolith: {
    display: 'var(--font-bebas), "Bebas Neue", sans-serif',
    sans: 'var(--font-inter), "Inter", sans-serif',
  },
};

const SITE_THEME_OPTIONS: readonly {
  id: PortfolioThemeMode;
  name: string;
  tagline: string;
  canvasBg: string;
  surfaceBg: string;
  textPreview: string;
  borderTint: string;
}[] = [
  {
    id: "dark",
    name: "Obsidian Dark",
    tagline: "Cinematic nocturnal canvas (#08080a) tuned for high focus",
    canvasBg: "#08080a",
    surfaceBg: "#111114",
    textPreview: "#f3f1ea",
    borderTint: "rgba(255, 255, 255, 0.14)",
  },
  {
    id: "light",
    name: "Daylight Bone",
    tagline: "Editorial warm paper canvas (#f5f2eb) with crisp dark ink",
    canvasBg: "#f5f2eb",
    surfaceBg: "#ebe7dd",
    textPreview: "#141416",
    borderTint: "rgba(20, 20, 22, 0.14)",
  },
  {
    id: "system",
    name: "Follow Visitor OS",
    tagline: "Automatically matches each visitor's system Light/Dark mode",
    canvasBg: "#111114",
    surfaceBg: "#1a1a1f",
    textPreview: "#f3f1ea",
    borderTint: "rgba(255, 255, 255, 0.14)",
  },
];

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  caption?: string;
}

function SegmentedPills<T extends string>({
  value,
  options,
  onChange,
  columnsClass = "grid-cols-1 sm:grid-cols-3",
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
  columnsClass?: string;
}) {
  return (
    <div className={cn("grid gap-2", columnsClass)}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={cn(
              "text-left rounded-(--radius-control) border px-3 py-2.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              active
                ? "bg-(--bg-badge-highlight) border-brand text-(--text-primary)"
                : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-secondary) hover:border-(--border-strong)"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-xs font-mono font-semibold uppercase tracking-wider",
                  active ? "text-(--text-accent)" : "text-(--text-primary)"
                )}
              >
                {opt.label}
              </span>
              {active && (
                <Check className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
              )}
            </div>
            {opt.caption && (
              <span className="text-[11px] text-(--text-muted) block mt-0.5 leading-snug">
                {opt.caption}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onToggle(!checked)}
      className="w-full text-left flex items-center justify-between gap-4 p-3 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) hover:border-(--border-strong) transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-(--text-primary)">{label}</p>
        <p className="text-[11px] text-(--text-muted) mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "w-10 h-5.5 rounded-full border p-0.5 transition-colors shrink-0 inline-flex items-center",
          checked
            ? "bg-brand border-brand justify-end"
            : "bg-(--bg-surface) border-(--border-strong) justify-start"
        )}
      >
        <span
          className={cn(
            "w-4 h-4 rounded-full transition-transform",
            checked ? "bg-brand-contrast" : "bg-(--text-muted)"
          )}
        />
      </span>
    </button>
  );
}

export function AppearanceSettings({
  db,
  onDatabaseSync,
  onFeedback,
}: AppearanceSettingsProps) {
  const { setPreviewAppearance } = usePortfolio();
  const { theme, setTheme } = useThemePreference();
  const { isOnline } = useOfflineStatus();

  const savedSnapshot = useMemo(
    () => sanitizeAppearanceConfig(db.appearance),
    [db.appearance]
  );

  const [draft, setDraft] = useState<AppearanceConfig>(savedSnapshot);
  const [saving, setSaving] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Per-device browser-local state (hydrated post-mount to avoid SSR mismatch)
  const [deviceThemeOverride, setDeviceThemeOverride] =
    useState<DeviceThemeOverride>("site-default");
  const [deviceMotionOverride, setDeviceMotionOverride] =
    useState<DeviceMotionOverride>("site-default");
  const [osReducedMotion, setOsReducedMotion] = useState(false);
  const [supportsViewTransitions, setSupportsViewTransitions] = useState(false);
  const [preloaderSessionNotice, setPreloaderSessionNotice] = useState<
    string | null
  >(null);

  const lastSavedKeyRef = useRef<string>(JSON.stringify(savedSnapshot));

  // Sync draft when server snapshot updates externally (e.g. backup restore)
  useEffect(() => {
    const incomingKey = JSON.stringify(savedSnapshot);
    if (incomingKey === lastSavedKeyRef.current) return;
    lastSavedKeyRef.current = incomingKey;

    const rafId = window.requestAnimationFrame(() => {
      setDraft(savedSnapshot);
      setPreviewAppearance(null);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [savedSnapshot, setPreviewAppearance]);

  // Clear live WYSIWYG preview cleanly when leaving Appearance Studio
  useEffect(() => {
    return () => {
      setPreviewAppearance(null);
    };
  }, [setPreviewAppearance]);

  // Hydrate browser-local overrides & media query diagnostics cleanly
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    const syncLocal = () => {
      setDeviceThemeOverride(getStoredDeviceThemeOverride());
      setDeviceMotionOverride(getStoredDeviceMotionOverride());
      setOsReducedMotion(Boolean(mq?.matches));
      setSupportsViewTransitions(
        "startViewTransition" in document &&
          typeof (
            document as Document & { startViewTransition?: unknown }
          ).startViewTransition === "function"
      );
    };

    const rafId = window.requestAnimationFrame(syncLocal);
    mq?.addEventListener("change", syncLocal);
    window.addEventListener(APPEARANCE_SYNC_EVENT, syncLocal);

    return () => {
      window.cancelAnimationFrame(rafId);
      mq?.removeEventListener("change", syncLocal);
      window.removeEventListener(APPEARANCE_SYNC_EVENT, syncLocal);
    };
  }, []);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedSnapshot),
    [draft, savedSnapshot]
  );

  useBrandPortalWorkspaceSync({
    moduleId: "settings-appearance",
    moduleLabel: "Appearance & Theme",
    hasUnsavedChanges: isDirty,
    saving,
  });

  const updateDraft = useCallback(
    (updater: (prev: AppearanceConfig) => AppearanceConfig) => {
      onFeedback(null);
      setDraft((prev) => {
        const next = updater(prev);
        setPreviewAppearance(next);
        return next;
      });
    },
    [onFeedback, setPreviewAppearance]
  );

  const handleSelectSiteDefaultTheme = (
    nextMode: PortfolioThemeMode,
    originElement?: HTMLElement | null
  ) => {
    const nextResolved = resolveEffectiveTheme(nextMode, "site-default");
    const applySelection = () => {
      if (deviceThemeOverride !== "site-default") {
        setStoredDeviceThemeOverride("site-default");
        setDeviceThemeOverride("site-default");
      }
      const nextDraft: AppearanceConfig = {
        ...draft,
        defaultTheme: nextMode,
      };
      onFeedback(null);
      setDraft(nextDraft);
      setPreviewAppearance(nextDraft);
      applyAppearanceToDocument(nextDraft, {
        deviceThemeOverride: "site-default",
      });
      window.dispatchEvent(new CustomEvent(APPEARANCE_SYNC_EVENT));
    };

    if (nextResolved !== theme && originElement) {
      triggerThemePulseWave(nextResolved, applySelection, originElement);
      return;
    }
    applySelection();
  };

  const activeHexValue = useMemo(
    () =>
      normalizeHexColor(
        draft.customAccentHex,
        DEFAULT_APPEARANCE.customAccentHex
      ),
    [draft.customAccentHex]
  );

  const handleCustomPickerChange = useCallback(
    (hex: string) => {
      const normalized = normalizeHexColor(hex);
      updateDraft((prev) => ({
        ...prev,
        accentPreset: "custom",
        customAccentHex: normalized,
      }));
    },
    [updateDraft]
  );

  const handleDiscard = () => {
    setDraft(savedSnapshot);
    setPreviewAppearance(null);
    onFeedback(null);
  };

  const handleSavePublish = async () => {
    onFeedback(null);

    if (isNetworkOffline(isOnline)) {
      setConfirmSaveOpen(false);
      onFeedback({
        type: "error",
        message: "Cannot publish appearance while offline. Reconnect and retry.",
      });
      return;
    }

    setSaving(true);
    try {
      const safeCustomHex = normalizeHexColor(
        draft.customAccentHex,
        DEFAULT_APPEARANCE.customAccentHex
      );
      const payload: AppearanceConfig = {
        ...draft,
        customAccentHex: safeCustomHex,
      };

      const res = await fetch("/api/admin/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearance: payload }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to publish appearance settings.");
      }

      if (data.data) {
        const synced = sanitizeAppearanceConfig(data.data.appearance);
        lastSavedKeyRef.current = JSON.stringify(synced);
        setDraft(synced);
        setPreviewAppearance(null);
        await onDatabaseSync(data.data);
      }

      setConfirmSaveOpen(false);
      onFeedback(null);
      announceBrandPortalStatus({
        tone: "live",
        label: "Appearance Live",
        detail: "Design tokens published site-wide",
        durationMs: 3200,
      });
    } catch (err: unknown) {
      setConfirmSaveOpen(false);
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to save appearance settings.";
      announceBrandPortalStatus({
        tone: "error",
        label: "Publish Failed",
        detail: msg,
        durationMs: 4200,
      });
      onFeedback({ type: "error", message: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setConfirmResetOpen(false);
    updateDraft(() => DEFAULT_APPEARANCE);
  };

  const handleSetLocalThemeOverride = (
    next: DeviceThemeOverride,
    el?: HTMLElement | null
  ) => {
    setStoredDeviceThemeOverride(next);
    setDeviceThemeOverride(next);

    if (next === "dark" || next === "light") {
      setTheme(next, el);
      return;
    }

    const nextEffective = resolveEffectiveTheme(draft.defaultTheme, next);
    if (el && nextEffective !== theme) {
      setTheme(nextEffective, el);
      setStoredDeviceThemeOverride(next);
      setDeviceThemeOverride(next);
    }
    applyAppearanceToDocument(draft, { deviceThemeOverride: next });
    window.dispatchEvent(new CustomEvent(APPEARANCE_SYNC_EVENT));
  };

  const handleSetLocalMotionOverride = (next: DeviceMotionOverride) => {
    setStoredDeviceMotionOverride(next);
    setDeviceMotionOverride(next);
    applyAppearanceToDocument(draft, { deviceMotionOverride: next });
    window.dispatchEvent(new CustomEvent(APPEARANCE_SYNC_EVENT));
  };

  const handleResetPreloaderSession = () => {
    try {
      window.sessionStorage.removeItem(PRELOADER_SEEN_SESSION_KEY);
      setPreloaderSessionNotice(
        "Session preloader flag cleared — reload the homepage to replay."
      );
    } catch {
      setPreloaderSessionNotice("Unable to access sessionStorage in this mode.");
    }
  };

  const effectiveReducedMotion = useMemo(
    () => resolveEffectiveReducedMotion(draft, deviceMotionOverride),
    [draft, deviceMotionOverride]
  );

  return (
    <div className="space-y-6">
      {/* Top Sticky Studio Control Bar */}
      <div
        data-cascade
        data-sticky-ceiling="true"
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 sticky top-16 z-20 shadow-lg"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/40 flex items-center justify-center shrink-0 text-(--text-accent)">
            <Palette className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl sm:text-2xl uppercase tracking-tight text-(--text-primary)">
                Design Token, Theme & Motion Studio
              </h2>
              <StatusPill
                label={isDirty ? "Unsaved Draft" : "Live Synced"}
                variant={isDirty ? "warning" : "success"}
                size="xs"
              />
              <InfoTooltip
                label="Live preview vs published defaults"
                content="Every tweak previews instantaneously across Admin & the Stage Preview without modifying the database until you confirm Save & Publish."
              />
            </div>
            <p className="text-xs text-(--text-muted) mt-0.5">
              Changes preview live across every component. Publish to persist site-wide defaults.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => setConfirmResetOpen(true)}
            className="text-(--text-secondary)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </Button>

          {isDirty && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={handleDiscard}
            >
              <span>Discard Draft</span>
            </Button>
          )}

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!isDirty || saving}
            onClick={() => setConfirmSaveOpen(true)}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saving ? "Publishing..." : "Save & Publish"}</span>
          </Button>
        </div>
      </div>

      {/* Interactive Real-Time Preview Stage & WCAG Diagnostics */}
      <AppearancePreviewCard
        draft={draft}
        effectiveTheme={theme}
        isDirty={isDirty}
      />

      {/* 1. Published Site Canvas Theme & Accent Palette */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 space-y-5 sm:space-y-6"
      >
        <SectionHeader
          eyebrow="Published Default · Color System"
          title="Canvas Theme & Accent Palette"
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Site default theme & radial pulse transition"
                content="Published Visitor Default Theme controls what first-time visitors see. Clicking a theme card plays the exact radial View-Transition wave used by the navbar Theme Toggle."
              />
              <Palette className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        {/* 1A: Published Default Canvas Theme */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
              <span>Published Visitor Default Theme</span>
              <InfoTooltip
                label="Visitor localStorage override behavior"
                content="Visitors can still toggle Dark/Light locally using the header button; their choice stays saved in localStorage without affecting other visitors."
              />
            </span>
            {deviceThemeOverride !== "site-default" && (
              <StatusPill
                label={`Local override active (${deviceThemeOverride})`}
                variant="accent"
                size="xs"
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SITE_THEME_OPTIONS.map((spec) => {
              const isSelected = draft.defaultTheme === spec.id;
              return (
                <button
                  key={spec.id}
                  type="button"
                  onClick={(e) =>
                    handleSelectSiteDefaultTheme(spec.id, e.currentTarget)
                  }
                  aria-pressed={isSelected}
                  className={cn(
                    "text-left rounded-(--radius-control) border p-3.5 transition-all duration-200 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand space-y-3",
                    isSelected
                      ? "bg-(--bg-surface-2) border-brand shadow-[0_0_24px_var(--accent-glow)]"
                      : "bg-(--bg-surface-2)/45 border-(--border-subtle) hover:border-(--border-strong)"
                  )}
                >
                  {/* Mini Split / Theme Canvas Artwork */}
                  <div
                    style={{
                      backgroundColor: spec.canvasBg,
                      borderColor: spec.borderTint,
                    }}
                    className="h-18 rounded-(--radius-control) border p-2.5 flex flex-col justify-between relative overflow-hidden"
                  >
                    {spec.id === "system" && (
                      <div
                        style={{ backgroundColor: "#f5f2eb" }}
                        className="absolute inset-y-0 right-0 w-1/2"
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-brand" />
                        <span
                          style={{ color: spec.textPreview }}
                          className="text-[8px] font-mono uppercase tracking-widest opacity-80"
                        >
                          {spec.id === "system" ? "AUTO OS" : spec.id.toUpperCase()}
                        </span>
                      </span>
                      <span
                        style={{ backgroundColor: spec.surfaceBg }}
                        className="px-1.5 py-0.5 rounded-sm border border-white/10 text-[8px] font-mono opacity-80"
                      >
                        {spec.canvasBg}
                      </span>
                    </div>

                    <div className="relative z-10 flex items-center gap-1.5">
                      <div className="h-2 w-16 rounded-full bg-brand" />
                      <div
                        style={{ backgroundColor: spec.textPreview }}
                        className="h-2 w-10 rounded-full opacity-20"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {spec.id === "dark" ? (
                          <Moon className="w-3.5 h-3.5 text-(--text-accent)" />
                        ) : spec.id === "light" ? (
                          <Sun className="w-3.5 h-3.5 text-(--text-accent)" />
                        ) : (
                          <Monitor className="w-3.5 h-3.5 text-(--text-accent)" />
                        )}
                        <span className="font-display text-lg uppercase tracking-tight text-(--text-primary)">
                          {spec.name}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="w-4.5 h-4.5 rounded-full bg-brand text-brand-contrast inline-flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-(--text-muted) leading-relaxed mt-1">
                      {spec.tagline}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1B: Accent Color Presets + Custom Color Picker */}
        <div className="space-y-3 pt-4 border-t border-(--border-subtle)">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
            Brand Accent Palette & Custom Hex Picker
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {ACCENT_PRESETS.map((preset) => {
              const active = draft.accentPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    updateDraft((prev) => ({
                      ...prev,
                      accentPreset: preset.id,
                    }))
                  }
                  aria-pressed={active}
                  className={cn(
                    "text-left rounded-(--radius-control) border p-3 flex items-start gap-3 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    active
                      ? "bg-(--bg-badge-highlight) border-brand"
                      : "bg-(--bg-surface-2) border-(--border-subtle) hover:border-(--border-strong)"
                  )}
                >
                  <span
                    style={{ backgroundColor: preset.hex }}
                    className="w-7 h-7 rounded-full border border-white/20 shrink-0 mt-0.5 inline-flex items-center justify-center shadow-sm"
                  >
                    {active && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-(--text-primary) truncate">
                        {preset.name}
                      </span>
                      <code className="text-[10px] font-mono text-(--text-muted) uppercase">
                        {preset.hex}
                      </code>
                    </div>
                    <p className="text-[11px] text-(--text-muted) leading-snug mt-0.5">
                      {preset.tagline}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Accent RGB & Hex Popover Control */}
          <div
            className={cn(
              "rounded-(--radius-control) border p-3.5 sm:p-4 space-y-3 transition-colors",
              draft.accentPreset === "custom"
                ? "bg-(--bg-badge-highlight) border-brand"
                : "bg-(--bg-surface-2) border-(--border-subtle)"
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-(--text-primary)">
                  Custom RGB &amp; Hex Swatch
                </span>
                {draft.accentPreset === "custom" && (
                  <StatusPill label="Custom Active" variant="accent" size="xs" />
                )}
                <InfoTooltip
                  label="Auto WCAG accent token derivation"
                  content="Hover shade, deep shadow stop, button contrast ink (black vs white), and accessible text-accent tokens on Dark & Daylight canvases auto-compute from your custom RGB swatch."
                />
              </div>

              {draft.accentPreset !== "custom" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCustomPickerChange(activeHexValue)}
                >
                  Apply Custom
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-3 items-center">
              <ColorPickerDropdown
                id="appearance-custom-accent-picker"
                label="RGB / Hex Color Selector"
                value={activeHexValue}
                onChange={handleCustomPickerChange}
                presets={ACCENT_PRESETS.map((p) => ({
                  id: p.id,
                  label: p.name,
                  hex: p.hex,
                }))}
              />
              <p className="text-[11px] text-(--text-muted) leading-relaxed">
                Adjust Hue, Saturation/Brightness, or exact R/G/B channels inside the spectrum dropdown. WCAG luminance checks ensure readable foregrounds automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Typography Pairing & Public Scale */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Typography & Rhythm"
          title="Font Pairings & Display Scale"
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Font pairings & display scale scope"
                content="Font pairings switch display headlines and sans copy across every route. Public Portfolio Type Scale adjusts headline, hero, and body rem proportions strictly on / while keeping the /admin workbench locked."
              />
              <Type className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
          {FONT_PAIRINGS.map((pairing) => {
            const active = draft.fontPairing === pairing.id;
            const fontStyles = FONT_BUTTON_STYLE_MAP[pairing.id];
            return (
              <button
                key={pairing.id}
                type="button"
                onClick={() =>
                  updateDraft((prev) => ({ ...prev, fontPairing: pairing.id }))
                }
                aria-pressed={active}
                className={cn(
                  "text-left rounded-(--radius-control) border p-3.5 sm:p-4 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand flex flex-col justify-between gap-2.5 h-full min-w-0",
                  active
                    ? "bg-(--bg-badge-highlight) border-brand"
                    : "bg-(--bg-surface-2) border-(--border-subtle) hover:border-(--border-strong)"
                )}
              >
                <div className="space-y-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-(--text-accent) font-semibold truncate">
                      {pairing.displayLabel} + {pairing.sansLabel}
                    </span>
                    {active && (
                      <span className="w-4.5 h-4.5 rounded-full bg-brand text-brand-contrast inline-flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  <p
                    style={{ fontFamily: fontStyles.display }}
                    className="text-lg sm:text-xl uppercase tracking-tight leading-tight text-(--text-primary) truncate"
                  >
                    {pairing.sampleHeadline}
                  </p>
                </div>

                <p
                  style={{ fontFamily: fontStyles.sans }}
                  className="text-xs text-(--text-muted) leading-relaxed"
                >
                  {pairing.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className="pt-3 border-t border-(--border-subtle) space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
              <span>Public Portfolio Type Scale</span>
              <InfoTooltip
                label="How Type Scale applies"
                content="Scales CSS display, hero, and prose variables via data-scale across your public homepage (Compact: ~0.86x, Standard: 1.0x, Large: ~1.16x)."
              />
            </span>
            <span className="text-[10px] font-mono text-(--text-muted)">
              Scoped strictly to public sections (/admin rail stride locked)
            </span>
          </div>
          <SegmentedPills<DisplayScaleMode>
            value={draft.displayScale}
            onChange={(displayScale) =>
              updateDraft((prev) => ({ ...prev, displayScale }))
            }
            options={[
              {
                id: "compact",
                label: "Compact",
                caption: "Tighter headline & card hierarchy",
              },
              {
                id: "standard",
                label: "Standard",
                caption: "Balanced editorial proportions",
              },
              {
                id: "large",
                label: "Large",
                caption: "Amplified display typography on desktop",
              },
            ]}
          />
        </div>
      </div>

      {/* 3. Surface Geometry, Texture, Navbar & Grid */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 space-y-5 sm:space-y-6"
      >
        <SectionHeader
          eyebrow="Spatial Surfaces & Grid"
          title="Corners, Texture, Navbar & Layout"
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Spatial surface design tokens"
                content="Controls CSS corner radii across cards and inputs, canvas backdrop pattern behind Hero/Sections, frosted vs opaque header blur, and asymmetric Projects grid offset."
              />
              <LayoutGrid className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        {/* Corner Radius */}
        <div className="space-y-2.5">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
            Corner Geometry
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {RADIUS_PRESETS.map((rad) => {
              const active = draft.surfaceRadius === rad.id;
              return (
                <button
                  key={rad.id}
                  type="button"
                  onClick={() =>
                    updateDraft((prev) => ({ ...prev, surfaceRadius: rad.id }))
                  }
                  aria-pressed={active}
                  className={cn(
                    "text-left border p-3.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand flex items-start gap-3",
                    active
                      ? "bg-(--bg-badge-highlight) border-brand"
                      : "bg-(--bg-surface-2) border-(--border-subtle) hover:border-(--border-strong)"
                  )}
                  style={{ borderRadius: rad.pxCard }}
                >
                  <span
                    style={{ borderRadius: rad.pxControl }}
                    className={cn(
                      "w-9 h-9 border-2 shrink-0 flex items-center justify-center text-[10px] font-mono",
                      active
                        ? "border-brand bg-brand/15 text-(--text-accent)"
                        : "border-(--border-strong) bg-(--bg-surface) text-(--text-muted)"
                    )}
                  >
                    {rad.pxCard}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-(--text-primary)">
                      {rad.name}
                    </p>
                    <p className="text-[11px] text-(--text-muted) mt-0.5 leading-snug">
                      {rad.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Canvas Texture + Navbar + Projects Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-3 border-t border-(--border-subtle)">
          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Public Canvas Texture
            </span>
            <SegmentedPills<CanvasTextureMode>
              value={draft.canvasTexture}
              onChange={(canvasTexture) =>
                updateDraft((prev) => ({ ...prev, canvasTexture }))
              }
              columnsClass="grid-cols-1 sm:grid-cols-3"
              options={[
                { id: "clean", label: "Clean" },
                { id: "grid", label: "Grid" },
                { id: "dots", label: "Dots" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Navbar Surface
            </span>
            <SegmentedPills<NavbarStyleMode>
              value={draft.navbarStyle}
              onChange={(navbarStyle) =>
                updateDraft((prev) => ({ ...prev, navbarStyle }))
              }
              columnsClass="grid-cols-2"
              options={[
                { id: "glass", label: "Glass Frost" },
                { id: "solid", label: "Solid Canvas" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Selected Systems Grid
            </span>
            <SegmentedPills<ProjectsLayoutMode>
              value={draft.projectsLayout}
              onChange={(projectsLayout) =>
                updateDraft((prev) => ({ ...prev, projectsLayout }))
              }
              columnsClass="grid-cols-2"
              options={[
                { id: "staggered", label: "Staggered" },
                { id: "aligned", label: "Aligned" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* 4. Cinematic Motion, Preloader, Marquee & Media FX */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 space-y-5 sm:space-y-6"
      >
        <SectionHeader
          eyebrow="Choreography & Media"
          title="Motion, Scroll, Preloader & Portrait FX"
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Motion precedence & battery-friendly fallback"
                content="OS Reduced Motion or a local reduced override always wins over Full Cinema so animations disable cleanly on low-power devices or accessible setups."
              />
              <Sparkles className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Site Motion Policy
            </span>
            <SegmentedPills<MotionPreferenceMode>
              value={draft.motionMode}
              onChange={(motionMode) =>
                updateDraft((prev) => ({ ...prev, motionMode }))
              }
              options={[
                { id: "system", label: "Follow OS" },
                { id: "full", label: "Full Cinema" },
                { id: "reduced", label: "Reduced" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Boot Curtain Preloader
            </span>
            <SegmentedPills<PreloaderMode>
              value={draft.preloaderMode}
              onChange={(preloaderMode) =>
                updateDraft((prev) => ({ ...prev, preloaderMode }))
              }
              options={[
                { id: "always", label: "Always" },
                { id: "once-per-session", label: "1x Session" },
                { id: "off", label: "Off" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Principles Marquee Tempo
            </span>
            <SegmentedPills<MarqueeSpeedMode>
              value={draft.marqueeSpeed}
              onChange={(marqueeSpeed) =>
                updateDraft((prev) => ({ ...prev, marqueeSpeed }))
              }
              options={[
                { id: "slow", label: "Slow (36s)" },
                { id: "normal", label: "Normal (24s)" },
                { id: "fast", label: "Fast (14s)" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Media & Portrait Color Grade
            </span>
            <SegmentedPills<ImageColorMode>
              value={draft.imageColorMode}
              onChange={(imageColorMode) =>
                updateDraft((prev) => ({ ...prev, imageColorMode }))
              }
              columnsClass="grid-cols-2"
              options={[
                { id: "grayscale-hover", label: "Noir -> Color" },
                { id: "always-color", label: "Full Color" },
              ]}
            />
          </div>
        </div>

        {/* Fine-Grained Feature Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-(--border-subtle)">
          <ToggleRow
            label="Smooth Momentum Scroll (Lenis)"
            description="Interpolated Lenis + GSAP ScrollTrigger scroll physics on the public portfolio."
            checked={draft.smoothScroll}
            onToggle={(smoothScroll) =>
              updateDraft((prev) => ({ ...prev, smoothScroll }))
            }
          />
          <ToggleRow
            label="Magnetic Cursor Pull"
            description="Subtle proximity cursor attraction on primary CTAs & navigation controls (desktop fine pointer)."
            checked={draft.magneticCursor}
            onToggle={(magneticCursor) =>
              updateDraft((prev) => ({ ...prev, magneticCursor }))
            }
          />
          <ToggleRow
            label="Liquid SVG Turbulence Hover"
            description="Organic GPU displacement hover wave across showcase project thumbnails."
            checked={draft.liquidDistortion}
            onToggle={(liquidDistortion) =>
              updateDraft((prev) => ({ ...prev, liquidDistortion }))
            }
          />
          <ToggleRow
            label="Hero Portrait Accent Rim Glow"
            description="Radial atmospheric accent backlight framing the cutout hero avatar."
            checked={draft.heroRimGlow}
            onToggle={(heroRimGlow) =>
              updateDraft((prev) => ({ ...prev, heroRimGlow }))
            }
          />
        </div>
      </div>

      {/* 5. This Device Only — Local Browser Overrides & Runtime Diagnostics */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Browser LocalStorage · Does Not Modify Published DB"
          title="This Device Only & Runtime Telemetry"
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Local device overrides vs Published DB"
                content="Controls below save exclusively in your browser localStorage for personal testing—other visitors never see your local overrides."
              />
              <SlidersHorizontal className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-2.5">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Theme Override on This Browser
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: "site-default", label: "Site Default" },
                  { id: "dark", label: "Dark" },
                  { id: "light", label: "Light" },
                  { id: "system", label: "Follow OS" },
                ] as const
              ).map((opt) => {
                const active = deviceThemeOverride === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={(e) =>
                      handleSetLocalThemeOverride(opt.id, e.currentTarget)
                    }
                    aria-pressed={active}
                    className={cn(
                      "px-3 py-2 rounded-(--radius-control) border text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors",
                      active
                        ? "bg-brand text-brand-contrast border-brand font-semibold"
                        : "bg-(--bg-surface-2) text-(--text-secondary) border-(--border-subtle) hover:border-(--border-strong)"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Motion Override on This Browser
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "site-default", label: "Follow Site Policy" },
                  { id: "reduced", label: "Force Reduced Motion" },
                ] as const
              ).map((opt) => {
                const active = deviceMotionOverride === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSetLocalMotionOverride(opt.id)}
                    aria-pressed={active}
                    className={cn(
                      "px-3 py-2 rounded-(--radius-control) border text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors",
                      active
                        ? "bg-brand text-brand-contrast border-brand font-semibold"
                        : "bg-(--bg-surface-2) text-(--text-secondary) border-(--border-subtle) hover:border-(--border-strong)"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Telemetry & Preloader Replay Utility */}
        <div className="p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2.5">
            <Gauge className="w-4 h-4 text-(--text-accent)" />
            <StatusPill
              label={`Effective Theme: ${theme.toUpperCase()}`}
              variant="accent"
              size="xs"
            />
            <StatusPill
              label={
                effectiveReducedMotion
                  ? "Motion: REDUCED"
                  : "Motion: FULL CINEMA"
              }
              variant={effectiveReducedMotion ? "warning" : "success"}
              size="xs"
            />
            <StatusPill
              label={
                osReducedMotion ? "OS Reduced: ON" : "OS Reduced: OFF"
              }
              variant="neutral"
              size="xs"
            />
            <StatusPill
              label={
                supportsViewTransitions
                  ? "View Transitions: Native"
                  : "View Transitions: RAF Fallback"
              }
              variant={supportsViewTransitions ? "success" : "neutral"}
              size="xs"
            />
          </div>

          <button
            type="button"
            onClick={handleResetPreloaderSession}
            className="text-[11px] font-mono text-(--text-accent) hover:underline inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Session Preloader Cache</span>
          </button>
        </div>

        {preloaderSessionNotice && (
          <p className="text-[11px] font-mono text-(--text-muted)">
            {preloaderSessionNotice}
          </p>
        )}
      </div>

      <ConfirmModal
        open={confirmSaveOpen}
        title="Publish Appearance & Motion Settings?"
        description={`Persist ${draft.defaultTheme.toUpperCase()} default theme, ${activeHexValue} brand accent, ${draft.fontPairing} typography, and ${draft.displayScale} public type scale immediately across your live portfolio?`}
        confirmLabel="Save & Publish"
        variant="primary"
        loading={saving}
        onConfirm={() => void handleSavePublish()}
        onCancel={() => {
          if (!saving) setConfirmSaveOpen(false);
        }}
      />

      <ConfirmModal
        open={confirmResetOpen}
        title="Reset Appearance Tokens to Default?"
        description="This reverts your unsaved design token draft back to Obsidian Dark, Vermilion Signature (#ff3b1d), Editorial fonts, sharp 2px corners, and full motion. You can still inspect the preview before clicking Save & Publish."
        confirmLabel="Load Defaults Into Draft"
        variant="warning"
        onConfirm={handleResetDefaults}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}
