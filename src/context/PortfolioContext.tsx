"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { usePathname } from "next/navigation";
import {
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  PUBLIC_CACHE_STORAGE_KEY,
  getQueryClient,
  queryKeys,
  readPersistedPublicCache,
  writePersistedPublicCache,
} from "@/lib/queryClient";
import {
  AnalyticsEvent,
  AppearanceConfig,
  PublicPortfolioData,
} from "@/types/portfolio";
export type { PublicPortfolioData };
import { profileData, defaultSectionHeaders } from "@/data/portfolio";
import { marqueePrinciples } from "@/data/principles";
import { pillarsData } from "@/data/pillars";
import { skillsData } from "@/data/skills";
import { projectsData } from "@/data/projects";
import { impactMetrics } from "@/data/impact";
import { DEFAULT_APPEARANCE } from "@/data/appearance";

interface PortfolioContextValue extends PublicPortfolioData {
  appearance: AppearanceConfig;
  setPreviewAppearance: (next: AppearanceConfig | null) => void;
  trackEvent: (type: AnalyticsEvent["type"], target: string) => void;
  refreshPortfolio: () => Promise<void>;
  isFetchingPortfolio: boolean;
}

const defaultPublicData: PublicPortfolioData = {
  profile: profileData,
  sectionHeaders: defaultSectionHeaders,
  marqueePrinciples,
  pillars: pillarsData,
  skills: skillsData,
  projects: projectsData,
  impactMetrics,
  appearance: DEFAULT_APPEARANCE,
};

const PortfolioContext = createContext<PortfolioContextValue>({
  ...defaultPublicData,
  appearance: DEFAULT_APPEARANCE,
  setPreviewAppearance: () => {},
  trackEvent: () => {},
  refreshPortfolio: async () => {},
  isFetchingPortfolio: false,
});

export function usePortfolio() {
  return useContext(PortfolioContext);
}

function PortfolioStateBridge({
  initialData,
  children,
}: {
  initialData?: PublicPortfolioData;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [previewAppearance, setPreviewAppearance] =
    useState<AppearanceConfig | null>(null);

  const { data = initialData || defaultPublicData, isFetching } = useQuery({
    queryKey: queryKeys.publicPortfolio,
    queryFn: async (): Promise<PublicPortfolioData> => {
      const res = await fetch("/api/portfolio", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to fetch public portfolio data");
      }
      const fresh = (await res.json()) as PublicPortfolioData;
      const existing = queryClient.getQueryData<PublicPortfolioData>(
        queryKeys.publicPortfolio
      );
      if (
        existing &&
        existing.updatedAt &&
        fresh.updatedAt &&
        existing.updatedAt === fresh.updatedAt &&
        JSON.stringify(existing.appearance) === JSON.stringify(fresh.appearance)
      ) {
        return existing;
      }
      writePersistedPublicCache(fresh);
      return fresh;
    },
    initialData: () => initialData || readPersistedPublicCache() || defaultPublicData,
    initialDataUpdatedAt: 0,
    staleTime: 10 * 1000,
    refetchOnWindowFocus: !pathname?.startsWith("/admin"),
  });

  // Live-sync portfolio state across open tabs (e.g. saving in /admin updates open public tab immediately)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== PUBLIC_CACHE_STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as PublicPortfolioData;
        if (parsed && parsed.profile && parsed.appearance) {
          queryClient.setQueryData(queryKeys.publicPortfolio, parsed);
        }
      } catch {
        // Ignore malformed storage snapshot
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [queryClient]);

  const refreshPortfolio = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.publicPortfolio,
    });
  }, [queryClient]);

  interface QueuedTelemetryEvent {
    type: AnalyticsEvent["type"];
    target: string;
    sessionId?: string;
    device?: AnalyticsEvent["device"];
    referrer?: string;
  }

  const telemetryQueueRef = useRef<QueuedTelemetryEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const getOrCreateSessionId = useCallback((): string | undefined => {
    if (typeof window === "undefined") return undefined;
    try {
      const storageKey = "lou-analytics-sid";
      let sid = window.sessionStorage.getItem(storageKey);
      if (!sid) {
        sid =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID().slice(0, 12)
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        window.sessionStorage.setItem(storageKey, sid);
      }
      return sid;
    } catch {
      return undefined;
    }
  }, []);

  const getClientAttribution = useCallback((): Pick<
    QueuedTelemetryEvent,
    "sessionId" | "device" | "referrer"
  > => {
    if (typeof window === "undefined") return {};

    const w = window.innerWidth;
    const device: AnalyticsEvent["device"] =
      w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop";

    let referrer = "direct";
    try {
      if (document.referrer) {
        const refHost = new URL(document.referrer).hostname
          .replace(/^www\./, "")
          .toLowerCase();
        const curHost = window.location.hostname
          .replace(/^www\./, "")
          .toLowerCase();
        referrer = refHost === curHost ? "internal" : refHost || "direct";
      }
    } catch {
      referrer = "direct";
    }

    return {
      sessionId: getOrCreateSessionId(),
      device,
      referrer,
    };
  }, [getOrCreateSessionId]);

  const flushTelemetryQueue = useCallback((preferBeacon = false) => {
    if (flushTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const batch = telemetryQueueRef.current;
    if (batch.length === 0) return;
    telemetryQueueRef.current = [];

    const payload = JSON.stringify({ events: batch });

    try {
      if (
        preferBeacon &&
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        const queued = navigator.sendBeacon(
          "/api/analytics",
          new Blob([payload], { type: "application/json" })
        );
        if (queued) return;
      }

      fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Ignore transient offline errors
    }
  }, []);

  useEffect(() => {
    if (pathname?.startsWith("/admin") || typeof window === "undefined") return;

    const handleVisibilityOrHide = () => {
      if (document.visibilityState === "hidden") {
        flushTelemetryQueue(true);
      }
    };
    const handlePageHide = () => flushTelemetryQueue(true);

    document.addEventListener("visibilitychange", handleVisibilityOrHide);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityOrHide);
      window.removeEventListener("pagehide", handlePageHide);
      flushTelemetryQueue(true);
    };
  }, [pathname, flushTelemetryQueue]);

  const trackEvent = useCallback(
    (type: AnalyticsEvent["type"], target: string) => {
      // Don't record analytics when browsing /admin
      if (pathname?.startsWith("/admin")) return;

      const attr = getClientAttribution();
      telemetryQueueRef.current.push({
        type,
        target,
        ...attr,
      });

      const isUrgentConversion =
        type === "project_click" ||
        type === "cv_download" ||
        type === "contact_click";

      if (isUrgentConversion || telemetryQueueRef.current.length >= 8) {
        flushTelemetryQueue(isUrgentConversion);
        return;
      }

      if (flushTimerRef.current === null && typeof window !== "undefined") {
        flushTimerRef.current = window.setTimeout(() => {
          flushTelemetryQueue(false);
        }, 600);
      }
    },
    [pathname, getClientAttribution, flushTelemetryQueue]
  );

  // Record unique initial page_view per browser tab session after initial load settles (avoids mount reflow)
  useEffect(() => {
    if (pathname !== "/" || typeof window === "undefined") return;

    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const recordInitialPageView = () => {
      if (cancelled) return;
      const sid = getOrCreateSessionId();
      try {
        const sentinelKey = "lou-analytics-pv-sent";
        if (sid && window.sessionStorage.getItem(sentinelKey) === sid) {
          return;
        }
        if (sid) {
          window.sessionStorage.setItem(sentinelKey, sid);
        }
      } catch {
        // Proceed even if sessionStorage is restricted
      }
      trackEvent("page_view", "/");
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(recordInitialPageView, {
        timeout: 2800,
      });
    } else {
      timerId = globalThis.setTimeout(recordInitialPageView, 1500);
    }

    return () => {
      cancelled = true;
      if (timerId !== null) globalThis.clearTimeout(timerId);
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [pathname, getOrCreateSessionId, trackEvent]);

  const activeAppearance: AppearanceConfig =
    previewAppearance || data.appearance || DEFAULT_APPEARANCE;

  const contextValue = useMemo<PortfolioContextValue>(
    () => ({
      ...data,
      appearance: activeAppearance,
      setPreviewAppearance,
      trackEvent,
      refreshPortfolio,
      isFetchingPortfolio: isFetching,
    }),
    [data, activeAppearance, trackEvent, refreshPortfolio, isFetching]
  );

  return (
    <PortfolioContext.Provider value={contextValue}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function PortfolioProvider({
  initialData,
  children,
}: {
  initialData?: PublicPortfolioData;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <PortfolioStateBridge initialData={initialData}>
        {children}
      </PortfolioStateBridge>
    </QueryClientProvider>
  );
}
