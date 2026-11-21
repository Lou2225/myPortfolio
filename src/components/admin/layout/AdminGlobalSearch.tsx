"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Award,
  BarChart3,
  BookOpen,
  Cpu,
  Database,
  FolderKanban,
  HardDrive,
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
} from "lucide-react";
import type { PortfolioDatabase } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import {
  SearchCommandBar,
  type SearchCommandBarHandle,
  type SearchCommandItem,
} from "@/components/ui/SearchCommandBar";
import { AdminMobileSearchView } from "./AdminMobileSearchView";
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
    case "certificates":
      return <Award className={cls} />;
    case "projects":
      return <FolderKanban className={cls} />;
    case "inbox":
      return <Inbox className={cls} />;
    case "vault":
      return <HardDrive className={cls} />;
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
  const [mobileOrigin, setMobileOrigin] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const desktopSlotRef = useRef<HTMLDivElement>(null);
  const desktopSearchRef = useRef<SearchCommandBarHandle>(null);
  const mobileTriggerWrapRef = useRef<HTMLDivElement>(null);

  const openMobileSearchPage = useCallback(() => {
    const rect = mobileTriggerWrapRef.current?.getBoundingClientRect();
    setMobileOrigin(
      rect
        ? {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          }
        : null
    );
    setMobileOpen(true);
  }, []);

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
        openMobileSearchPage();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openMobileSearchPage]);

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
      <div ref={mobileTriggerWrapRef} className="md:hidden shrink-0">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={openMobileSearchPage}
          aria-label="Open global workspace search"
          className="bg-(--bg-surface-2)/60"
        >
          <Search className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Facebook-style Expanding Full-Screen Mobile Search Page */}
      <AdminMobileSearchView
        open={mobileOpen}
        origin={mobileOrigin}
        query={query}
        onQueryChange={setQuery}
        items={commandItems}
        fallbackItems={fallbackCommandItems}
        onSelect={handleSelectEntry}
        onClose={() => setMobileOpen(false)}
      />
    </>
  );
}
