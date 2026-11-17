"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { PortfolioDatabase } from "@/types/portfolio";
import type { AdminPasswordSource } from "@/lib/auth";
import type { SettingsSectionId } from "@/components/admin/layout/types";
import { AdminCascade } from "@/components/motion/AdminMotion";
import { AdminAlertBanner } from "@/components/admin/AdminAlertBanner";
import { Button } from "@/components/ui/Button";
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
  const [feedback, setFeedback] = useState<SettingsFeedback | null>(null);

  const activeMeta = SETTINGS_SECTIONS_META.find(
    (s) => s.id === activeSection
  );

  const handleNavigate = (nextSection: SettingsSectionId) => {
    setFeedback(null);
    onSelectSection(nextSection);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {feedback && feedback.type === "error" && (
        <AdminAlertBanner
          variant="error"
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      <AdminCascade activeKey={activeSection} skipInitial>
        {activeSection !== "hub" && activeMeta && (
          <div
            data-cascade
            className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm px-3.5 sm:px-5 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 mb-5 sm:mb-6"
          >
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleNavigate("hub")}
                aria-label="Back to all Settings"
                className="font-mono text-xs h-8.5 px-2.5 sm:px-3 shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Settings</span>
              </Button>

              <ChevronRight
                className="w-3.5 h-3.5 text-(--text-muted) shrink-0"
                aria-hidden="true"
              />

              <span className="text-xs sm:text-sm font-semibold text-(--text-primary) truncate">
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
            storageMode={storageMode}
            deviceRegistered={deviceRegistered}
            passwordSource={passwordSource}
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
            onFeedback={setFeedback}
          />
        )}

        {activeSection === "appearance" && (
          <AppearanceSettings
            db={db}
            onDatabaseSync={async (nextDb) => {
              await onDatabaseSync(nextDb);
            }}
            onFeedback={setFeedback}
          />
        )}

        {activeSection === "security" && (
          <SecurityAccessSettings
            deviceRegistered={deviceRegistered}
            togglingDevice={togglingDevice}
            onToggleDevice={onToggleDevice}
            onLogout={onLogout}
            onFeedback={setFeedback}
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
            onFeedback={setFeedback}
          />
        )}

        {activeSection === "pwa" && (
          <OfflinePwaSettings onFeedback={setFeedback} />
        )}

        {activeSection === "maintenance" && (
          <MaintenanceDangerSettings
            db={db}
            resettingSeed={resettingSeed}
            onDatabaseSync={async (nextDb) => {
              await onDatabaseSync(nextDb);
            }}
            onResetSeed={onResetSeed}
            onFeedback={setFeedback}
          />
        )}
      </AdminCascade>
    </div>
  );
}
