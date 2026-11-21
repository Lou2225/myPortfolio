import React from "react";
import {
  Award,
  BarChart3,
  User,
  BookOpen,
  Cpu,
  FolderKanban,
  HardDrive,
  Inbox,
  Settings,
} from "lucide-react";

export type AdminTab =
  | "overview"
  | "profile"
  | "story"
  | "skills"
  | "certificates"
  | "projects"
  | "inbox"
  | "vault"
  | "settings";

export const ADMIN_TABS: readonly AdminTab[] = [
  "overview",
  "profile",
  "story",
  "skills",
  "certificates",
  "projects",
  "inbox",
  "vault",
  "settings",
];

/**
 * Returns horizontal transition direction based on canonical CMS module order
 * so bottom nav, sidebar, search, and browser history slide forward/back intuitively.
 */
export function getAdminTabDirection(
  fromTab: AdminTab,
  toTab: AdminTab
): "forward" | "back" {
  const fromIdx = ADMIN_TABS.indexOf(fromTab);
  const toIdx = ADMIN_TABS.indexOf(toTab);
  if (fromIdx === -1 || toIdx === -1 || toIdx >= fromIdx) {
    return "forward";
  }
  return "back";
}

/**
 * Parses an arbitrary URL/storage string into a safe AdminTab, falling back to `"overview"`.
 */
export function parseAdminTab(value?: string | null): AdminTab {
  if (value && (ADMIN_TABS as readonly string[]).includes(value)) {
    return value as AdminTab;
  }
  return "overview";
}

export type SettingsSectionId =
  | "hub"
  | "password"
  | "appearance"
  | "security"
  | "database"
  | "pwa"
  | "maintenance";

const SETTINGS_SECTIONS: readonly SettingsSectionId[] = [
  "hub",
  "password",
  "appearance",
  "security",
  "database",
  "pwa",
  "maintenance",
];

/**
 * Parses an arbitrary URL query section value into a safe `SettingsSectionId`, falling back to `"hub"`.
 */
export function parseSettingsSection(value?: string | null): SettingsSectionId {
  if (value && (SETTINGS_SECTIONS as readonly string[]).includes(value)) {
    return value as SettingsSectionId;
  }
  return "hub";
}

export interface AdminNavItem {
  id: AdminTab;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  isAlertBadge?: boolean;
}

export function getAdminNavItems(counts: {
  projectsCount: number;
  unreadMessagesCount: number;
  certificatesCount?: number;
  vaultFilesCount?: number;
}): AdminNavItem[] {
  return [
    {
      id: "overview",
      label: "Analytics & Overview",
      shortLabel: "Overview",
      description: "Funnel engagement, KPIs & live visitor telemetry",
      icon: BarChart3,
    },
    {
      id: "profile",
      label: "Profile & Hero",
      shortLabel: "Profile",
      description: "Identity, avatar portrait, roles, CV & contact links",
      icon: User,
    },
    {
      id: "story",
      label: "Story & Marquee",
      shortLabel: "Story",
      description: "Origin narrative, 4 engineering pillars & ticker",
      icon: BookOpen,
    },
    {
      id: "skills",
      label: "Skills & Impact",
      shortLabel: "Skills",
      description: "4-layer architecture bento & impact metrics",
      icon: Cpu,
    },
    {
      id: "certificates",
      label: "Certificates & Honors",
      shortLabel: "Certificates",
      description: "Academic honors, degrees, cloud & analytics credentials",
      icon: Award,
      badge: counts.certificatesCount,
    },
    {
      id: "projects",
      label: "Projects CRUD",
      shortLabel: "Projects",
      description: "Create, edit, reorder & publish system case studies",
      icon: FolderKanban,
      badge: counts.projectsCount,
    },
    {
      id: "inbox",
      label: "Message Inbox",
      shortLabel: "Inbox",
      description: "Direct recruiter & client inquiries from contact form",
      icon: Inbox,
      badge:
        counts.unreadMessagesCount > 0 ? counts.unreadMessagesCount : undefined,
      isAlertBadge: counts.unreadMessagesCount > 0,
    },
    {
      id: "vault",
      label: "Personal Drive (Vault)",
      shortLabel: "My Drive",
      description: "Secure private cloud vault for soft-copy documents & records",
      icon: HardDrive,
      badge: counts.vaultFilesCount,
    },
    {
      id: "settings",
      label: "System Settings",
      shortLabel: "Settings",
      description:
        "Device security, database diagnostics, JSON backup/restore & factory reset",
      icon: Settings,
    },
  ];
}
