"use client";

import { useMemo } from "react";
import { AdminNavItem, AdminTab } from "./types";
import { Tabs, TabItem } from "@/components/ui/Tabs";

export interface AdminMobileNavProps {
  items: AdminNavItem[];
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
}

/**
 * Responsive Mobile Bottom Navigation Dock (`< md` screens)
 * Reuses `Tabs` (`size="dock"`, `layout="equal"`) so the active pill glides
 * sideways smoothly just like the desktop vertical sidebar.
 */
export function AdminMobileNav({
  items,
  activeTab,
  onSelectTab,
}: AdminMobileNavProps) {
  const tabItems = useMemo<TabItem<AdminTab>[]>(
    () =>
      items.map((item) => {
        const Icon = item.icon;
        return {
          id: item.id,
          label: item.label,
          shortLabel: item.shortLabel,
          icon: <Icon className="w-4 h-4 shrink-0" />,
          badge: item.badge,
          isAlertBadge: item.isAlertBadge,
          badgeVariant: item.isAlertBadge ? "alert" : "neutral",
          ariaLabel: item.label,
        };
      }),
    [items]
  );

  return (
    <div className="md:hidden fixed bottom-3 inset-x-3 z-40">
      <Tabs
        items={tabItems}
        value={activeTab}
        onChange={onSelectTab}
        ariaLabel="Mobile CMS Module Navigation"
        size="dock"
        layout="equal"
        variant="accent"
        className="w-full"
      />
    </div>
  );
}
