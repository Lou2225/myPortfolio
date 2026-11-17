"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { clearPersistedPublicCache } from "@/lib/queryClient";
import type { PublicPortfolioData } from "@/context/PortfolioContext";

export interface OfflineContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
  honeypot?: string;
  queuedAt: string;
}

export type ServiceWorkerState =
  | "unsupported"
  | "dev-disabled"
  | "registering"
  | "active"
  | "updating"
  | "error";

export type InstallPosture =
  | "standalone"
  | "prompt-ready"
  | "ios-safari"
  | "unavailable";

export interface PwaCacheBucketInfo {
  name: string;
  urls: string[];
}

export interface PwaCacheDiagnostics {
  quotaBytes: number | null;
  usageBytes: number | null;
  totalEntries: number;
  buckets: PwaCacheBucketInfo[];
  checkedAt: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface OfflineContextValue {
  isOnline: boolean;
  swState: ServiceWorkerState;
  updateReady: boolean;
  canInstall: boolean;
  isStandalone: boolean;
  installPosture: InstallPosture;
  pendingOutboxCount: number;
  outboxItems: OfflineContactPayload[];
  lastSyncedOutboxCount: number;
  applyUpdate: () => void;
  checkForUpdates: () => Promise<
    "update-found" | "up-to-date" | "unsupported" | "dev-disabled" | "error"
  >;
  promptInstall: () => Promise<boolean>;
  prewarmPortfolioAssets: () => Promise<{ cached: number; total: number }>;
  getCacheDiagnostics: () => Promise<PwaCacheDiagnostics>;
  clearOfflineCache: (options?: {
    clearClientQueryCache?: boolean;
  }) => Promise<void>;
  queueContactInquiry: (
    payload: Omit<OfflineContactPayload, "queuedAt">
  ) => number;
  removeOutboxItem: (queuedAt: string) => void;
  flushContactOutbox: () => Promise<{ sent: number; remaining: number }>;
  dismissSyncNotice: () => void;
}

const OFFLINE_OUTBOX_KEY = "lou_offline_contact_outbox";
const OUTBOX_EVENT = "lou:outbox-change";
const EMPTY_OUTBOX: OfflineContactPayload[] = [];

const isSwDisabledInDev =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_ENABLE_SW !== "true";

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  swState: "registering",
  updateReady: false,
  canInstall: false,
  isStandalone: false,
  installPosture: "unavailable",
  pendingOutboxCount: 0,
  outboxItems: EMPTY_OUTBOX,
  lastSyncedOutboxCount: 0,
  applyUpdate: () => {},
  checkForUpdates: async () => "unsupported",
  promptInstall: async () => false,
  prewarmPortfolioAssets: async () => ({ cached: 0, total: 0 }),
  getCacheDiagnostics: async () => ({
    quotaBytes: null,
    usageBytes: null,
    totalEntries: 0,
    buckets: [],
    checkedAt: "",
  }),
  clearOfflineCache: async () => {},
  queueContactInquiry: () => 0,
  removeOutboxItem: () => {},
  flushContactOutbox: async () => ({ sent: 0, remaining: 0 }),
  dismissSyncNotice: () => {},
});

// Referentially stable cached snapshot for React 19 `useSyncExternalStore`
let cachedRawOutbox: string | null = null;
let cachedParsedOutbox: OfflineContactPayload[] = EMPTY_OUTBOX;

function readOutbox(): OfflineContactPayload[] {
  if (typeof window === "undefined") return EMPTY_OUTBOX;
  try {
    const raw = window.localStorage.getItem(OFFLINE_OUTBOX_KEY);
    if (!raw) {
      cachedRawOutbox = null;
      cachedParsedOutbox = EMPTY_OUTBOX;
      return EMPTY_OUTBOX;
    }
    if (raw === cachedRawOutbox) {
      return cachedParsedOutbox;
    }
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed)
      ? (parsed as OfflineContactPayload[])
      : EMPTY_OUTBOX;
    cachedRawOutbox = raw;
    cachedParsedOutbox = normalized;
    return cachedParsedOutbox;
  } catch {
    return EMPTY_OUTBOX;
  }
}

function writeOutbox(items: OfflineContactPayload[]): void {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(OFFLINE_OUTBOX_KEY);
      cachedRawOutbox = null;
      cachedParsedOutbox = EMPTY_OUTBOX;
    } else {
      const raw = JSON.stringify(items);
      window.localStorage.setItem(OFFLINE_OUTBOX_KEY, raw);
      cachedRawOutbox = raw;
      cachedParsedOutbox = items;
    }
    window.dispatchEvent(new Event(OUTBOX_EVENT));
  } catch {
    // Ignore storage quota errors
  }
}

function subscribeOnlineStatus(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getClientOnlineSnapshot() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function getServerOnlineSnapshot() {
  return true;
}

function subscribeOutbox(callback: () => void) {
  const handleStorage = (e: StorageEvent) => {
    if (!e.key || e.key === OFFLINE_OUTBOX_KEY) callback();
  };
  window.addEventListener(OUTBOX_EVENT, callback);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(OUTBOX_EVENT, callback);
    window.removeEventListener("storage", handleStorage);
  };
}

function getClientOutboxItems(): OfflineContactPayload[] {
  return readOutbox();
}

function getServerOutboxItems(): OfflineContactPayload[] {
  return EMPTY_OUTBOX;
}

function subscribeDisplayMode(callback: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getClientStandaloneSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMq = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean })
    .standalone;
  return Boolean(standaloneMq || iosStandalone);
}

function getServerStandaloneSnapshot(): boolean {
  return false;
}

function isLikelyIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
  return isIos && isSafari;
}

/**
 * Provides app-wide online/offline tracking, native Next.js Service Worker
 * lifecycle management, install prompt state, cache diagnostics, and contact outbox sync.
 */
export function OfflineManager({ children }: { children: React.ReactNode }) {
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getClientOnlineSnapshot,
    getServerOnlineSnapshot
  );
  const outboxItems = useSyncExternalStore(
    subscribeOutbox,
    getClientOutboxItems,
    getServerOutboxItems
  );
  const isStandalone = useSyncExternalStore(
    subscribeDisplayMode,
    getClientStandaloneSnapshot,
    getServerStandaloneSnapshot
  );
  const pendingOutboxCount = outboxItems.length;

  const [swState, setSwState] = useState<ServiceWorkerState>(() =>
    isSwDisabledInDev ? "dev-disabled" : "registering"
  );
  const [updateReady, setUpdateReady] = useState(false);
  const [lastSyncedOutboxCount, setLastSyncedOutboxCount] = useState(0);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const flushingRef = useRef(false);

  const flushContactOutbox = useCallback(async () => {
    if (flushingRef.current) {
      const current = readOutbox();
      return { sent: 0, remaining: current.length };
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const current = readOutbox();
      return { sent: 0, remaining: current.length };
    }

    const queue = readOutbox();
    if (queue.length === 0) {
      return { sent: 0, remaining: 0 };
    }

    flushingRef.current = true;
    const remaining: OfflineContactPayload[] = [];
    let sent = 0;

    try {
      for (const item of queue) {
        try {
          const res = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.name,
              email: item.email,
              subject: item.subject,
              message: item.message,
              honeypot: item.honeypot ?? "",
            }),
          });
          if (res.ok) {
            sent += 1;
          } else if (res.status >= 400 && res.status < 500) {
            // Drop invalid 4xx items so malformed payloads do not retry forever
          } else {
            remaining.push(item);
          }
        } catch {
          remaining.push(item);
        }
      }

      writeOutbox(remaining);
      if (sent > 0) {
        setLastSyncedOutboxCount(sent);
      }
      return { sent, remaining: remaining.length };
    } finally {
      flushingRef.current = false;
    }
  }, []);

  const queueContactInquiry = useCallback(
    (payload: Omit<OfflineContactPayload, "queuedAt">) => {
      const current = readOutbox();
      const next = [
        ...current,
        {
          ...payload,
          queuedAt: new Date().toISOString(),
        },
      ].slice(-10);
      writeOutbox(next);

      // Register Chromium Background Sync when available
      const reg = registrationRef.current as
        | (ServiceWorkerRegistration & {
            sync?: { register: (tag: string) => Promise<void> };
          })
        | null;
      if (reg?.sync?.register) {
        reg.sync.register("lou-contact-outbox-sync").catch(() => {});
      }

      return next.length;
    },
    []
  );

  const removeOutboxItem = useCallback((queuedAt: string) => {
    const current = readOutbox();
    const next = current.filter((item) => item.queuedAt !== queuedAt);
    writeOutbox(next);
  }, []);

  const dismissSyncNotice = useCallback(() => {
    setLastSyncedOutboxCount(0);
  }, []);

  // Automatically flush queued offline inquiries whenever browser returns online
  useEffect(() => {
    if (isOnline && pendingOutboxCount > 0) {
      void flushContactOutbox();
    }
  }, [isOnline, pendingOutboxCount, flushContactOutbox]);

  // Capture Android/Desktop install prompt when available
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Register native Next.js Service Worker (production or explicit opt-in)
  useEffect(() => {
    if (isSwDisabledInDev) return;

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    // Track whether a Service Worker already controlled this page before registration.
    // On first-ever activation, clients.claim() triggers controllerchange without requiring a reload.
    let hadController = Boolean(navigator.serviceWorker.controller);

    const registerSw = async () => {
      await Promise.resolve();
      if (cancelled) return;

      try {
        setSwState("registering");
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (cancelled) return;
        registrationRef.current = reg;

        if (reg.waiting) {
          waitingWorkerRef.current = reg.waiting;
          setUpdateReady(true);
          setSwState("updating");
        } else if (reg.active) {
          setSwState("active");
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              waitingWorkerRef.current = newWorker;
              setUpdateReady(true);
              setSwState("updating");
            } else if (newWorker.state === "activated") {
              setSwState("active");
            }
          });
        });
      } catch {
        if (!cancelled) {
          setSwState("error");
        }
      }
    };

    const scheduleRegistration = () => {
      if (cancelled) return;
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(() => void registerSw(), {
          timeout: 2500,
        });
      } else {
        timerId = setTimeout(() => void registerSw(), 450);
      }
    };

    const handleWindowLoad = () => scheduleRegistration();

    if (document.readyState === "complete") {
      scheduleRegistration();
    } else {
      window.addEventListener("load", handleWindowLoad, { once: true });
    }

    let refreshing = false;
    const handleControllerChange = () => {
      if (!hadController) {
        hadController = true;
        setSwState("active");
        return;
      }
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "FLUSH_OUTBOX") {
        void flushContactOutbox();
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );
    navigator.serviceWorker.addEventListener("message", handleSwMessage);

    return () => {
      cancelled = true;
      window.removeEventListener("load", handleWindowLoad);
      if (timerId !== null) clearTimeout(timerId);
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, [flushContactOutbox]);

  const applyUpdate = useCallback(() => {
    const waiting = waitingWorkerRef.current;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (isSwDisabledInDev) return "dev-disabled";
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return "unsupported";
    }
    try {
      const reg =
        registrationRef.current ||
        (await navigator.serviceWorker.getRegistration("/")) ||
        null;
      if (!reg) return "unsupported";
      registrationRef.current = reg;
      await reg.update();
      if (reg.waiting || reg.installing) {
        return "update-found";
      }
      return "up-to-date";
    } catch {
      return "error";
    }
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installEvent) return false;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setInstallEvent(null);
      return true;
    }
    return false;
  }, [installEvent]);

  const prewarmPortfolioAssets = useCallback(async () => {
    if (typeof window === "undefined") return { cached: 0, total: 0 };

    const urls = new Set<string>([
      "/",
      "/offline",
      "/api/portfolio",
      "/manifest.webmanifest",
    ]);

    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as Partial<PublicPortfolioData>;
        if (data.profile?.avatarUrl) urls.add(data.profile.avatarUrl);
        if (data.profile?.monogramImageUrl) {
          urls.add(data.profile.monogramImageUrl);
        }
        if (data.profile?.resumeUrl) urls.add(data.profile.resumeUrl);
        if (Array.isArray(data.projects)) {
          for (const p of data.projects) {
            if (p.image) urls.add(p.image);
          }
        }
      }
    } catch {
      // Fallback to base URL list
    }

    const urlList = Array.from(urls);

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      const controller = navigator.serviceWorker.controller;
      return await new Promise<{ cached: number; total: number }>((resolve) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
          resolve({ cached: 0, total: urlList.length });
        }, 6500);

        channel.port1.onmessage = (ev) => {
          clearTimeout(timeout);
          const payload = ev.data as { cached?: number; total?: number };
          resolve({
            cached: typeof payload?.cached === "number" ? payload.cached : 0,
            total:
              typeof payload?.total === "number"
                ? payload.total
                : urlList.length,
          });
        };

        controller.postMessage(
          { type: "PREWARM_URLS", urls: urlList },
          [channel.port2]
        );
      });
    }

    // Fallback when active SW controller isn't mounted yet (e.g. dev mode)
    if (!("caches" in window)) {
      return { cached: 0, total: urlList.length };
    }

    let cached = 0;
    const shellCache = await window.caches.open("lou-portfolio-shell-v3");
    const mediaCache = await window.caches.open("lou-portfolio-media-v3");

    await Promise.allSettled(
      urlList.map(async (rawUrl) => {
        try {
          const parsed = new URL(rawUrl, window.location.origin);
          const res = await fetch(parsed.toString());
          if (!res.ok && res.type !== "opaque") return;
          const isShell =
            parsed.origin === window.location.origin &&
            (parsed.pathname === "/" ||
              parsed.pathname === "/offline" ||
              parsed.pathname === "/api/portfolio");
          await (isShell ? shellCache : mediaCache).put(
            parsed.toString(),
            res.clone()
          );
          cached += 1;
        } catch {
          // Skip failed URL
        }
      })
    );

    return { cached, total: urlList.length };
  }, []);

  const getCacheDiagnostics = useCallback(async (): Promise<PwaCacheDiagnostics> => {
    let quotaBytes: number | null = null;
    let usageBytes: number | null = null;

    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        quotaBytes = typeof est.quota === "number" ? est.quota : null;
        usageBytes = typeof est.usage === "number" ? est.usage : null;
      } catch {
        // Ignore blocked estimate API
      }
    }

    const buckets: PwaCacheBucketInfo[] = [];
    let totalEntries = 0;

    if (typeof window !== "undefined" && "caches" in window) {
      try {
        const keys = await window.caches.keys();
        const appKeys = keys.filter((k) => k.startsWith("lou-portfolio-"));
        for (const name of appKeys) {
          const cache = await window.caches.open(name);
          const reqs = await cache.keys();
          const urls = reqs.map((r) => {
            try {
              const u = new URL(r.url);
              return u.origin === window.location.origin
                ? `${u.pathname}${u.search}`
                : r.url;
            } catch {
              return r.url;
            }
          });
          totalEntries += urls.length;
          buckets.push({ name, urls });
        }
      } catch {
        // Ignore cache enumeration errors
      }
    }

    return {
      quotaBytes,
      usageBytes,
      totalEntries,
      buckets,
      checkedAt: new Date().toISOString(),
    };
  }, []);

  const clearOfflineCache = useCallback(
    async (options?: { clearClientQueryCache?: boolean }) => {
      if (typeof window === "undefined") return;
      if ("caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith("lou-portfolio-"))
            .map((key) => window.caches.delete(key))
        );
      }
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHES" });
      }
      if (options?.clearClientQueryCache) {
        clearPersistedPublicCache();
      }
    },
    []
  );

  const installPosture: InstallPosture = isStandalone
    ? "standalone"
    : installEvent
      ? "prompt-ready"
      : isLikelyIosSafari()
        ? "ios-safari"
        : "unavailable";

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        swState,
        updateReady,
        canInstall: Boolean(installEvent),
        isStandalone,
        installPosture,
        pendingOutboxCount,
        outboxItems,
        lastSyncedOutboxCount,
        applyUpdate,
        checkForUpdates,
        promptInstall,
        prewarmPortfolioAssets,
        getCacheDiagnostics,
        clearOfflineCache,
        queueContactInquiry,
        removeOutboxItem,
        flushContactOutbox,
        dismissSyncNotice,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function isNetworkOffline(stateOnline: boolean): boolean {
  return (
    !stateOnline ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  );
}

export function useOfflineStatus() {
  return useContext(OfflineContext);
}
