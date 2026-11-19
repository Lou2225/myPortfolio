"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortfolioDatabase } from "@/types/portfolio";
import type { SafeSecuritySummary } from "@/types/security";
import { usePortfolio, PublicPortfolioData } from "@/context/PortfolioContext";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import {
  useOfflineStatus,
  isNetworkOffline,
} from "@/components/pwa/OfflineManager";
import { AdminAlertBanner } from "@/components/admin/AdminAlertBanner";
import {
  queryKeys,
  AdminPortfolioPayload,
  readPersistedAdminCache,
  writePersistedAdminCache,
  readPersistedSecurityCache,
  writePersistedSecurityCache,
  writePersistedPublicCache,
  clearPersistedAdminCache,
} from "@/lib/queryClient";
import { AdminDashboardSkeleton } from "@/components/ui/Skeleton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { AdminSlideView } from "@/components/motion/AdminMotion";
import {
  announceBrandPortalStatus,
  DEVICE_STORAGE_KEY,
  DEVICE_SYNC_EVENT,
  setBrandPortalMeta,
} from "@/lib/brandPortalStatus";
import { AdminLogin } from "@/components/admin/AdminLogin";
import {
  AdminTab,
  SettingsSectionId,
  getAdminNavItems,
  getAdminTabDirection,
  parseAdminTab,
  parseSettingsSection,
} from "@/components/admin/layout/types";
import type { AdminPasswordSource } from "@/lib/auth";
import { AdminNavbar } from "@/components/admin/layout/AdminNavbar";
import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { AdminMobileNav } from "@/components/admin/layout/AdminMobileNav";
import { AnalyticsOverview } from "@/components/admin/AnalyticsOverview";
import { ProfileHeroManager } from "@/components/admin/ProfileHeroManager";
import { StoryMarqueeManager } from "@/components/admin/StoryMarqueeManager";
import { SkillsImpactManager } from "@/components/admin/SkillsImpactManager";
import { ProjectsManager } from "@/components/admin/ProjectsManager";
import { InboxManager } from "@/components/admin/InboxManager";
import { SettingsManager } from "@/components/admin/SettingsManager";
import {
  clearStoredClientDeviceKey,
  collectClientDeviceTelemetry,
  signExistingDeviceChallenge,
} from "@/lib/deviceTelemetry";
import { applyAppearanceToDocument } from "@/lib/appearance";
import { ALL_FONT_PAIRING_CLASSES } from "@/lib/fonts";
import { cn } from "@/lib/utils";

export interface AdminAuthStatus {
  authenticated: boolean;
  deviceRegistered: boolean;
  storageMode: "local-json" | "supabase";
  passwordSource?: AdminPasswordSource;
  envConfigured?: boolean;
  overrideUpdatedAt?: string | null;
}

export interface AdminDashboardClientProps {
  initialAuth: AdminAuthStatus;
  initialPortfolio?: AdminPortfolioPayload;
  initialSecuritySummary?: SafeSecuritySummary;
  initialTab: AdminTab;
  initialSettingsSection?: SettingsSectionId;
  stealthUnlockToken?: string | null;
}

/**
 * Interactive Client Shell for `/admin`.
 * Receives SSR-resolved auth, database state, and URL `?tab=` from `src/app/admin/page.tsx`
 * so hard refreshes stay on the active module and render immediately without double skeletons.
 */
export function AdminDashboardClient({
  initialAuth,
  initialPortfolio,
  initialSecuritySummary,
  initialTab,
  initialSettingsSection = "hub",
  stealthUnlockToken,
}: AdminDashboardClientProps) {
  const router = useRouter();
  const { refreshPortfolio } = usePortfolio();
  const { scrollTo } = useSmoothScroll();
  const { isOnline } = useOfflineStatus();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [navDirection, setNavDirection] = useState<"forward" | "back">("forward");
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>(
    initialSettingsSection
  );
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const prevTabRef = useRef<AdminTab>(initialTab);

  // Ensure all Admin Appearance typography pairings remain available for live previewing
  useEffect(() => {
    const tokens = ALL_FONT_PAIRING_CLASSES.flatMap((cls) => cls.split(/\s+/)).filter(Boolean);
    document.documentElement.classList.add(...tokens);
  }, []);

  const resetScrollImmediate = useCallback(() => {
    scrollTo(0, { immediate: true });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
    }
  }, [scrollTo]);

  // Keep prevTabRef synchronized for direction lookups & fallback scroll resets
  useEffect(() => {
    if (prevTabRef.current === activeTab) return;
    prevTabRef.current = activeTab;
    resetScrollImmediate();
  }, [activeTab, resetScrollImmediate]);

  const OFFLINE_GUARD_MESSAGE = "Offline — Reconnect to save changes";

  // Listen to browser Back/Forward navigation so `?tab=` and `?section=` stay synchronized
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const nextTab = parseAdminTab(params.get("tab"));
      const currentTab = prevTabRef.current;
      if (nextTab !== currentTab) {
        setNavDirection(getAdminTabDirection(currentTab, nextTab));
        resetScrollImmediate();
      }
      setActiveTab(nextTab);
      setSettingsSection(parseSettingsSection(params.get("section")));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [resetScrollImmediate]);

  /** Switch module and persist in URL `?tab=<module>` so hard refresh preserves exact location */
  const handleSelectTab = useCallback(
    (nextTab: AdminTab) => {
      const currentTab = prevTabRef.current;
      if (nextTab !== currentTab) {
        setNavDirection(getAdminTabDirection(currentTab, nextTab));
        resetScrollImmediate();
      }
      setActiveTab(nextTab);
      setSettingsSection("hub");
      setMutationError(null);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", nextTab);
        url.searchParams.delete("section");
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}`
        );
      }
    },
    [resetScrollImmediate]
  );

  /** Drill into or return from a Settings sub-page while pushing browser history for smooth Back support */
  const handleSelectSettingsSection = useCallback(
    (nextSection: SettingsSectionId) => {
      const currentTab = prevTabRef.current;
      if (currentTab !== "settings") {
        setNavDirection(getAdminTabDirection(currentTab, "settings"));
      }
      setActiveTab("settings");
      setSettingsSection(nextSection);
      scrollTo(0, { immediate: true });
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        const url = new URL(window.location.href);
        url.searchParams.set("tab", "settings");
        if (nextSection === "hub") {
          url.searchParams.delete("section");
        } else {
          url.searchParams.set("section", nextSection);
        }
        window.history.pushState(
          window.history.state,
          "",
          `${url.pathname}${url.search}`
        );
      }
    },
    [scrollTo]
  );

  // 1. Admin Auth & Device Registration Query (Hydrated cleanly from SSR)
  const authQuery = useQuery({
    queryKey: queryKeys.adminAuth,
    queryFn: async (): Promise<AdminAuthStatus> => {
      const res = await fetch("/api/admin/auth", { cache: "no-store" });
      if (!res.ok) {
        // Never wipe persisted device trust on transient 5xx/network responses;
        // throwing preserves initialData / last known good query cache.
        throw new Error(`Auth status check failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      let isReg = Boolean(data.deviceRegistered || data.authenticated);

      // If cookie was missing/expired, attempt silent WebCrypto ECDSA P-256 recovery before clearing trust
      if (
        !isReg &&
        typeof data.deviceChallenge === "string" &&
        data.deviceChallenge
      ) {
        const assertion = await signExistingDeviceChallenge(
          data.deviceChallenge
        );
        if (assertion) {
          const recRes = await fetch("/api/admin/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "recover-device-trust",
              challenge: data.deviceChallenge,
              keyThumbprint: assertion.keyThumbprint,
              signature: assertion.signature,
            }),
          });
          if (recRes.ok) {
            const recData = await recRes.json().catch(() => ({}));
            if (recData?.deviceRegistered) {
              isReg = true;
            }
          }
        }
      }

      if (isReg) {
        localStorage.setItem(DEVICE_STORAGE_KEY, "true");
      } else {
        localStorage.removeItem(DEVICE_STORAGE_KEY);
      }
      window.dispatchEvent(
        new CustomEvent(DEVICE_SYNC_EVENT, { detail: isReg })
      );

      return {
        authenticated: Boolean(data.authenticated),
        deviceRegistered: isReg,
        storageMode: data.storageMode || "local-json",
        passwordSource: data.passwordSource,
        envConfigured: data.envConfigured,
        overrideUpdatedAt: data.overrideUpdatedAt ?? null,
      };
    },
    initialData: initialAuth,
    staleTime: 30 * 1000,
  });

  const authenticated = Boolean(authQuery.data?.authenticated);
  const deviceRegistered = Boolean(authQuery.data?.deviceRegistered);

  // Sync SSR device registration and initial portfolio payload into localStorage after mount.
  // When SSR reports deviceRegistered=false (e.g. cookie missing), do not wipe localStorage
  // until client-side WebCrypto ECDSA verification in BrandPortal / authQuery has run.
  useEffect(() => {
    if (deviceRegistered) {
      localStorage.setItem(DEVICE_STORAGE_KEY, "true");
      window.dispatchEvent(
        new CustomEvent(DEVICE_SYNC_EVENT, { detail: true })
      );
    }
    if (initialPortfolio) {
      writePersistedAdminCache(initialPortfolio);
    }
    if (initialSecuritySummary) {
      writePersistedSecurityCache(initialSecuritySummary);
    }
  }, [deviceRegistered, initialPortfolio, initialSecuritySummary]);

  // Listen for BrandPortal completing silent WebCrypto ECDSA recovery on /admin
  useEffect(() => {
    const handleDeviceSync = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      const nextReg = Boolean(custom.detail);
      queryClient.setQueryData<AdminAuthStatus>(queryKeys.adminAuth, (prev) =>
        prev && prev.deviceRegistered !== nextReg
          ? { ...prev, deviceRegistered: nextReg }
          : prev
      );
    };
    window.addEventListener(DEVICE_SYNC_EVENT, handleDeviceSync);
    return () => window.removeEventListener(DEVICE_SYNC_EVENT, handleDeviceSync);
  }, [queryClient]);

  // 2. Full Admin Portfolio Database Query (Hydrated cleanly from SSR, fallback to persistent cache)
  const portfolioQuery = useQuery({
    queryKey: queryKeys.adminPortfolio,
    queryFn: async (): Promise<AdminPortfolioPayload> => {
      const res = await fetch("/api/admin/portfolio", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Unauthorized or failed to load admin database");
      }
      const payload = (await res.json()) as AdminPortfolioPayload;
      writePersistedAdminCache(payload);
      return payload;
    },
    initialData: () => initialPortfolio ?? readPersistedAdminCache(),
    enabled: authenticated,
    staleTime: 30 * 1000,
  });

  // 2b. Warm & Hydrate Security Registry Query from SSR / persistent cache so Security & Access opens with zero flicker
  useQuery({
    queryKey: queryKeys.adminSecurity,
    queryFn: async (): Promise<SafeSecuritySummary> => {
      const res = await fetch("/api/admin/devices", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load security registry.");
      }
      const summary = (await res.json()) as SafeSecuritySummary;
      writePersistedSecurityCache(summary);
      return summary;
    },
    initialData: () => initialSecuritySummary ?? readPersistedSecurityCache(),
    enabled: authenticated,
    staleTime: 30 * 1000,
  });

  // Notify BrandPortal slide curtain as soon as /admin is ready to reveal (both initial & cached revisit checks)
  const announceAdminReady = useCallback(() => {
    if (!authQuery.isPending && (!authenticated || portfolioQuery.data)) {
      return requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("lou-admin-ready"));
      });
    }
    return null;
  }, [authQuery.isPending, authenticated, portfolioQuery.data]);

  useEffect(() => {
    let rafId = announceAdminReady();
    const handleCheck = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = announceAdminReady();
    };
    window.addEventListener("lou-check-admin-ready", handleCheck);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("lou-check-admin-ready", handleCheck);
    };
  }, [announceAdminReady]);

  const reloadAdminData = useCallback(async () => {
    // Prefetch portfolio & security payloads before flipping auth status so login transition has zero skeleton flash
    try {
      const [portfolioRes, securityRes] = await Promise.all([
        fetch("/api/admin/portfolio", { cache: "no-store" }),
        fetch("/api/admin/devices", { cache: "no-store" }),
      ]);
      if (portfolioRes.ok) {
        const payload = (await portfolioRes.json()) as AdminPortfolioPayload;
        queryClient.setQueryData(queryKeys.adminPortfolio, payload);
        writePersistedAdminCache(payload);
      }
      if (securityRes.ok) {
        const secSummary = (await securityRes.json()) as SafeSecuritySummary;
        queryClient.setQueryData(queryKeys.adminSecurity, secSummary);
        writePersistedSecurityCache(secSummary);
      }
    } catch {
      // Fall through to standard invalidation
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminAuth });
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminPortfolio });
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminSecurity });
  }, [queryClient]);

  // 3. Optimistic Save Mutation for Profile, Story, Skills, Impact & Projects (Online-Only)
  const savePartialMutation = useMutation({
    mutationFn: async (
      updates: Partial<PortfolioDatabase>
    ): Promise<AdminPortfolioPayload> => {
      if (isNetworkOffline(isOnline)) {
        throw new Error(OFFLINE_GUARD_MESSAGE);
      }
      const res = await fetch("/api/admin/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to save portfolio changes");
      }
      return {
        data: json.data,
        storageMode:
          portfolioQuery.data?.storageMode ||
          authQuery.data?.storageMode ||
          "local-json",
      };
    },
    onMutate: async (updates) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.adminPortfolio });
      const previous = queryClient.getQueryData<AdminPortfolioPayload>(
        queryKeys.adminPortfolio
      );

      if (previous && isOnline) {
        const nextDb: PortfolioDatabase = {
          ...previous.data,
          ...updates,
          profile: updates.profile
            ? { ...previous.data.profile, ...updates.profile }
            : previous.data.profile,
          sectionHeaders: updates.sectionHeaders
            ? { ...previous.data.sectionHeaders, ...updates.sectionHeaders }
            : previous.data.sectionHeaders,
          updatedAt: new Date().toISOString(),
        };
        const optimistic: AdminPortfolioPayload = {
          ...previous,
          data: nextDb,
        };
        queryClient.setQueryData(queryKeys.adminPortfolio, optimistic);
        writePersistedAdminCache(optimistic);

        const publicOptimistic: PublicPortfolioData = {
          profile: nextDb.profile,
          sectionHeaders: nextDb.sectionHeaders,
          marqueePrinciples: nextDb.marqueePrinciples,
          pillars: nextDb.pillars,
          skills: nextDb.skills,
          projects: nextDb.projects,
          impactMetrics: nextDb.impactMetrics,
          appearance: nextDb.appearance,
          updatedAt: nextDb.updatedAt,
        };
        queryClient.setQueryData(queryKeys.publicPortfolio, publicOptimistic);
        writePersistedPublicCache(publicOptimistic);
      }

      return { previous };
    },
    onError: (err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.adminPortfolio, context.previous);
        writePersistedAdminCache(context.previous);
        const prevDb = context.previous.data;
        const publicRollback: PublicPortfolioData = {
          profile: prevDb.profile,
          sectionHeaders: prevDb.sectionHeaders,
          marqueePrinciples: prevDb.marqueePrinciples,
          pillars: prevDb.pillars,
          skills: prevDb.skills,
          projects: prevDb.projects,
          impactMetrics: prevDb.impactMetrics,
          appearance: prevDb.appearance,
          updatedAt: prevDb.updatedAt,
        };
        queryClient.setQueryData(queryKeys.publicPortfolio, publicRollback);
        writePersistedPublicCache(publicRollback);
      }
      const message =
        err instanceof Error ? err.message : "Failed to save portfolio changes";
      setMutationError(message);
      announceBrandPortalStatus({
        tone: "error",
        label: "Save Failed",
        detail: message,
      });
    },
    onSuccess: async (payload) => {
      setMutationError(null);
      queryClient.setQueryData(queryKeys.adminPortfolio, payload);
      writePersistedAdminCache(payload);
      const nextDb = payload.data;
      const publicFresh: PublicPortfolioData = {
        profile: nextDb.profile,
        sectionHeaders: nextDb.sectionHeaders,
        marqueePrinciples: nextDb.marqueePrinciples,
        pillars: nextDb.pillars,
        skills: nextDb.skills,
        projects: nextDb.projects,
        impactMetrics: nextDb.impactMetrics,
        appearance: nextDb.appearance,
        updatedAt: nextDb.updatedAt,
      };
      queryClient.setQueryData(queryKeys.publicPortfolio, publicFresh);
      writePersistedPublicCache(publicFresh);
      await refreshPortfolio();
      router.refresh();
    },
  });

  // 4. Optimistic Clear Analytics Mutation (Online-Only)
  const clearAnalyticsMutation = useMutation({
    mutationFn: async () => {
      if (isNetworkOffline(isOnline)) {
        throw new Error(OFFLINE_GUARD_MESSAGE);
      }
      const res = await fetch("/api/admin/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-analytics" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to clear analytics");
      return json;
    },
    onMutate: async () => {
      setMutationError(null);
      const previous = queryClient.getQueryData<AdminPortfolioPayload>(
        queryKeys.adminPortfolio
      );
      if (previous && isOnline) {
        const optimistic: AdminPortfolioPayload = {
          ...previous,
          data: { ...previous.data, analytics: [] },
        };
        queryClient.setQueryData(queryKeys.adminPortfolio, optimistic);
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.adminPortfolio, context.previous);
      }
      setMutationError(
        err instanceof Error ? err.message : "Failed to clear analytics"
      );
    },
    onSuccess: (json) => {
      setMutationError(null);
      if (json?.data && portfolioQuery.data) {
        const updated: AdminPortfolioPayload = {
          ...portfolioQuery.data,
          data: json.data,
        };
        queryClient.setQueryData(queryKeys.adminPortfolio, updated);
        writePersistedAdminCache(updated);
      }
      announceBrandPortalStatus({
        tone: "live",
        label: "Telemetry Cleared",
        detail: "Analytics logs reset",
      });
    },
  });

  // 5. Reset to Seed Defaults Mutation (Online-Only)
  const resetSeedMutation = useMutation({
    mutationFn: async () => {
      if (isNetworkOffline(isOnline)) {
        throw new Error(OFFLINE_GUARD_MESSAGE);
      }
      const res = await fetch("/api/admin/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-seed" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to reset seed");
      return json;
    },
    onError: (err) => {
      setMutationError(
        err instanceof Error ? err.message : "Failed to reset seed defaults"
      );
    },
    onSuccess: async (json) => {
      setMutationError(null);
      if (json?.data) {
        const nextDb = json.data as PortfolioDatabase;
        const updated: AdminPortfolioPayload = {
          data: nextDb,
          storageMode:
            portfolioQuery.data?.storageMode ||
            authQuery.data?.storageMode ||
            "local-json",
        };
        queryClient.setQueryData(queryKeys.adminPortfolio, updated);
        writePersistedAdminCache(updated);
        const publicFresh: PublicPortfolioData = {
          profile: nextDb.profile,
          sectionHeaders: nextDb.sectionHeaders,
          marqueePrinciples: nextDb.marqueePrinciples,
          pillars: nextDb.pillars,
          skills: nextDb.skills,
          projects: nextDb.projects,
          impactMetrics: nextDb.impactMetrics,
          appearance: nextDb.appearance,
          updatedAt: nextDb.updatedAt,
        };
        queryClient.setQueryData(queryKeys.publicPortfolio, publicFresh);
        writePersistedPublicCache(publicFresh);
        if (nextDb.appearance) {
          applyAppearanceToDocument(nextDb.appearance);
        }
        await refreshPortfolio();
        await queryClient.invalidateQueries({ queryKey: ["admin-system-overview"] });
        router.refresh();
        announceBrandPortalStatus({
          tone: "live",
          label: "Defaults Restored",
          detail: "Seed defaults published live",
        });
      }
    },
  });

  // 6. Device Registration Toggle Mutation (Online-Only)
  const toggleDeviceMutation = useMutation({
    mutationFn: async (nextState: boolean) => {
      if (isNetworkOffline(isOnline)) {
        throw new Error(OFFLINE_GUARD_MESSAGE);
      }
      const telemetry = nextState
        ? await collectClientDeviceTelemetry()
        : undefined;
      const res = await fetch("/api/admin/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registered: nextState,
          ...(telemetry ? { telemetry } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to toggle device registration");
      }
      if (!nextState) {
        await clearStoredClientDeviceKey();
      }
      return nextState;
    },
    onMutate: async (nextState) => {
      setMutationError(null);
      const previous = queryClient.getQueryData<AdminAuthStatus>(
        queryKeys.adminAuth
      );
      if (!isOnline) {
        return { previous };
      }
      if (previous) {
        queryClient.setQueryData<AdminAuthStatus>(queryKeys.adminAuth, {
          ...previous,
          deviceRegistered: nextState,
        });
      }
      if (nextState) {
        localStorage.setItem(DEVICE_STORAGE_KEY, "true");
      } else {
        localStorage.removeItem(DEVICE_STORAGE_KEY);
      }
      window.dispatchEvent(
        new CustomEvent(DEVICE_SYNC_EVENT, { detail: nextState })
      );
      return { previous };
    },
    onError: (err, _nextState, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.adminAuth, context.previous);
        if (context.previous.deviceRegistered) {
          localStorage.setItem(DEVICE_STORAGE_KEY, "true");
        } else {
          localStorage.removeItem(DEVICE_STORAGE_KEY);
        }
      }
      setMutationError(
        err instanceof Error
          ? err.message
          : "Failed to toggle device registration"
      );
    },
    onSuccess: (nextState) => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-security-registry"],
      });
      announceBrandPortalStatus({
        tone: nextState ? "live" : "synced",
        label: nextState ? "Portal Registered" : "Portal Unregistered",
        detail: nextState
          ? "Orb click opens /admin CMS"
          : "Orb click scrolls to top",
      });
    },
  });

  const requireOnlineOrThrow = () => {
    if (isNetworkOffline(isOnline)) {
      setMutationError(OFFLINE_GUARD_MESSAGE);
      throw new Error(OFFLINE_GUARD_MESSAGE);
    }
  };

  const handleSavePartial = async (updates: Partial<PortfolioDatabase>) => {
    requireOnlineOrThrow();
    await savePartialMutation.mutateAsync(updates);
  };

  const handleSyncDatabaseState = async (nextDb: PortfolioDatabase) => {
    const mode =
      portfolioQuery.data?.storageMode ||
      authQuery.data?.storageMode ||
      "local-json";
    const updatedPayload: AdminPortfolioPayload = {
      data: nextDb,
      storageMode: mode,
    };
    queryClient.setQueryData(queryKeys.adminPortfolio, updatedPayload);
    writePersistedAdminCache(updatedPayload);

    const publicFresh: PublicPortfolioData = {
      profile: nextDb.profile,
      sectionHeaders: nextDb.sectionHeaders,
      marqueePrinciples: nextDb.marqueePrinciples,
      pillars: nextDb.pillars,
      skills: nextDb.skills,
      projects: nextDb.projects,
      impactMetrics: nextDb.impactMetrics,
      appearance: nextDb.appearance,
      updatedAt: nextDb.updatedAt,
    };
    queryClient.setQueryData(queryKeys.publicPortfolio, publicFresh);
    writePersistedPublicCache(publicFresh);
    if (nextDb.appearance) {
      applyAppearanceToDocument(nextDb.appearance);
    }
    await refreshPortfolio();
    router.refresh();
  };

  const handleClearAnalytics = async () => {
    requireOnlineOrThrow();
    await clearAnalyticsMutation.mutateAsync();
  };

  const handleResetToSeed = async () => {
    if (isNetworkOffline(isOnline)) {
      setMutationError(OFFLINE_GUARD_MESSAGE);
      return;
    }
    setConfirmResetOpen(true);
  };

  const confirmResetToSeed = async () => {
    if (isNetworkOffline(isOnline)) {
      setMutationError(OFFLINE_GUARD_MESSAGE);
      setConfirmResetOpen(false);
      return;
    }
    try {
      await resetSeedMutation.mutateAsync();
    } finally {
      setConfirmResetOpen(false);
    }
  };

  const handleLogout = async (unregisterDevice = false) => {
    if (unregisterDevice) {
      await clearStoredClientDeviceKey();
      localStorage.removeItem(DEVICE_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(DEVICE_SYNC_EVENT, { detail: false }));
    }
    await fetch(
      unregisterDevice
        ? "/api/admin/auth?unregisterDevice=true"
        : "/api/admin/auth",
      { method: "DELETE" }
    );
    clearPersistedAdminCache();
    queryClient.setQueryData<AdminAuthStatus>(queryKeys.adminAuth, (prev) => ({
      authenticated: false,
      deviceRegistered: unregisterDevice ? false : (prev?.deviceRegistered ?? true),
      storageMode: prev?.storageMode ?? "local-json",
      passwordSource: undefined,
      envConfigured: undefined,
      overrideUpdatedAt: null,
    }));
    queryClient.removeQueries({ queryKey: queryKeys.adminPortfolio });
    queryClient.removeQueries({ queryKey: queryKeys.adminSecurity });
    router.refresh();
  };

  const handlePasswordMetaChange = (meta: {
    passwordSource: AdminPasswordSource;
    envConfigured: boolean;
    overrideUpdatedAt: string | null;
  }) => {
    queryClient.setQueryData<AdminAuthStatus>(queryKeys.adminAuth, (prev) =>
      prev
        ? {
            ...prev,
            passwordSource: meta.passwordSource,
            envConfigured: meta.envConfigured,
            overrideUpdatedAt: meta.overrideUpdatedAt,
          }
        : prev
    );
  };

  const db = portfolioQuery.data?.data;
  const projectsCount = db?.projects.length ?? 0;
  const unreadMessages = db?.messages.filter((m) => !m.isRead).length ?? 0;
  const navItems = useMemo(
    () =>
      getAdminNavItems({
        projectsCount,
        unreadMessagesCount: unreadMessages,
      }),
    [projectsCount, unreadMessages]
  );

  const storageMode =
    portfolioQuery.data?.storageMode ||
    authQuery.data?.storageMode ||
    "local-json";

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setBrandPortalMeta({
        lastPublishedAt: db?.updatedAt ?? null,
        storageMode,
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [db?.updatedAt, storageMode]);

  // Fallback skeleton ONLY if authenticated without preloaded DB payload (never on initial hydrated load)
  if (authQuery.isPending || (authenticated && !portfolioQuery.data)) {
    return <AdminDashboardSkeleton />;
  }

  if (!authenticated || !db) {
    return (
      <AdminLogin
        onSuccess={reloadAdminData}
        stealthUnlockToken={stealthUnlockToken}
      />
    );
  }

  const activeItem =
    navItems.find((item) => item.id === activeTab) || navItems[0];

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-(--bg-canvas) text-(--text-primary) pt-16 pb-32 md:pb-16 transition-colors duration-300">
      {/* Top Admin Navbar (Search, Live Clock, Theme Toggle, Notifications & Profile Dropdown) */}
      <AdminNavbar
        db={db}
        activeTab={activeTab}
        storageMode={storageMode}
        onLogout={handleLogout}
        onNavigateTab={handleSelectTab}
        onNavigateSettingsSection={handleSelectSettingsSection}
      />

      {/* Sculpted Left Vertical Sidebar with Top/Bottom Concave Curves & Expand/Collapse */}
      <AdminSidebar
        items={navItems}
        activeTab={activeTab}
        expanded={sidebarExpanded}
        onSelectTab={handleSelectTab}
        onToggleExpand={() => setSidebarExpanded((prev) => !prev)}
      />

      {/* Mobile Bottom Navigation Dock (`< md` screens) */}
      <AdminMobileNav
        items={navItems}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
      />

      {/* Main Responsive Content Workspace */}
      <main
        className={cn(
          "max-w-370 mx-auto px-3 sm:px-6 lg:px-10 pt-4 sm:pt-7 space-y-5 sm:space-y-6 transition-[padding] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          sidebarExpanded
            ? "md:pl-62 lg:pl-64"
            : "md:pl-22 lg:pl-24"
        )}
      >
        {/* Online-Only Offline Safety Guard & Server Write-Error Alert */}
        {!isOnline && (
          <AdminAlertBanner
            variant="offline"
            message={`${OFFLINE_GUARD_MESSAGE}.`}
            detail="Read-only preview remains available, while database mutations stay paused until you reconnect."
          />
        )}

        {isOnline && mutationError && (
          <AdminAlertBanner
            variant="error"
            message={mutationError}
            onDismiss={() => setMutationError(null)}
          />
        )}

        {/* Active Module Header + Partial with Reusable Smooth Directional Slide Transition */}
        <div className="overflow-x-clip">
          <AdminSlideView
            activeKey={activeTab}
            direction={navDirection}
            distancePx={64}
            duration={0.42}
            skipInitial
            className="space-y-4 sm:space-y-6"
          >
            <SectionHeader
              eyebrow={`CMS MODULE // 0${navItems.findIndex((i) => i.id === activeTab) + 1}`}
              title={activeItem.label}
              description={activeItem.description}
              size="md"
            />

          {activeTab === "overview" && (
            <AnalyticsOverview
              db={db}
              storageMode={storageMode}
              onClearAnalytics={handleClearAnalytics}
              onNavigateTab={(tab) => handleSelectTab(tab)}
              onNavigateSettingsSection={handleSelectSettingsSection}
            />
          )}

          {activeTab === "profile" && (
            <ProfileHeroManager
              profile={db.profile}
              onSave={async (updatedProfile) => {
                await handleSavePartial({ profile: updatedProfile });
              }}
            />
          )}

          {activeTab === "story" && (
            <StoryMarqueeManager
              profile={db.profile}
              sectionHeaders={db.sectionHeaders}
              pillars={db.pillars}
              marqueePrinciples={db.marqueePrinciples}
              onSave={async (payload) => {
                await handleSavePartial(payload);
              }}
            />
          )}

          {activeTab === "skills" && (
            <SkillsImpactManager
              skills={db.skills}
              impactMetrics={db.impactMetrics}
              sectionHeaders={db.sectionHeaders}
              onSave={async (payload) => {
                await handleSavePartial(payload);
              }}
            />
          )}

          {activeTab === "projects" && (
            <ProjectsManager
              projects={db.projects}
              onSave={async (updatedProjects) => {
                await handleSavePartial({ projects: updatedProjects });
              }}
            />
          )}

          {activeTab === "inbox" && (
            <InboxManager messages={db.messages} onRefresh={reloadAdminData} />
          )}

          {activeTab === "settings" && (
            <SettingsManager
              db={db}
              storageMode={storageMode}
              deviceRegistered={deviceRegistered}
              togglingDevice={toggleDeviceMutation.isPending}
              resettingSeed={resetSeedMutation.isPending}
              passwordSource={authQuery.data?.passwordSource ?? "env"}
              envConfigured={Boolean(authQuery.data?.envConfigured ?? true)}
              overrideUpdatedAt={authQuery.data?.overrideUpdatedAt ?? null}
              activeSection={settingsSection}
              onSelectSection={handleSelectSettingsSection}
              onPasswordMetaChange={handlePasswordMetaChange}
              onToggleDevice={() =>
                toggleDeviceMutation.mutate(!deviceRegistered)
              }
              onResetSeed={handleResetToSeed}
              onDatabaseSync={handleSyncDatabaseState}
              onLogout={handleLogout}
              onSyncAuth={reloadAdminData}
            />
          )}
          </AdminSlideView>
        </div>
      </main>

      <ConfirmModal
        open={confirmResetOpen}
        title="Factory Reset Portfolio Seed Defaults?"
        description="Reset all portfolio profile copy, projects, skills, and narrative sections back to src/data/*? An automatic safety checkpoint is saved to your Snapshot Vault first, and inbox messages & security settings remain preserved."
        confirmLabel="Factory Reset"
        cancelLabel="Cancel"
        variant="danger"
        requireTypedPhrase="RESET PORTFOLIO"
        loading={resetSeedMutation.isPending}
        onConfirm={confirmResetToSeed}
        onCancel={() => {
          if (!resetSeedMutation.isPending) {
            setConfirmResetOpen(false);
          }
        }}
      />

      {/* Reusable Scroll-To-Top Floating Button with Live Progress Ring */}
      <ScrollToTop showOnAdmin threshold={220} />
    </div>
  );
}

