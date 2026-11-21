"use client";

import { useCallback } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { PortfolioDatabase } from "@/types/portfolio";
import type { AdminPasswordSource } from "@/lib/auth";
import type { SettingsSectionId } from "@/components/admin/layout/types";
import { AdminSlideView } from "@/components/motion/AdminMotion";
import { Button } from "@/components/ui/Button";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import { SettingsHub } from "./settings/SettingsHub";
import { PasswordCredentialsSettings } from "./settings/PasswordCredentialsSettings";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { SecurityAccessSettings } from "./settings/SecurityAccessSettings";
import { DatabaseBackupSettings } from "./settings/DatabaseBackupSettings";
import { OfflinePwaSettings } from "./settings/OfflinePwaSettings";
import { MaintenanceDangerSettings } from "./settings/MaintenanceDangerSettings";
import {
  SETTINGS_SECTIONS_META,
  type SettingsFeedback,
} from "./settings/types";

export interface SettingsManagerProps {
  db: PortfolioDatabase;
  storageMode: "local-json" | "supabase";
  deviceRegistered: boolean;
  togglingDevice: boolean;
  resettingSeed: boolean;
  passwordSource: AdminPasswordSource;
  envConfigured: boolean;
  overrideUpdatedAt: string | null;
  activeSection: SettingsSectionId;
  onSelectSection: (section: SettingsSectionId) => void;
  onPasswordMetaChange: (meta: {
    passwordSource: AdminPasswordSource;
    envConfigured: boolean;
    overrideUpdatedAt: string | null;
  }) => void;
  onToggleDevice: () => void;
  onResetSeed: () => Promise<void> | void;
  onDatabaseSync: (nextDb: PortfolioDatabase) => Promise<void> | void;
  onLogout: (unregisterDevice?: boolean) => Promise<void> | void;
  onSyncAuth?: () => Promise<void> | void;
}

/**
 * Windows 11-inspired modular `/admin` Settings Workspace.
 * Displays a searchable overview hub of clickable navigation cards that drill smoothly
 * via `<AdminCascade>` into focused configuration partials.
 */
export function SettingsManager({
  db,
  storageMode,
  deviceRegistered,
  togglingDevice,
  resettingSeed,
  passwordSource,
  envConfigured,
  overrideUpdatedAt,
  activeSection,
  onSelectSection,
  onPasswordMetaChange,
  onToggleDevice,
  onResetSeed,
  onDatabaseSync,
  onLogout,
  onSyncAuth,
}: SettingsManagerProps) {
  const handleFeedback = useCallback((next: SettingsFeedback | null) => {
    if (!next) return;
    if (next.type === "error") {
      announceBrandPortalStatus({
        tone: "error",
        label: "Action Failed",
        detail: next.message,
      });
    } else {
      announceBrandPortalStatus({
        tone: "live",
        label: "Updated",
        detail: next.message,
        durationMs: 2800,
      });
    }
  }, []);

  const activeMeta = SETTINGS_SECTIONS_META.find(
    (s) => s.id === activeSection
  );

  const handleNavigate = (nextSection: SettingsSectionId) => {
    onSelectSection(nextSection);
  };

  const slideDirection: "forward" | "back" =
    activeSection === "hub" ? "back" : "forward";

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="overflow-x-clip">
        <AdminSlideView
          activeKey={activeSection}
          direction={slideDirection}
          distancePx={40}
          skipInitial
        >
          {activeSection !== "hub" && activeMeta && (
          <div
            data-cascade
            className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 mb-4 sm:mb-6"
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleNavigate("hub")}
                aria-label="Back to all Settings"
                className="font-mono text-xs h-9 pl-2.5 pr-3.5 gap-1 leading-none shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Settings</span>
              </Button>

              <ChevronRight
                className="hidden sm:block w-3.5 h-3.5 text-(--text-muted) shrink-0"
                aria-hidden="true"
              />

              <span className="text-sm font-semibold text-(--text-primary) truncate">
                {activeMeta.title}
              </span>
            </div>

            <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
              {activeMeta.eyebrow}
            </span>
          </div>
        )}

        {activeSection === "hub" && (
          <SettingsHub
            db={db}
            onNavigateSection={(sec) => handleNavigate(sec)}
          />
        )}

        {activeSection === "password" && (
          <PasswordCredentialsSettings
            storageMode={storageMode}
            passwordSource={passwordSource}
            envConfigured={envConfigured}
            overrideUpdatedAt={overrideUpdatedAt}
            onPasswordMetaChange={onPasswordMetaChange}
            onFeedback={handleFeedback}
          />
        )}

        {activeSection === "appearance" && (
          <AppearanceSettings
            db={db}
            onDatabaseSync={async (nextDb) => {
              await onDatabaseSync(nextDb);
            }}
            onFeedback={handleFeedback}
          />
        )}

        {activeSection === "security" && (
          <SecurityAccessSettings
            deviceRegistered={deviceRegistered}
            togglingDevice={togglingDevice}
            onToggleDevice={onToggleDevice}
            onLogout={onLogout}
            onFeedback={handleFeedback}
            onSyncAuth={onSyncAuth}
          />
        )}

        {activeSection === "database" && (
          <DatabaseBackupSettings
            db={db}
            storageMode={storageMode}
            onDatabaseSync={async (nextDb) => {
              await onDatabaseSync(nextDb);
            }}
            onFeedback={handleFeedback}
          />
        )}

        {activeSection === "pwa" && (
          <OfflinePwaSettings onFeedback={handleFeedback} />
        )}

        {activeSection === "maintenance" && (
          <MaintenanceDangerSettings
            db={db}
            resettingSeed={resettingSeed}
            onDatabaseSync={async (nextDb) => {
              await onDatabaseSync(nextDb);
            }}
            onResetSeed={onResetSeed}
            onFeedback={handleFeedback}
          />
        )}
        </AdminSlideView>
      </div>
    </div>
  );
}
