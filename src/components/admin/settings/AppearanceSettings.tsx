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
  ChevronDown,
  Eye,
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
  resolveAccentBaseHex,
  resolveEffectiveReducedMotion,
  resolveEffectiveTheme,
  sanitizeAppearanceConfig,
  setStoredDeviceMotionOverride,
  setStoredDeviceThemeOverride,
  type DeviceMotionOverride,
  type DeviceThemeOverride,
} from "@/lib/appearance";
import { useMediaQuery } from "@/lib/useMediaQuery";
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
import { Collapsible } from "@/components/motion/Collapsible";
import {
  AdminMobileStepView,
  MobileStepItem,
  useStepNavigation,
} from "@/components/admin/AdminMobileStepView";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { ColorPickerDropdown } from "@/components/ui/fields";
import {
  AppearancePreviewCard,
  FONT_PAIRING_STYLE_MAP,
} from "./AppearancePreviewCard";
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

type AppearanceStep = 0 | 1 | 2 | 3 | 4;

const APPEARANCE_STEPS: readonly MobileStepItem[] = [
  { code: "01", shortTitle: "Theme" },
  { code: "02", shortTitle: "Fonts" },
  { code: "03", shortTitle: "Surface" },
  { code: "04", shortTitle: "Motion" },
  { code: "05", shortTitle: "Local" },
];

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
              "text-left rounded-(--radius-control) border px-2.5 py-2 sm:px-3 sm:py-2.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand min-w-0",
              active
                ? "bg-(--bg-badge-highlight) border-brand text-(--text-primary)"
                : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-secondary) hover:border-(--border-strong)"
            )}
          >
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <span
                className={cn(
                  "text-[11px] sm:text-xs font-mono font-semibold uppercase tracking-wider truncate",
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
  const isMobileOrTablet = useMediaQuery("(max-width: 1023px)");
  const { activeStep, stepDirection, switchStep } =
    useStepNavigation<AppearanceStep>(0);

  const savedSnapshot = useMemo(
    () => sanitizeAppearanceConfig(db.appearance),
    [db.appearance]
  );

  const [draft, setDraft] = useState<AppearanceConfig>(savedSnapshot);
  const [saving, setSaving] = useState(false);
  const [mobileStageOpen, setMobileStageOpen] = useState(false);
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

  const resolvedAccentHex = useMemo(
    () => resolveAccentBaseHex(draft),
    [draft]
  );
  const activePresetMeta =
    draft.accentPreset === "custom"
      ? null
      : (ACCENT_PRESETS.find((item) => item.id === draft.accentPreset) ?? null);
  const activeThemeMeta =
    SITE_THEME_OPTIONS.find((item) => item.id === draft.defaultTheme) ??
    SITE_THEME_OPTIONS[0];
  const activeFontMeta =
    FONT_PAIRINGS.find((item) => item.id === draft.fontPairing) ??
    FONT_PAIRINGS[0];
  const activeRadiusMeta =
    RADIUS_PRESETS.find((item) => item.id === draft.surfaceRadius) ??
    RADIUS_PRESETS[0];

  /* 1. Published Site Canvas Theme & Accent Palette */
  const themeSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-5 sm:space-y-6"
    >
      <SectionHeader
        eyebrow="Published Default · Color System"
        title="Canvas Theme & Accent Palette"
        size="sm"
        tooltip={
          <InfoTooltip
            label="Site default theme & radial pulse transition"
            content="Published Visitor Default Theme controls what first-time visitors see. Clicking a theme card plays the exact radial View-Transition wave used by the navbar Theme Toggle."
          />
        }
        rightSlot={<Palette className="w-5 h-5 text-(--text-accent)" />}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
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
                    "text-left rounded-(--radius-control) border p-3 sm:p-3.5 transition-all duration-200 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand flex flex-row sm:flex-col items-center sm:items-stretch gap-3 sm:gap-0 sm:space-y-3",
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
                    className="w-24 h-16 sm:w-full sm:h-18 rounded-(--radius-control) border p-2 sm:p-2.5 flex flex-col justify-between relative overflow-hidden shrink-0"
                  >
                    {spec.id === "system" && (
                      <div
                        style={{ backgroundColor: "#f5f2eb" }}
                        className="absolute inset-y-0 right-0 w-1/2"
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-brand shrink-0" />
                        <span
                          style={{ color: spec.textPreview }}
                          className="text-[7px] sm:text-[8px] font-mono uppercase tracking-wider sm:tracking-widest opacity-80"
                        >
                          {spec.id === "system" ? "AUTO" : spec.id.toUpperCase()}
                        </span>
                      </span>
                      <span
                        style={{ backgroundColor: spec.surfaceBg }}
                        className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-white/10 text-[8px] font-mono opacity-80"
                      >
                        {spec.canvasBg}
                      </span>
                    </div>

                    <div className="relative z-10 flex items-center gap-1 sm:gap-1.5">
                      <div className="h-1.5 sm:h-2 w-10 sm:w-16 rounded-full bg-brand" />
                      <div
                        style={{ backgroundColor: spec.textPreview }}
                        className="h-1.5 sm:h-2 w-6 sm:w-10 rounded-full opacity-20"
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {spec.id === "dark" ? (
                          <Moon className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                        ) : spec.id === "light" ? (
                          <Sun className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                        ) : (
                          <Monitor className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                        )}
                        <span className="font-display text-base sm:text-lg uppercase tracking-tight text-(--text-primary) truncate">
                          {spec.name}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="w-4.5 h-4.5 rounded-full bg-brand text-brand-contrast inline-flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-(--text-muted) leading-snug sm:leading-relaxed mt-0.5 sm:mt-1">
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
            Brand Accent Palette &amp; Custom Hex Picker
          </span>

          {/* Unified Compact Palette Swatch Card */}
          <div className="rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface-2) p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {ACCENT_PRESETS.map((preset) => {
                const active = draft.accentPreset === preset.id;
                const shortName =
                  preset.id.charAt(0).toUpperCase() + preset.id.slice(1);
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
                    aria-label={`${preset.name} (${preset.hex})`}
                    className={cn(
                      "rounded-(--radius-control) border px-2 py-2.5 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand min-w-0",
                      active
                        ? "bg-(--bg-badge-highlight) border-brand shadow-[0_0_16px_var(--accent-glow)]"
                        : "bg-(--bg-surface) border-(--border-subtle) hover:border-(--border-strong)"
                    )}
                  >
                    <span
                      style={{ backgroundColor: preset.hex }}
                      className={cn(
                        "w-7 h-7 rounded-full border border-white/25 inline-flex items-center justify-center shadow-sm transition-transform",
                        active && "scale-105"
                      )}
                    >
                      {active && (
                        <Check className="w-3.5 h-3.5 text-white drop-shadow" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-mono uppercase tracking-wider truncate max-w-full",
                        active
                          ? "text-(--text-accent) font-semibold"
                          : "text-(--text-secondary)"
                      )}
                    >
                      {shortName}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2.5 border-t border-(--border-subtle) flex items-center justify-between gap-3">
              {activePresetMeta ? (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      style={{ backgroundColor: activePresetMeta.hex }}
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-(--text-primary) truncate">
                        {activePresetMeta.name}
                      </p>
                      <p className="text-[11px] text-(--text-muted) truncate">
                        {activePresetMeta.tagline}
                      </p>
                    </div>
                  </div>
                  <code className="text-[10px] font-mono text-(--text-muted) uppercase shrink-0 px-1.5 py-0.5 rounded bg-(--bg-surface) border border-(--border-subtle)">
                    {activePresetMeta.hex}
                  </code>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      style={{ backgroundColor: activeHexValue }}
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      aria-hidden="true"
                    />
                    <p className="text-[11px] font-mono text-(--text-muted) truncate">
                      Custom RGB swatch active · Tap any dot above to revert
                    </p>
                  </div>
                  <code className="text-[10px] font-mono text-(--text-accent) uppercase shrink-0 px-1.5 py-0.5 rounded bg-(--bg-surface) border border-brand/40">
                    {activeHexValue}
                  </code>
                </>
              )}
            </div>
          </div>

          {/* Custom Accent RGB & Hex Picker Control */}
          <div
            className={cn(
              "rounded-(--radius-control) border p-3.5 sm:p-4 space-y-2.5 transition-colors",
              draft.accentPreset === "custom"
                ? "bg-(--bg-badge-highlight) border-brand"
                : "bg-(--bg-surface-2) border-(--border-subtle)"
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-(--text-primary)">
                Custom RGB &amp; Hex{" "}
                <span className="whitespace-nowrap">
                  Swatch
                  <span className="inline-flex align-middle ml-1.5">
                    <InfoTooltip
                      label="Auto WCAG accent token derivation"
                      content="Selecting or adjusting any custom color applies live immediately. Hover shade, deep shadow stop, button contrast ink, and accessible text-accent tokens auto-compute from your swatch."
                    />
                  </span>
                </span>
              </span>
              {draft.accentPreset === "custom" && (
                <StatusPill label="Custom Active" variant="accent" size="xs" />
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-2.5 sm:gap-3 items-center">
              <ColorPickerDropdown
                id="appearance-custom-accent-picker"
                label="Custom Spectrum & Hex Selector"
                value={activeHexValue}
                onChange={handleCustomPickerChange}
                presets={ACCENT_PRESETS.map((p) => ({
                  id: p.id,
                  label: p.name,
                  hex: p.hex,
                }))}
              />
              <p className="text-[11px] text-(--text-muted) leading-relaxed">
                Opens the RGB spectrum &amp; Hex picker modal on mobile or anchored panel on desktop. Changes preview live right away with WCAG contrast checks.
              </p>
            </div>
          </div>
        </div>
      </div>
  );

  /* 2. Typography Pairing & Public Scale */
  const typographySectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5"
    >
      <SectionHeader
        eyebrow="Typography & Rhythm"
        title="Font Pairings & Display Scale"
        size="sm"
        tooltip={
          <InfoTooltip
            label="Font pairings & display scale scope"
            content="Font pairings switch display headlines and sans copy across every route. Public Portfolio Type Scale adjusts headline, hero, and body rem proportions strictly on / while keeping the /admin workbench locked."
          />
        }
        rightSlot={<Type className="w-5 h-5 text-(--text-accent)" />}
      />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3 items-stretch">
          {FONT_PAIRINGS.map((pairing) => {
            const active = draft.fontPairing === pairing.id;
            const fontStyles = FONT_PAIRING_STYLE_MAP[pairing.id];
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
          <div className="space-y-0.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
              <span>Public Portfolio Type Scale</span>
              <InfoTooltip
                label="How Type Scale applies"
                content="Scales CSS display, hero, and prose variables via data-scale across your public homepage (Compact: ~0.86x, Standard: 1.0x, Large: ~1.16x)."
              />
            </span>
            <p className="text-[10px] font-mono text-(--text-muted) opacity-85">
              Scoped strictly to public sections (/admin rail stride locked)
            </p>
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
  );

  /* 3. Surface Geometry, Texture, Navbar & Grid */
  const surfaceSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-5 sm:space-y-6"
    >
      <SectionHeader
        eyebrow="Spatial Surfaces & Grid"
        title="Corners, Texture, Navbar & Layout"
        size="sm"
        tooltip={
          <InfoTooltip
            label="Spatial surface design tokens"
            content="Controls CSS corner radii across cards and inputs, canvas backdrop pattern behind Hero/Sections, frosted vs opaque header blur, and asymmetric Projects grid offset."
          />
        }
        rightSlot={<LayoutGrid className="w-5 h-5 text-(--text-accent)" />}
      />

      {/* Corner Radius */}
      <div className="space-y-2.5">
        <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
          Corner Geometry
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
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
                  "text-left border p-3 sm:p-3.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand flex items-start gap-3",
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 pt-3 border-t border-(--border-subtle)">
        <div className="space-y-2">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
            Public Canvas Texture
          </span>
          <SegmentedPills<CanvasTextureMode>
            value={draft.canvasTexture}
            onChange={(canvasTexture) =>
              updateDraft((prev) => ({ ...prev, canvasTexture }))
            }
            columnsClass="grid-cols-3"
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
          <span className="text-[0.6875rem] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
            Selected Systems Default View
          </span>
          <SegmentedPills<ProjectsLayoutMode>
            value={draft.projectsLayout}
            onChange={(projectsLayout) =>
              updateDraft((prev) => ({ ...prev, projectsLayout }))
            }
            columnsClass="grid-cols-2"
            options={[
              { id: "staggered", label: "Spotlight Deck" },
              { id: "aligned", label: "2-Col Grid" },
            ]}
          />
        </div>
      </div>
    </div>
  );

  /* 4. Cinematic Motion, Preloader, Marquee & Media FX */
  const motionSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-5 sm:space-y-6"
    >
      <SectionHeader
        eyebrow="Choreography & Media"
        title="Motion, Scroll, Preloader & Portrait FX"
        size="sm"
        tooltip={
          <InfoTooltip
            label="Motion precedence & battery-friendly fallback"
            content="OS Reduced Motion or a local reduced override always wins over Full Cinema so animations disable cleanly on low-power devices or accessible setups."
          />
        }
        rightSlot={<Sparkles className="w-5 h-5 text-(--text-accent)" />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="space-y-2">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
            Site Motion Policy
          </span>
          <SegmentedPills<MotionPreferenceMode>
            value={draft.motionMode}
            onChange={(motionMode) =>
              updateDraft((prev) => ({ ...prev, motionMode }))
            }
            columnsClass="grid-cols-1 min-[420px]:grid-cols-3"
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
            columnsClass="grid-cols-3"
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
            columnsClass="grid-cols-1 min-[420px]:grid-cols-3"
            options={[
              { id: "slow", label: "Slow (36s)" },
              { id: "normal", label: "Normal (24s)" },
              { id: "fast", label: "Fast (14s)" },
            ]}
          />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
            Media &amp; Portrait Color Grade
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 pt-2 border-t border-(--border-subtle)">
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
  );

  /* 5. This Device Only — Local Browser Overrides & Runtime Diagnostics */
  const localDeviceSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-5"
    >
      <SectionHeader
        eyebrow="Local Browser Only · Safe to Test"
        title="This Device Only & Runtime Telemetry"
        size="sm"
        tooltip={
          <InfoTooltip
            label="Local device overrides vs Published DB"
            content="Controls below save exclusively in your browser localStorage for personal testing—other visitors never see your local overrides."
          />
        }
        rightSlot={<SlidersHorizontal className="w-5 h-5 text-(--text-accent)" />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
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
                    "px-2.5 py-2 sm:px-3 rounded-(--radius-control) border text-[11px] sm:text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors",
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
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
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
                    "px-3 py-2 rounded-(--radius-control) border text-[11px] sm:text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors",
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
      <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Gauge className="w-4 h-4 text-(--text-accent) shrink-0" />
            <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-(--text-muted) font-semibold truncate">
              Runtime Diagnostics
            </span>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleResetPreloaderSession}
            className="w-full sm:w-auto shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span>Reset Session Preloader</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) px-2.5 py-2 min-w-0">
            <span className="block text-[9px] font-mono uppercase tracking-wider text-(--text-muted) truncate">
              Effective Theme
            </span>
            <span className="block text-xs font-mono font-semibold text-(--text-accent) mt-0.5 uppercase truncate">
              {theme}
            </span>
          </div>

          <div className="rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) px-2.5 py-2 min-w-0">
            <span className="block text-[9px] font-mono uppercase tracking-wider text-(--text-muted) truncate">
              Motion Engine
            </span>
            <span
              className={cn(
                "block text-xs font-mono font-semibold mt-0.5 uppercase truncate",
                effectiveReducedMotion
                  ? "text-amber-400"
                  : "text-(--text-success)"
              )}
            >
              {effectiveReducedMotion ? "Reduced" : "Full Cinema"}
            </span>
          </div>

          <div className="rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) px-2.5 py-2 min-w-0">
            <span className="block text-[9px] font-mono uppercase tracking-wider text-(--text-muted) truncate">
              OS Reduced Pref
            </span>
            <span className="block text-xs font-mono font-semibold text-(--text-primary) mt-0.5 uppercase truncate">
              {osReducedMotion ? "Enabled" : "Off"}
            </span>
          </div>

          <div className="rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface) px-2.5 py-2 min-w-0">
            <span className="block text-[9px] font-mono uppercase tracking-wider text-(--text-muted) truncate">
              View Transitions
            </span>
            <span
              className={cn(
                "block text-xs font-mono font-semibold mt-0.5 uppercase truncate",
                supportsViewTransitions
                  ? "text-(--text-success)"
                  : "text-(--text-primary)"
              )}
            >
              {supportsViewTransitions ? "Native" : "RAF Fallback"}
            </span>
          </div>
        </div>
      </div>

      {preloaderSessionNotice && (
        <p className="text-[11px] font-mono text-(--text-muted)">
          {preloaderSessionNotice}
        </p>
      )}
    </div>
  );

  const appearancePanels = [
    themeSectionNode,
    typographySectionNode,
    surfaceSectionNode,
    motionSectionNode,
    localDeviceSectionNode,
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Studio Control Bar (Sticky on Desktop `lg+`) */}
      <div
        data-cascade
        data-sticky-ceiling="true"
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 lg:sticky lg:top-16 [@media(max-height:620px)]:static z-20 shadow-lg"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-(--text-accent)">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                  <span>Theme &amp; Token Studio</span>
                </span>
                {isDirty && (
                  <StatusPill
                    label="Unsaved Draft"
                    variant="warning"
                    size="xs"
                  />
                )}
              </div>

              <h2 className="font-display text-lg sm:text-2xl uppercase tracking-tight leading-tight text-(--text-primary)">
                Design Token, Theme &amp; Motion{" "}
                <span className="whitespace-nowrap">
                  Studio
                  <span className="inline-flex align-middle ml-1.5">
                    <InfoTooltip
                      label="Live preview vs published defaults"
                      content="Every tweak previews instantaneously across Admin & the Stage Preview without modifying the database until you confirm Save & Publish."
                    />
                  </span>
                </span>
              </h2>
            </div>

            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/40 flex items-center justify-center shrink-0 text-(--text-accent)">
              <Palette className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

          <p className="text-[11px] sm:text-xs text-(--text-muted) leading-snug">
            <span className="sm:hidden">Previews live across components · Publish to save</span>
            <span className="hidden sm:inline">
              Changes preview live across every component. Publish to persist site-wide defaults.
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 sm:gap-2.5 w-full lg:w-auto shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => setConfirmResetOpen(true)}
            className="w-full sm:w-auto text-(--text-secondary) border border-(--border-subtle) sm:border-transparent"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Reset Defaults</span>
          </Button>

          {isDirty && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={handleDiscard}
              className="w-full sm:w-auto"
            >
              <span>Discard Draft</span>
            </Button>
          )}

          <div className={cn(isDirty && "col-span-2 sm:col-span-1")}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!isDirty || saving}
              onClick={() => setConfirmSaveOpen(true)}
              className="w-full sm:w-auto"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Save className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{saving ? "Publishing..." : "Save & Publish"}</span>
            </Button>
          </div>
        </div>
      </div>

      {isMobileOrTablet ? (
        <>
          {/* Compact Collapsible Real-Time Stage Drawer for Mobile/Tablet */}
          <div
            data-cascade
            className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) overflow-hidden shadow-sm"
          >
            <button
              type="button"
              onClick={() => setMobileStageOpen((prev) => !prev)}
              aria-expanded={mobileStageOpen}
              className="w-full p-3.5 flex items-center justify-between gap-2.5 text-left hover:bg-(--bg-surface-2)/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex items-center justify-center shrink-0 relative">
                  <Eye className="w-4 h-4 text-(--text-accent)" />
                  <span
                    style={{ backgroundColor: resolvedAccentHex }}
                    className="w-2 h-2 rounded-full absolute -top-0.5 -right-0.5 ring-2 ring-(--bg-surface)"
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-(--text-accent) font-semibold block">
                    Live Preview Stage
                  </span>
                  <p className="text-[11px] text-(--text-muted) truncate mt-0.5">
                    {activeThemeMeta.name} · {activeFontMeta.displayLabel} ·{" "}
                    {activeRadiusMeta.pxCard}
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-(--text-secondary) shrink-0 px-2.5 py-1 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle)">
                <span>{mobileStageOpen ? "Hide" : "Preview"}</span>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 transition-transform duration-300",
                    mobileStageOpen && "rotate-180"
                  )}
                />
              </span>
            </button>

            <Collapsible open={mobileStageOpen}>
              <div className="px-3.5 pb-3.5 pt-2 border-t border-(--border-subtle)">
                <AppearancePreviewCard
                  draft={draft}
                  effectiveTheme={theme}
                  isDirty={isDirty}
                  embedded
                />
              </div>
            </Collapsible>
          </div>

          <AdminMobileStepView
            ariaLabel="Appearance studio sections"
            steps={APPEARANCE_STEPS}
            activeStep={activeStep}
            direction={stepDirection}
            onChangeStep={(next) => switchStep(next as AppearanceStep)}
            finalAction={
              isDirty
                ? {
                    label: saving ? "Publishing..." : "Publish Tokens",
                    variant: "primary",
                    icon: saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Save className="w-3.5 h-3.5 shrink-0" />
                    ),
                    disabled: saving,
                    onClick: () => setConfirmSaveOpen(true),
                  }
                : undefined
            }
          >
            {appearancePanels[activeStep] ?? appearancePanels[0]}
          </AdminMobileStepView>
        </>
      ) : (
        <>
          <AppearancePreviewCard
            draft={draft}
            effectiveTheme={theme}
            isDirty={isDirty}
          />
          {themeSectionNode}
          {typographySectionNode}
          {surfaceSectionNode}
          {motionSectionNode}
          {localDeviceSectionNode}
        </>
      )}

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
