"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BarChart3,
  BookOpen,
  Cpu,
  Database,
  FolderKanban,
  HardDriveDownload,
  Inbox,
  KeyRound,
  Palette,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import type { PortfolioDatabase } from "@/types/portfolio";
import { ModalShell } from "@/components/ui/ModalShell";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import {
  SearchCommandBar,
  type SearchCommandBarHandle,
  type SearchCommandItem,
} from "@/components/ui/SearchCommandBar";
import {
  buildGlobalSearchEntries,
  focusSearchTargetField,
  rankGlobalSearchEntries,
  type GlobalSearchEntry,
  type GlobalSearchIconKey,
} from "./globalSearchIndex";
import type { AdminTab, SettingsSectionId } from "./types";

export interface AdminGlobalSearchProps {
  db: PortfolioDatabase;
  activeTab: AdminTab;
  onNavigateTab: (tab: AdminTab) => void;
  onNavigateSettingsSection: (section: SettingsSectionId) => void;
}

function renderEntryIcon(iconKey: GlobalSearchIconKey) {
  const cls = "w-3.5 h-3.5";
  switch (iconKey) {
    case "overview":
      return <BarChart3 className={cls} />;
    case "profile":
      return <User className={cls} />;
    case "story":
      return <BookOpen className={cls} />;
    case "skills":
      return <Cpu className={cls} />;
    case "projects":
      return <FolderKanban className={cls} />;
    case "inbox":
      return <Inbox className={cls} />;
    case "settings":
      return <Settings className={cls} />;
    case "password":
      return <KeyRound className={cls} />;
    case "security":
      return <ShieldCheck className={cls} />;
    case "appearance":
      return <Palette className={cls} />;
    case "database":
      return <Database className={cls} />;
    case "pwa":
      return <HardDriveDownload className={cls} />;
    case "maintenance":
      return <Trash2 className={cls} />;
    case "field":
      return <SlidersHorizontal className={cls} />;
    case "suggestion":
    default:
      return <Sparkles className={cls} />;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

function toCommandItem(
  entry: GlobalSearchEntry,
  activeTab: AdminTab
): SearchCommandItem<GlobalSearchEntry> {
  const isActiveModule =
    entry.action.kind === "tab" &&
    !entry.action.focusTarget &&
    entry.action.tab === activeTab;

  return {
    id: entry.id,
    title: entry.title,
    subtitle: entry.subtitle,
    icon: renderEntryIcon(entry.iconKey),
    badge: isActiveModule ? "Active Tab" : entry.badge,
    badgeVariant: isActiveModule ? "accent" : entry.badgeVariant,
    meta: entry,
  };
}

/**
 * Global Admin CMS Search powered by the shared `SearchCommandBar` component
 * matching Settings Hub's "Find a setting" experience.
 * Indexes modules, settings, suggested actions, form fields, and live records.
 */
export function AdminGlobalSearch({
  db,
  activeTab,
  onNavigateTab,
  onNavigateSettingsSection,
}: AdminGlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const desktopSlotRef = useRef<HTMLDivElement>(null);
  const desktopSearchRef = useRef<SearchCommandBarHandle>(null);
  const mobileSearchRef = useRef<SearchCommandBarHandle>(null);

  const allEntries = useMemo(() => buildGlobalSearchEntries(db), [db]);

  const rankedEntries = useMemo(
    () => rankGlobalSearchEntries(allEntries, query),
    [allEntries, query]
  );

  const commandItems = useMemo(
    () => rankedEntries.map((entry) => toCommandItem(entry, activeTab)),
    [activeTab, rankedEntries]
  );

  const fallbackCommandItems = useMemo(
    () =>
      allEntries
        .filter((entry) => entry.popular)
        .slice(0, 5)
        .map((entry) => toCommandItem(entry, activeTab)),
    [activeTab, allEntries]
  );

  const handleSelectEntry = useCallback(
    (item: SearchCommandItem<GlobalSearchEntry>) => {
      const { action } = item.meta;

      if (action.kind === "settings" && action.settingsSection) {
        onNavigateSettingsSection(action.settingsSection);
      } else {
        onNavigateTab(action.tab);
      }

      if (action.focusTarget) {
        focusSearchTargetField(action.focusTarget);
      }

      setQuery("");
      setMobileOpen(false);
      desktopSearchRef.current?.blur();
    },
    [onNavigateSettingsSection, onNavigateTab]
  );

  // Global keyboard shortcuts: Ctrl+K / Cmd+K or "/" outside editable fields
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrlK =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isSlash =
        e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;

      if (!isCmdOrCtrlK && !(isSlash && !isEditableTarget(e.target))) {
        return;
      }

      e.preventDefault();
      const desktopVisible =
        desktopSlotRef.current !== null &&
        desktopSlotRef.current.offsetParent !== null;

      if (desktopVisible) {
        desktopSearchRef.current?.focus(true);
      } else {
        setMobileOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-focus reusable search input inside mobile dialog once opened
  useEffect(() => {
    if (!mobileOpen) return;
    const rafId = requestAnimationFrame(() => {
      mobileSearchRef.current?.focus(false);
    });
    return () => cancelAnimationFrame(rafId);
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop / Tablet Reusable Search Bar (positioned closely beside Portfolio CMS) */}
      <div
        ref={desktopSlotRef}
        className="hidden md:block flex-1 max-w-sm lg:max-w-md min-w-0"
      >
        <SearchCommandBar
          ref={desktopSearchRef}
          id="admin-global-search"
          compact
          value={query}
          onChange={setQuery}
          placeholder="Search fields, settings, suggestions..."
          ariaLabel="Global CMS workspace search"
          clearAriaLabel="Clear global search"
          shortcutHint="Ctrl K"
          idleHeading="Suggested Actions & Quick Jump"
          maxDropdownHeightPx={340}
          panelClassName="right-auto min-w-full sm:w-md lg:w-136 max-w-[calc(100vw-2rem)]"
          items={commandItems}
          fallbackItems={fallbackCommandItems}
          onSelect={handleSelectEntry}
        />
      </div>

      {/* Mobile Search Trigger Button (< md, next to Portfolio CMS) */}
      <div className="md:hidden shrink-0">
        <Tooltip content="Global Search (Ctrl+K)" side="bottom">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open global workspace search"
          >
            <Search className="w-3.5 h-3.5" />
          </Button>
        </Tooltip>
      </div>

      {/* Mobile Command Search Dialog sharing SearchCommandBar UI */}
      <ModalShell
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ariaLabelledBy="admin-mobile-search-title"
        maxWidthClassName="max-w-lg"
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="admin-mobile-search-title"
              className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-secondary)"
            >
              Global CMS Search
            </h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setMobileOpen(false)}
              aria-label="Close global search modal"
              className="h-7 px-2.5 text-[10px] font-mono"
            >
              <X className="w-3 h-3" />
              <span>Esc</span>
            </Button>
          </div>

          <SearchCommandBar
            ref={mobileSearchRef}
            id="admin-mobile-global-search"
            compact
            panelMode="inline"
            defaultOpen
            value={query}
            onChange={setQuery}
            placeholder="Search fields, settings, suggestions..."
            ariaLabel="Search CMS fields, settings, and suggestions"
            clearAriaLabel="Clear search query"
            idleHeading="Suggested Actions & Quick Jump"
            maxDropdownHeightPx={320}
            items={commandItems}
            fallbackItems={fallbackCommandItems}
            onSelect={handleSelectEntry}
          />
        </div>
      </ModalShell>
    </>
  );
}
