"use client";

import { Profile } from "@/types/portfolio";
import { AdminTab } from "./types";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { StatusPill } from "@/components/ui/StatusPill";
import { Magnetic } from "@/components/motion/Magnetic";
import { TruncatedText } from "@/components/ui/Tooltip";
import { MonogramBadge } from "@/components/common/MonogramBadge";
import {
  ChevronDown,
  User,
  FolderKanban,
  MonitorCheck,
  MonitorOff,
  RotateCcw,
  LogOut,
  Database,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProfileDropdownProps {
  profile: Profile;
  storageMode: "local-json" | "supabase";
  deviceRegistered: boolean;
  togglingDevice: boolean;
  resettingSeed: boolean;
  onToggleDevice: () => void;
  onResetSeed: () => void;
  onLogout: () => void;
  onNavigateTab: (tab: AdminTab) => void;
}

export function ProfileDropdown({
  profile,
  storageMode,
  deviceRegistered,
  togglingDevice,
  resettingSeed,
  onToggleDevice,
  onResetSeed,
  onLogout,
  onNavigateTab,
}: ProfileDropdownProps) {
  return (
    <DropdownPopover
      align="end"
      widthClassName="w-72 sm:w-80"
      trigger={({ isOpen, toggle }) => (
        <Magnetic strength={0.14}>
          <button
            type="button"
            onClick={toggle}
            aria-label="Open Administrator Profile Menu"
            aria-expanded={isOpen}
            className={cn(
              "h-8.5 pl-1.5 pr-2.5 rounded-full border inline-flex items-center gap-2 transition-all duration-300 active:scale-[0.98] cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              isOpen
                ? "border-brand bg-(--bg-badge-highlight)"
                : "border-(--border-strong) bg-(--bg-surface-2)/70 hover:border-brand"
            )}
          >
            <MonogramBadge
              monogram={profile.monogram || "LDV"}
              imageUrl={profile.monogramImageUrl}
              transform={profile.monogramTransform}
              alt={profile.fullName}
              className={cn(
                "w-6 h-6 rounded-full font-display text-[10px] tracking-wider",
                profile.monogramImageUrl
                  ? "border border-brand/60 bg-transparent"
                  : "bg-brand text-brand-contrast"
              )}
            />
            <TruncatedText
              text={profile.name}
              className="hidden sm:inline text-[11px] font-medium text-(--text-primary) max-w-27.5"
            />
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-(--text-muted) transition-transform duration-200",
                isOpen && "rotate-180 text-(--text-accent)"
              )}
            />
          </button>
        </Magnetic>
      )}
    >
      {({ close }) => (
        <div className="divide-y divide-(--border-subtle) text-xs">
          {/* Identity Summary */}
          <div className="p-4 flex items-center gap-3">
            <MonogramBadge
              monogram={profile.monogram || "LDV"}
              imageUrl={profile.monogramImageUrl}
              transform={profile.monogramTransform}
              alt={profile.fullName}
              className={cn(
                "w-10 h-10 rounded-full font-display text-sm tracking-wider shadow-[0_0_16px_var(--accent-glow)]",
                profile.monogramImageUrl
                  ? "border border-brand/60 bg-transparent"
                  : "bg-brand text-brand-contrast"
              )}
            />
            <div className="min-w-0 flex-1">
              <TruncatedText
                as="p"
                text={profile.fullName}
                className="font-semibold text-(--text-primary)"
              />
              <TruncatedText
                as="p"
                text={profile.contact.email}
                className="text-[11px] text-(--text-muted)"
              />
              <StatusPill
                label={storageMode === "supabase" ? "Supabase PG" : "Local JSON"}
                variant="neutral"
                size="xs"
                className="mt-1"
                icon={<Database className="w-2.5 h-2.5 text-(--text-accent)" />}
              />
            </div>
          </div>

          {/* Quick CMS Shortcuts */}
          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                onNavigateTab("profile");
                close();
              }}
              className="w-full px-3 py-2 rounded-lg text-left text-(--text-primary) hover:bg-(--bg-surface-2) hover:text-(--text-accent) transition-colors flex items-center gap-2.5 cursor-pointer"
            >
              <User className="w-4 h-4 text-(--text-muted)" />
              <span>Edit Profile & Hero</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigateTab("projects");
                close();
              }}
              className="w-full px-3 py-2 rounded-lg text-left text-(--text-primary) hover:bg-(--bg-surface-2) hover:text-(--text-accent) transition-colors flex items-center gap-2.5 cursor-pointer"
            >
              <FolderKanban className="w-4 h-4 text-(--text-muted)" />
              <span>Manage Projects CRUD</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigateTab("settings");
                close();
              }}
              className="w-full px-3 py-2 rounded-lg text-left text-(--text-primary) hover:bg-(--bg-surface-2) hover:text-(--text-accent) transition-colors flex items-center gap-2.5 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-(--text-muted)" />
              <span>Settings & Data Backup</span>
            </button>
          </div>

          {/* Device Registration & Seed Controls */}
          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              onClick={onToggleDevice}
              disabled={togglingDevice}
              className="w-full px-3 py-2 rounded-lg text-left hover:bg-(--bg-surface-2) transition-colors flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                {deviceRegistered ? (
                  <MonitorCheck className="w-4 h-4 text-(--text-success)" />
                ) : (
                  <MonitorOff className="w-4 h-4 text-(--text-muted)" />
                )}
                <span className="text-(--text-primary)">
                  Secret Logo Redirect
                </span>
              </span>
              <StatusPill
                label={deviceRegistered ? "Registered" : "Off"}
                variant={deviceRegistered ? "success" : "neutral"}
                size="sm"
                className={!deviceRegistered ? "text-(--text-muted)" : undefined}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                close();
                onResetSeed();
              }}
              disabled={resettingSeed}
              className="w-full px-3 py-2 rounded-lg text-left text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-surface-2) transition-colors flex items-center gap-2.5 cursor-pointer"
            >
              <RotateCcw
                className={cn(
                  "w-4 h-4 text-(--text-muted)",
                  resettingSeed && "animate-spin text-(--text-accent)"
                )}
              />
              <span>Reset Content to Seed Defaults</span>
            </button>
          </div>

          {/* Sign Out */}
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => {
                close();
                onLogout();
              }}
              className="w-full px-3 py-2 rounded-lg text-left text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-2.5 font-medium cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout of CMS</span>
            </button>
          </div>
        </div>
      )}
    </DropdownPopover>
  );
}
