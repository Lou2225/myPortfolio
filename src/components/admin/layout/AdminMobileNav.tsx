"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { AdminNavItem, AdminTab } from "./types";
import { AdminMobileMoreSheet } from "./AdminMobileMoreSheet";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { useBrandPortal } from "@/components/motion/BrandPortal";

export interface AdminMobileNavProps {
  items: AdminNavItem[];
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
}

type MobileDockValue = AdminTab | "__more__";

const PRIMARY_MOBILE_TAB_IDS: readonly AdminTab[] = [
  "overview",
  "profile",
  "projects",
  "inbox",
];

/**
 * Responsive Mobile 4+1 Bottom Navigation Dock (`< md` screens).
 * Keeps the 4 primary CMS modules directly on the dock for generous tap targets
 * and moves secondary modules (`Story`, `Skills`, `Settings`) plus a live
 * Public Portfolio (`/`) shortcut into a clean slide-up More sheet.
 */
export function AdminMobileNav({
  items,
  activeTab,
  onSelectTab,
}: AdminMobileNavProps) {
  const { triggerSlideNavigate } = useBrandPortal();
  const [moreOpen, setMoreOpen] = useState(false);
  const prevTabRef = useRef(activeTab);

  // Close the More sheet automatically if activeTab changes from Search or Notifications
  useEffect(() => {
    if (prevTabRef.current === activeTab) return;
    prevTabRef.current = activeTab;
    const rafId = requestAnimationFrame(() => setMoreOpen(false));
    return () => cancelAnimationFrame(rafId);
  }, [activeTab]);

  const primaryItems = useMemo(
    () =>
      items.filter((item) => PRIMARY_MOBILE_TAB_IDS.includes(item.id)),
    [items]
  );

  const secondaryItems = useMemo(
    () =>
      items.filter((item) => !PRIMARY_MOBILE_TAB_IDS.includes(item.id)),
    [items]
  );

  const isSecondaryActive = secondaryItems.some((item) => item.id === activeTab);

  const dockTabItems = useMemo<TabItem<MobileDockValue>[]>(
    () => [
      ...primaryItems.map((item) => {
        const Icon = item.icon;
        return {
          id: item.id,
          label: item.label,
          shortLabel: item.shortLabel,
          icon: <Icon className="w-4 h-4 shrink-0" />,
          badge: item.badge,
          isAlertBadge: item.isAlertBadge,
          badgeVariant: item.isAlertBadge ? ("alert" as const) : ("neutral" as const),
          ariaLabel: item.label,
        };
      }),
      {
        id: "__more__",
        label: "More modules & live portfolio",
        shortLabel: "More",
        icon: <LayoutGrid className="w-4 h-4 shrink-0" />,
        ariaLabel: "More CMS modules and Public Portfolio link",
      },
    ],
    [primaryItems]
  );

  const activeDockValue: MobileDockValue =
    moreOpen || isSecondaryActive ? "__more__" : activeTab;

  const handleDockChange = (nextValue: MobileDockValue) => {
    if (nextValue === "__more__") {
      setMoreOpen((prev) => !prev);
      return;
    }
    setMoreOpen(false);
    onSelectTab(nextValue);
  };

  return (
    <>
      <AdminMobileMoreSheet
        open={moreOpen}
        items={secondaryItems}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onOpenPublicPortfolio={() => triggerSlideNavigate("/", "left")}
        onClose={() => setMoreOpen(false)}
      />

      <div className="md:hidden fixed bottom-3 inset-x-3 z-50">
        <Tabs
          items={dockTabItems}
          value={activeDockValue}
          onChange={handleDockChange}
          ariaLabel="Mobile CMS Module Navigation"
          size="dock"
          layout="equal"
          variant="accent"
          className="w-full"
        />
      </div>
    </>
  );
}
