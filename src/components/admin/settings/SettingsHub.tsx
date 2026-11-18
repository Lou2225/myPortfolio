"use client";

import { useMemo, useRef, useState } from "react";
import {
  KeyRound,
  ShieldCheck,
  Palette,
  WifiOff,
  Database,
  AlertTriangle,
  Search,
} from "lucide-react";
import type { PortfolioDatabase } from "@/types/portfolio";
import type { AdminPasswordSource } from "@/lib/auth";
import type { SettingsSectionId } from "@/components/admin/layout/types";
import { ACCENT_PRESETS, FONT_PAIRINGS } from "@/data/appearance";
import { useThemePreference } from "@/components/ui/ThemeToggle";
import { useOfflineStatus } from "@/components/pwa/OfflineManager";
import { Collapsible } from "@/components/motion/Collapsible";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/Tooltip";
import {
  SearchCommandBar,
  type SearchCommandBarHandle,
  type SearchCommandItem,
} from "@/components/ui/SearchCommandBar";
import { SettingsNavCard } from "./SettingsNavCard";
import {
  SETTINGS_GROUP_LABELS,
  SETTINGS_RECOMMENDATIONS,
  SETTINGS_SECTIONS_META,
  type SettingsRecommendationItem,
  type SettingsSectionMeta,
} from "./types";

export interface SettingsHubProps {
  db: PortfolioDatabase;
  storageMode: "local-json" | "supabase";
  deviceRegistered: boolean;
  passwordSource: AdminPasswordSource;
  onNavigateSection: (section: Exclude<SettingsSectionId, "hub">) => void;
}

const GROUP_ORDER: readonly SettingsSectionMeta["group"][] = [
  "account",
  "workspace",
  "system",
];

function getSectionIcon(id: SettingsSectionMeta["id"], className = "w-4.5 h-4.5") {
  switch (id) {
    case "password":
      return <KeyRound className={className} />;
    case "security":
      return <ShieldCheck className={className} />;
    case "appearance":
      return <Palette className={className} />;
    case "pwa":
      return <WifiOff className={className} />;
    case "database":
      return <Database className={className} />;
    case "maintenance":
      return <AlertTriangle className={className} />;
  }
}

function toRecommendationSearchItem(
  rec: SettingsRecommendationItem
): SearchCommandItem<Exclude<SettingsSectionId, "hub">> {
  const parentMeta = SETTINGS_SECTIONS_META.find((s) => s.id === rec.section);
  return {
    id: rec.id,
    title: rec.title,
    subtitle: rec.description,
    icon: getSectionIcon(rec.section, "w-3.5 h-3.5"),
    badge: parentMeta?.title,
    badgeVariant: "neutral",
    meta: rec.section,
  };
}

export function SettingsHub({
  db,
  storageMode,
  deviceRegistered,
  passwordSource,
  onNavigateSection,
}: SettingsHubProps) {
  const { theme } = useThemePreference();
  const { isOnline, swState, pendingOutboxCount } = useOfflineStatus();
  const [query, setQuery] = useState("");
  const searchBarRef = useRef<SearchCommandBarHandle>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const recommendations = useMemo<readonly SettingsRecommendationItem[]>(() => {
    if (!normalizedQuery) {
      return SETTINGS_RECOMMENDATIONS.filter((r) => r.popular);
    }

    const scored = SETTINGS_RECOMMENDATIONS.map((item) => {
      const titleLow = item.title.toLowerCase();
      const descLow = item.description.toLowerCase();
      const sectionMeta = SETTINGS_SECTIONS_META.find(
        (s) => s.id === item.section
      );
      const sectionLow = sectionMeta?.title.toLowerCase() || "";

      let score = 0;
      if (titleLow.startsWith(normalizedQuery)) score += 100;
      else if (titleLow.includes(normalizedQuery)) score += 70;
      if (item.keywords.some((k) => k.toLowerCase().startsWith(normalizedQuery)))
        score += 55;
      else if (item.keywords.some((k) => k.toLowerCase().includes(normalizedQuery)))
        score += 40;
      if (sectionLow.includes(normalizedQuery)) score += 30;
      if (descLow.includes(normalizedQuery)) score += 20;

      return { item, score };
    })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .map((entry) => entry.item);

    return scored;
  }, [normalizedQuery]);

  const fallbackSuggestions = useMemo(
    () => SETTINGS_RECOMMENDATIONS.filter((r) => r.popular).slice(0, 4),
    []
  );

  const searchCommandItems = useMemo(
    () => recommendations.map(toRecommendationSearchItem),
    [recommendations]
  );

  const searchCommandFallbackItems = useMemo(
    () => fallbackSuggestions.map(toRecommendationSearchItem),
    [fallbackSuggestions]
  );

  const matchedSectionIds = useMemo(() => {
    if (!normalizedQuery) {
      return new Set(SETTINGS_SECTIONS_META.map((s) => s.id));
    }
    const ids = new Set(recommendations.map((r) => r.section));
    for (const item of SETTINGS_SECTIONS_META) {
      if (
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.subtitle.toLowerCase().includes(normalizedQuery) ||
        item.eyebrow.toLowerCase().includes(normalizedQuery) ||
        item.keywords.some((kw) => kw.includes(normalizedQuery))
      ) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [normalizedQuery, recommendations]);

  const getBadgeMeta = (
    id: SettingsSectionMeta["id"]
  ): {
    statusLabel: string;
    statusVariant: "success" | "accent" | "warning" | "neutral";
    detailText?: string;
  } => {
    switch (id) {
      case "password":
        return {
          statusLabel:
            passwordSource === "override"
              ? "Custom Hash"
              : passwordSource === "env"
                ? "Env Managed"
                : "Not Set",
          statusVariant:
            passwordSource === "override"
              ? "accent"
              : passwordSource === "env"
                ? "success"
                : "warning",
        };
      case "security":
        return {
          statusLabel: deviceRegistered ? "Trusted Device" : "Unregistered",
          statusVariant: deviceRegistered ? "success" : "neutral",
        };
      case "appearance": {
        const presetMeta = ACCENT_PRESETS.find(
          (p) => p.id === db.appearance.accentPreset
        );
        const accentLabel =
          db.appearance.accentPreset === "custom"
            ? "Custom"
            : presetMeta?.name.split(" ")[0] || "Vermilion";
        const fontMeta = FONT_PAIRINGS.find(
          (f) => f.id === db.appearance.fontPairing
        );
        return {
          statusLabel: `${theme === "dark" ? "Obsidian" : "Daylight"} · ${accentLabel}`,
          statusVariant: "accent",
          detailText: fontMeta
            ? `${fontMeta.displayLabel} / ${fontMeta.sansLabel}`
            : undefined,
        };
      }
      case "pwa":
        return {
          statusLabel: isOnline
            ? swState === "active"
              ? "SW Ready"
              : "Online"
            : "Offline",
          statusVariant: !isOnline
            ? "warning"
            : swState === "active"
              ? "success"
              : "neutral",
          detailText:
            pendingOutboxCount > 0 ? `${pendingOutboxCount} queued` : undefined,
        };
      case "database":
        return {
          statusLabel: storageMode === "supabase" ? "Supabase" : "Local JSON",
          statusVariant: "success",
          detailText: `${db.projects.length} projects`,
        };
      case "maintenance":
        return {
          statusLabel: `${db.analytics.length} telemetry events`,
          statusVariant: "neutral",
        };
    }
  };

  return (
    <div>
      {/* Administrator Identity Card (Clean Rectangular Status Container) */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4"
      >
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-(--bg-surface-2) border border-brand/40 flex items-center justify-center shrink-0 font-display text-lg sm:text-xl text-(--text-accent)">
            {db.profile.monogram || "LV"}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-sm sm:text-base text-(--text-primary)">
                {db.profile.fullName}
                <span className="inline-flex align-middle ml-1.5">
                  <InfoTooltip
                    label="Administrator workspace posture"
                    content="Changes saved inside any module immediately revalidate ISR routes and persist to your active database engine (Supabase PostgreSQL or Local JSON)."
                  />
                </span>
              </p>
              <StatusPill label="Administrator" variant="accent" size="xs" />
            </div>
            <p className="text-xs font-mono text-(--text-muted) truncate mt-0.5">
              {db.profile.contact.email} · Last sync{" "}
              <span suppressHydrationWarning>
                {new Date(db.updatedAt).toLocaleString()}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Reusable "Find a setting" Search Command Bar */}
      <div
        data-cascade
        className="mt-4 relative z-30 bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-5"
      >
        <SearchCommandBar
          ref={searchBarRef}
          id="settings-hub-search"
          label="Find a setting"
          value={query}
          onChange={setQuery}
          placeholder="Type a keyword or pick a recommended setting..."
          items={searchCommandItems}
          fallbackItems={searchCommandFallbackItems}
          idleHeading="Recommended Settings"
          clearAriaLabel="Clear settings search"
          onSelect={(item) => onNavigateSection(item.meta)}
        />
      </div>

      {/* Collapsible Filter Results & Categorized Settings Cards */}
      <div className="mt-3">
        {/* Smoothly Filtered Fallback State when Zero Cards Match */}
        <Collapsible open={matchedSectionIds.size === 0}>
        <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-8 space-y-5">
          <div className="text-center space-y-2">
            <Search className="w-6 h-6 text-(--text-muted) mx-auto" />
            <p className="font-display text-2xl uppercase tracking-tight text-(--text-primary)">
              No Direct Setting for &ldquo;{query.trim()}&rdquo;
            </p>
            <p className="text-xs text-(--text-muted)">
              Jump straight into one of these suggested sections instead, or
              clear the filter:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
            {fallbackSuggestions.map((rec) => (
              <SettingsNavCard
                key={rec.id}
                icon={getSectionIcon(rec.section)}
                title={rec.title}
                subtitle={rec.description}
                onClick={() => onNavigateSection(rec.section)}
              />
            ))}
          </div>

          <div className="text-center pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery("");
                searchBarRef.current?.close();
              }}
            >
              Show All Settings
            </Button>
          </div>
        </div>
      </Collapsible>

      {/* Smoothly Collapsible Categorized Windows Settings Card Stack */}
      <div>
        {GROUP_ORDER.map((group, groupIdx) => {
          const groupItems = SETTINGS_SECTIONS_META.filter(
            (s) => s.group === group
          );
          const groupHasMatch = groupItems.some((item) =>
            matchedSectionIds.has(item.id)
          );
          const hasLaterMatchedGroup = GROUP_ORDER.slice(groupIdx + 1).some(
            (laterGroup) =>
              SETTINGS_SECTIONS_META.some(
                (s) => s.group === laterGroup && matchedSectionIds.has(s.id)
              )
          );

          return (
            <Collapsible
              key={group}
              open={groupHasMatch}
              allowOverflowWhenOpen
              contentClassName={hasLaterMatchedGroup ? "pb-6" : "pb-0.5"}
            >
              <section data-cascade className="space-y-2.5">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-(--text-muted) px-1">
                  {SETTINGS_GROUP_LABELS[group]}
                </h3>

                <div>
                  {groupItems.map((item, itemIdx) => {
                    const isMatched = matchedSectionIds.has(item.id);
                    const hasLaterMatchedItem = groupItems
                      .slice(itemIdx + 1)
                      .some((laterItem) =>
                        matchedSectionIds.has(laterItem.id)
                      );
                    const meta = getBadgeMeta(item.id);
                    return (
                      <Collapsible
                        key={item.id}
                        open={isMatched}
                        allowOverflowWhenOpen
                        contentClassName={
                          hasLaterMatchedItem ? "pb-2.5" : "pb-0.5"
                        }
                      >
                        <SettingsNavCard
                          icon={getSectionIcon(item.id)}
                          title={item.title}
                          subtitle={item.subtitle}
                          statusLabel={meta.statusLabel}
                          statusVariant={meta.statusVariant}
                          detailText={meta.detailText}
                          tone={item.id === "maintenance" ? "danger" : "default"}
                          onClick={() => onNavigateSection(item.id)}
                        />
                      </Collapsible>
                    );
                  })}
                </div>
              </section>
            </Collapsible>
          );
        })}
      </div>
      </div>
    </div>
  );
}
