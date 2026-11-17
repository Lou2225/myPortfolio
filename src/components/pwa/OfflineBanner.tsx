"use client";

import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useOfflineStatus } from "@/components/pwa/OfflineManager";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Interactive PWA update prompt surface rendered cleanly above ScrollToTop
 * when a new Service Worker version is ready to activate.
 * Install App lives in Footer.tsx; passive offline & sync statuses animate in BrandPortalOrb.
 */
export function OfflineBanner() {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");

  const { updateReady, applyUpdate } = useOfflineStatus();

  if (!updateReady) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed z-90 flex flex-col items-end gap-2 max-w-[calc(100vw-2rem)] pointer-events-none",
        isAdminRoute
          ? "bottom-36 right-4 md:bottom-24 md:right-8"
          : "bottom-22 right-5 sm:bottom-24 sm:right-8"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-brand/40 bg-(--bg-surface)/95 backdrop-blur-md pl-4 pr-2 py-1.5 text-xs text-(--text-primary) shadow-(--shadow-card)">
        <span className="font-mono">New portfolio update ready</span>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={applyUpdate}
          className="h-7.5 px-3 text-[11px]"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          <span>Reload</span>
        </Button>
      </div>
    </div>
  );
}
