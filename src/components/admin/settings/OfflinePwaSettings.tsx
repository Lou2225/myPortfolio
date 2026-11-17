"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Download,
  Trash2,
  Loader2,
  HardDrive,
  Send,
  ChevronDown,
  Smartphone,
  CheckCircle2,
  CloudDownload,
  X,
} from "lucide-react";
import {
  useOfflineStatus,
  type PwaCacheDiagnostics,
} from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { AnimatedBar } from "@/components/motion/AdminMotion";
import { Collapsible } from "@/components/motion/Collapsible";
import type { SettingsFeedback } from "./types";

export interface OfflinePwaSettingsProps {
  onFeedback: (next: SettingsFeedback | null) => void;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function OfflinePwaSettings({ onFeedback }: OfflinePwaSettingsProps) {
  const {
    isOnline,
    swState,
    updateReady,
    canInstall,
    installPosture,
    pendingOutboxCount,
    outboxItems,
    applyUpdate,
    checkForUpdates,
    promptInstall,
    prewarmPortfolioAssets,
    getCacheDiagnostics,
    clearOfflineCache,
    removeOutboxItem,
    flushContactOutbox,
  } = useOfflineStatus();

  const [diagnostics, setDiagnostics] = useState<PwaCacheDiagnostics | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [prewarming, setPrewarming] = useState(false);
  const [flushingOutbox, setFlushingOutbox] = useState(false);
  const [clearingPwaCache, setClearingPwaCache] = useState(false);
  const [confirmClearMode, setConfirmClearMode] = useState<
    "sw-only" | "full" | null
  >(null);

  const refreshDiagnostics = useCallback(async () => {
    const info = await getCacheDiagnostics();
    setDiagnostics(info);
  }, [getCacheDiagnostics]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      void refreshDiagnostics();
    });
    return () => cancelAnimationFrame(raf);
  }, [refreshDiagnostics]);

  const swStatusLabel = (() => {
    switch (swState) {
      case "active":
        return "Active (Offline Ready)";
      case "updating":
        return "Update Ready";
      case "dev-disabled":
        return "Paused in Dev Mode";
      case "registering":
        return "Registering...";
      case "unsupported":
        return "Unsupported Browser";
      default:
        return "Unavailable";
    }
  })();

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    onFeedback(null);
    try {
      const outcome = await checkForUpdates();
      if (outcome === "update-found") {
        onFeedback(null);
        announceBrandPortalStatus({
          tone: "live",
          label: "SW Update Ready",
          detail: "Click Reload for Update to activate",
          durationMs: 3600,
        });
      } else if (outcome === "up-to-date") {
        onFeedback(null);
        announceBrandPortalStatus({
          tone: "synced",
          label: "SW Up To Date",
          detail: "Latest deployed build active",
          durationMs: 3000,
        });
      } else if (outcome === "dev-disabled") {
        onFeedback({
          type: "error",
          message:
            "Service Worker updates are paused in development mode unless NEXT_PUBLIC_ENABLE_SW=true.",
        });
      } else {
        onFeedback({
          type: "error",
          message: "Unable to check Service Worker updates right now.",
        });
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handlePrewarm = async () => {
    setPrewarming(true);
    onFeedback(null);
    try {
      const result = await prewarmPortfolioAssets();
      await refreshDiagnostics();
      onFeedback(null);
      announceBrandPortalStatus({
        tone: "synced",
        label: "Offline Ready",
        detail: `${result.cached}/${result.total} assets cached`,
        durationMs: 3200,
      });
    } catch {
      onFeedback({
        type: "error",
        message: "Failed to pre-cache live portfolio media assets.",
      });
    } finally {
      setPrewarming(false);
    }
  };

  const handleFlushOutbox = async () => {
    setFlushingOutbox(true);
    onFeedback(null);
    try {
      const result = await flushContactOutbox();
      if (result.sent > 0) {
        onFeedback(null);
        announceBrandPortalStatus({
          tone: "live",
          label: "Outbox Synced",
          detail: `Sent ${result.sent} queued inquiry${
            result.sent > 1 ? "s" : ""
          }`,
          durationMs: 3200,
        });
      } else if (result.remaining > 0) {
        onFeedback({
          type: "error",
          message: `${result.remaining} inquiry remains queued. Ensure you are online and server APIs are reachable.`,
        });
      } else {
        onFeedback(null);
        announceBrandPortalStatus({
          tone: "synced",
          label: "Outbox Clean",
          detail: "No queued inquiries pending",
          durationMs: 2600,
        });
      }
    } finally {
      setFlushingOutbox(false);
    }
  };

  const confirmClearPwaCache = async () => {
    if (!confirmClearMode) return;
    setClearingPwaCache(true);
    onFeedback(null);
    try {
      await clearOfflineCache({
        clearClientQueryCache: confirmClearMode === "full",
      });
      await refreshDiagnostics();
      const clearedQuery = confirmClearMode === "full";
      setConfirmClearMode(null);
      onFeedback(null);
      announceBrandPortalStatus({
        tone: "synced",
        label: clearedQuery ? "All Caches Reset" : "Cache Cleared",
        detail: clearedQuery
          ? "SW & local browser query cache purged"
          : "Offline assets refresh on next load",
        durationMs: 3200,
      });
    } catch {
      setConfirmClearMode(null);
      onFeedback({
        type: "error",
        message: "Unable to clear browser offline cache.",
      });
    } finally {
      setClearingPwaCache(false);
    }
  };

  const usagePct =
    diagnostics?.usageBytes != null &&
    diagnostics?.quotaBytes &&
    diagnostics.quotaBytes > 0
      ? Math.min(
          100,
          Math.max(
            diagnostics.usageBytes > 0 ? 1 : 0,
            Math.round((diagnostics.usageBytes / diagnostics.quotaBytes) * 100)
          )
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* 1. Service Worker & App Lifecycle */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="PWA & Offline Capability"
          title="Service Worker & App Install Posture"
          description="Control installability, update checks, and offline caching of public pages, resumes, and live Supabase project media."
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Service Worker caching scope"
                content="Only public portfolio routes, /api/portfolio JSON, and uploaded media/resumes are cached locally. Authenticated /admin APIs bypass CacheStorage for strict security."
              />
              {isOnline ? (
                <Wifi className="w-5 h-5 text-emerald-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-amber-400" />
              )}
            </div>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-sm p-4 space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted) block">
              Connectivity Status
            </span>
            <div className="flex items-center gap-2 pt-1">
              <StatusPill
                label={isOnline ? "Online" : "Offline"}
                variant={isOnline ? "success" : "warning"}
                size="xs"
              />
              <span className="text-xs text-(--text-secondary)">
                {isOnline
                  ? "Admin writes enabled"
                  : "Offline — Read-only mode"}
              </span>
            </div>
          </div>

          <div className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-sm p-4 space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted) block">
              Service Worker Cache
            </span>
            <div className="flex items-center gap-2 pt-1">
              <StatusPill
                label={swStatusLabel}
                variant={
                  swState === "active"
                    ? "success"
                    : swState === "updating"
                      ? "accent"
                      : "neutral"
                }
                size="xs"
              />
            </div>
          </div>

          <div className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-sm p-4 space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted) block">
              PWA Install Posture
            </span>
            <div className="flex items-center gap-2 pt-1">
              <StatusPill
                label={
                  installPosture === "standalone"
                    ? "Installed App"
                    : installPosture === "prompt-ready"
                      ? "Ready to Install"
                      : installPosture === "ios-safari"
                        ? "Safari A2HS"
                        : "Browser Tab"
                }
                variant={
                  installPosture === "standalone"
                    ? "success"
                    : installPosture === "prompt-ready"
                      ? "accent"
                      : "neutral"
                }
                size="xs"
                icon={<Smartphone className="w-3 h-3" />}
              />
              {installPosture === "ios-safari" && (
                <span className="text-[11px] text-(--text-muted)">
                  Tap Share → Add to Home Screen
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-(--border-subtle)">
          <span className="text-xs text-(--text-muted)">
            CacheStorage covers public routes, live <code className="font-mono text-(--text-primary)">/api/portfolio</code>, and uploaded media (never <code className="font-mono text-(--text-primary)">/admin</code>).
          </span>

          <div className="flex flex-wrap items-center gap-2.5">
            {updateReady && (
              <Button
                type="button"
                onClick={applyUpdate}
                variant="primary"
                size="sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload for Update</span>
              </Button>
            )}

            <Button
              type="button"
              onClick={() => void handleCheckUpdates()}
              disabled={checkingUpdate}
              variant="secondary"
              size="sm"
            >
              {checkingUpdate ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-(--text-accent)" />
              )}
              <span>Check for Updates</span>
            </Button>

            <Button
              type="button"
              onClick={() => void handlePrewarm()}
              disabled={prewarming || !isOnline}
              variant="secondary"
              size="sm"
            >
              {prewarming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CloudDownload className="w-3.5 h-3.5 text-(--text-accent)" />
              )}
              <span>Sync Portfolio for Offline</span>
            </Button>

            {canInstall && (
              <Button
                type="button"
                onClick={() => void promptInstall()}
                variant="primary"
                size="sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install App</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Browser CacheStorage & Quota Inspector */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Origin Storage Diagnostics"
          title="CacheStorage Buckets & Quota Footprint"
          description="Inspect how much origin storage this browser has allocated and review cached routes and media."
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Browser origin quota explained"
                content="Measures persistent browser storage used by CacheStorage buckets and local offline query state under this domain."
              />
              <HardDrive className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        <div className="p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <span className="text-(--text-muted) uppercase tracking-wider">
              Browser Origin Usage ({diagnostics?.totalEntries ?? 0} cached entries)
            </span>
            <span className="text-(--text-primary)">
              {formatBytes(diagnostics?.usageBytes)} /{" "}
              {formatBytes(diagnostics?.quotaBytes)} ({usagePct}%)
            </span>
          </div>
          <AnimatedBar percentage={usagePct} heightClassName="h-1.5" />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setInspectOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-(--text-primary) hover:text-(--text-accent) cursor-pointer transition-colors"
            >
              <span>
                {inspectOpen
                  ? "Hide Cached URLs"
                  : `Inspect Cached Entries (${diagnostics?.totalEntries ?? 0})`}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  inspectOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => void refreshDiagnostics()}
              className="text-[11px] font-mono text-(--text-muted) hover:text-(--text-accent) cursor-pointer transition-colors"
            >
              Refresh Metrics
            </button>
          </div>
        </div>

        <Collapsible open={inspectOpen} allowOverflowWhenOpen>
          <div className="space-y-3 pt-1">
            {!diagnostics || diagnostics.buckets.length === 0 ? (
              <p className="text-xs font-mono text-(--text-muted) p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle)">
                No Service Worker CacheStorage entries are present yet. Run &ldquo;Sync Portfolio for Offline&rdquo; on a production build to populate caches.
              </p>
            ) : (
              diagnostics.buckets.map((bucket) => (
                <div
                  key={bucket.name}
                  className="p-3.5 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-(--text-primary)">
                      {bucket.name}
                    </span>
                    <StatusPill
                      label={`${bucket.urls.length} files`}
                      variant="neutral"
                      size="xs"
                    />
                  </div>
                  <ul
                    data-lenis-prevent
                    className="max-h-40 overflow-y-auto overscroll-contain lou-scrollarea space-y-1 text-[11px] font-mono text-(--text-muted)"
                  >
                    {bucket.urls.map((u) => (
                      <li key={u} className="truncate">
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </Collapsible>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-(--border-subtle)">
          <Button
            type="button"
            onClick={() => setConfirmClearMode("sw-only")}
            disabled={clearingPwaCache}
            variant="secondary"
            size="sm"
          >
            {clearingPwaCache ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 text-(--text-accent)" />
            )}
            <span>Clear SW Cache</span>
          </Button>

          <Button
            type="button"
            onClick={() => setConfirmClearMode("full")}
            disabled={clearingPwaCache}
            variant="danger"
            size="sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset SW + Browser Query Cache</span>
          </Button>
        </div>
      </div>

      {/* 3. Queued Contact Outbox Inspector */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-4"
      >
        <SectionHeader
          eyebrow="Background Sync Queue"
          title="Queued Offline Contact Outbox"
          description="Inquiries submitted while visitors are offline stay queued locally and auto-flush on reconnect."
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="How offline outbox sync works"
                content="Visitors submitting Contact inquiries while offline have their message queued safely in local IndexedDB/localStorage and dispatched once reconnected."
              />
              <StatusPill
                label={`${pendingOutboxCount} Queued`}
                variant={pendingOutboxCount > 0 ? "warning" : "success"}
                size="xs"
              />
            </div>
          }
        />

        {outboxItems.length === 0 ? (
          <div className="p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) flex items-center gap-2.5 text-xs text-(--text-muted)">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>All queued contact submissions have been synced to the server.</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {outboxItems.map((item) => (
              <div
                key={item.queuedAt}
                className="p-3.5 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-(--text-primary)">
                      {item.name}
                    </span>
                    <span className="text-[11px] font-mono text-(--text-muted)">
                      &lt;{item.email}&gt;
                    </span>
                    <span
                      suppressHydrationWarning
                      className="text-[10px] font-mono text-(--text-muted)"
                    >
                      Queued {new Date(item.queuedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-(--text-primary) truncate">
                    {item.subject}
                  </p>
                  <p className="text-xs text-(--text-muted) line-clamp-2">
                    {item.message}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOutboxItem(item.queuedAt)}
                  aria-label={`Discard queued message from ${item.name}`}
                >
                  <X className="w-4 h-4 text-rose-400" />
                </Button>
              </div>
            ))}

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                onClick={() => void handleFlushOutbox()}
                disabled={flushingOutbox || !isOnline}
                variant="primary"
                size="sm"
              >
                {flushingOutbox ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Flush Outbox Now</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(confirmClearMode)}
        variant="danger"
        title={
          confirmClearMode === "full"
            ? "Reset Service Worker & Browser Cache?"
            : "Clear Service Worker Cache?"
        }
        description={
          confirmClearMode === "full"
            ? "Evicts all Service Worker CacheStorage buckets and clears persisted public TanStack cache in localStorage. Fresh data will reload from the server online."
            : "Evicts cached Service Worker routes and assets in your browser. Fresh assets will be re-cached on your next online visit."
        }
        confirmLabel="Clear Cache"
        loading={clearingPwaCache}
        onCancel={() => {
          if (!clearingPwaCache) setConfirmClearMode(null);
        }}
        onConfirm={confirmClearPwaCache}
      />
    </div>
  );
}
