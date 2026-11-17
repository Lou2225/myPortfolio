"use client";

import { useEffect, useState } from "react";
import { AdminDashboardSkeleton } from "@/components/ui/Skeleton";
import { readPersistedAdminCache } from "@/lib/queryClient";
import { DEVICE_STORAGE_KEY } from "@/lib/brandPortalStatus";

/**
 * Smart client route-loading fallback for `/admin`.
 * Prevents the repetitive grey skeleton flash on fast/prefetched navigations,
 * BrandPortal curtain slides, and warm revisits — revealing the skeleton only
 * when a genuinely uncached cold load exceeds 450ms.
 */
export function AdminRouteLoadingFallback() {
  const [showColdSkeleton, setShowColdSkeleton] = useState(false);

  useEffect(() => {
    const hasWarmCache =
      Boolean(readPersistedAdminCache()) ||
      localStorage.getItem(DEVICE_STORAGE_KEY) === "true";

    if (hasWarmCache) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowColdSkeleton(true);
    }, 450);

    return () => window.clearTimeout(timer);
  }, []);

  if (showColdSkeleton) {
    return <AdminDashboardSkeleton />;
  }

  return (
    <div
      aria-busy="true"
      aria-label="Opening Portfolio Management Console"
      className="min-h-screen bg-(--bg-canvas)"
    />
  );
}
