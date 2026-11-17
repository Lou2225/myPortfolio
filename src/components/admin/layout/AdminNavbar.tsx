"use client";

import { PortfolioDatabase } from "@/types/portfolio";
import { AdminTab, SettingsSectionId } from "./types";
import { AdminClockBadge } from "./AdminClockBadge";
import { AdminGlobalSearch } from "./AdminGlobalSearch";
import { NotificationPopover } from "./NotificationPopover";
import { ProfileDropdown } from "./ProfileDropdown";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MonogramBadge } from "@/components/common/MonogramBadge";
import { Magnetic } from "@/components/motion/Magnetic";
import { cn } from "@/lib/utils";

export interface AdminNavbarProps {
  db: PortfolioDatabase;
  activeTab: AdminTab;
  storageMode: "local-json" | "supabase";
  deviceRegistered: boolean;
  togglingDevice: boolean;
  resettingSeed: boolean;
  onToggleDevice: () => void;
  onResetSeed: () => void;
  onLogout: () => void;
  onNavigateTab: (tab: AdminTab) => void;
  onNavigateSettingsSection: (section: SettingsSectionId) => void;
}

export function AdminNavbar({
  db,
  activeTab,
  storageMode,
  deviceRegistered,
  togglingDevice,
  resettingSeed,
  onToggleDevice,
  onResetSeed,
  onLogout,
  onNavigateTab,
  onNavigateSettingsSection,
}: AdminNavbarProps) {
  return (
    <header
      data-sticky-ceiling="true"
      className="admin-navbar-surface sticky top-0 z-40 h-16 bg-(--bg-canvas)/90 backdrop-blur-xl border-b border-(--border-subtle) px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-3"
    >
      {/* Left: Brand Monogram, CMS Title & Closely Anchored Global Search */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 lg:gap-4 flex-1 min-w-0">
        <Magnetic strength={0.2}>
          <button
            type="button"
            onClick={() => onNavigateTab("overview")}
            title="Portfolio CMS Overview"
            aria-label="Portfolio CMS Overview"
            className="cursor-pointer active:scale-95 transition-transform duration-300 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <MonogramBadge
              monogram={db.profile.monogram || "LDV"}
              imageUrl={db.profile.monogramImageUrl}
              transform={db.profile.monogramTransform}
              alt="Portfolio CMS monogram"
              className={cn(
                "w-9 h-9 sm:w-10 sm:h-10 rounded-full text-brand-contrast font-display text-sm tracking-wider transition-all duration-300",
                db.profile.monogramImageUrl
                  ? "border border-brand/70 bg-transparent shadow-[0_6px_18px_var(--accent-glow)] hover:border-brand"
                  : "bg-linear-to-br from-brand to-brand-deep shadow-[0_6px_18px_var(--accent-glow)]"
              )}
            />
          </button>
        </Magnetic>

        <span className="font-display text-base sm:text-lg uppercase tracking-tight text-(--text-primary) truncate">
          Portfolio CMS
        </span>

        {/* Global Workspace Search Bar (closely placed beside Portfolio CMS) */}
        <AdminGlobalSearch
          db={db}
          activeTab={activeTab}
          onNavigateTab={onNavigateTab}
          onNavigateSettingsSection={onNavigateSettingsSection}
        />
      </div>

      {/* Right: Live Date/Time, Theme Toggle, Notifications & Profile Dropdown */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Hydration-safe Live Local Date & Time Badge */}
        <AdminClockBadge />

        {/* Reusable Dark / Light Mode Radial Wave Toggle */}
        <ThemeToggle />

        {/* Notification Bell & Activity Popover */}
        <NotificationPopover
          messages={db.messages}
          analytics={db.analytics}
          onNavigateTab={onNavigateTab}
        />

        {/* Administrator Profile Dropdown */}
        <ProfileDropdown
          profile={db.profile}
          storageMode={storageMode}
          deviceRegistered={deviceRegistered}
          togglingDevice={togglingDevice}
          resettingSeed={resettingSeed}
          onToggleDevice={onToggleDevice}
          onResetSeed={onResetSeed}
          onLogout={onLogout}
          onNavigateTab={onNavigateTab}
        />
      </div>
    </header>
  );
}
