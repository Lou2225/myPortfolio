"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useMediaQuery } from "@/lib/useMediaQuery";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import {
  AdminMobileStepView,
  MobileStepItem,
  useStepNavigation,
} from "@/components/admin/AdminMobileStepView";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { AnimatedBar } from "@/components/motion/AdminMotion";
import { Collapsible } from "@/components/motion/Collapsible";
import type { SettingsFeedback } from "./types";

export interface OfflinePwaSettingsProps {
  onFeedback: (next: SettingsFeedback | null) => void;
}

type OfflinePwaStep = 0 | 1 | 2;

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

  const isMobileOrTablet = useMediaQuery("(max-width: 1023px)");
  const { activeStep, stepDirection, switchStep } =
    useStepNavigation<OfflinePwaStep>(0);

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

  const pwaSteps = useMemo<readonly MobileStepItem[]>(
    () => [
      { code: "01", shortTitle: "Status" },
      { code: "02", shortTitle: "Storage" },
      {
        code: "03",
        shortTitle:
          pendingOutboxCount > 0
            ? `Outbox (${pendingOutboxCount})`
            : "Outbox",
      },
    ],
    [pendingOutboxCount]
  );

  /* 1. Service Worker & App Lifecycle */
  const lifecycleSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5"
    >
      <SectionHeader
        eyebrow="PWA & Offline Capability"
        title="Service Worker & App Install Posture"
        description="Control installability, update checks, and offline caching of public pages, resumes, and live Supabase project media."
        size="sm"
        tooltip={
          <InfoTooltip
            label="Service Worker caching scope"
            content="Only public portfolio routes, /api/portfolio JSON, and uploaded media/resumes are cached locally. Authenticated /admin APIs bypass CacheStorage for strict security."
          />
        }
        rightSlot={
          isOnline ? (
            <Wifi className="w-5 h-5 text-emerald-400" />
          ) : (
            <WifiOff className="w-5 h-5 text-amber-400" />
          )
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
        <div className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-(--radius-control) p-3 sm:p-4 space-y-1.5 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted) block truncate">
            Connectivity
          </span>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span
              className={`text-xs font-mono uppercase tracking-wider font-semibold ${
                isOnline ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {isOnline ? "Online" : "Offline"}
            </span>
            <span className="text-[11px] text-(--text-secondary) hidden sm:inline">
              · {isOnline ? "Admin writes enabled" : "Read-only mode"}
            </span>
          </div>
          <p className="text-[11px] text-(--text-muted) sm:hidden">
            {isOnline ? "Writes enabled" : "Read-only mode"}
          </p>
        </div>

        <div className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-(--radius-control) p-3 sm:p-4 space-y-1.5 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted) block truncate">
            Install Posture
          </span>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-mono font-semibold ${
                installPosture === "standalone"
                  ? "text-emerald-400"
                  : installPosture === "prompt-ready"
                    ? "text-(--text-accent)"
                    : "text-(--text-primary)"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {installPosture === "standalone"
                  ? "Installed"
                  : installPosture === "prompt-ready"
                    ? "Install Ready"
                    : installPosture === "ios-safari"
                      ? "Safari A2HS"
                      : "Browser Tab"}
              </span>
            </span>
          </div>
          {installPosture === "ios-safari" && (
            <p className="text-[10px] text-(--text-muted)">
              Share → Add to Home Screen
            </p>
          )}
        </div>

        <div className="col-span-2 md:col-span-1 bg-(--bg-surface-2) border border-(--border-subtle) rounded-(--radius-control) p-3 sm:p-4 space-y-1.5 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted) block truncate">
            Service Worker Cache
          </span>
          <div className="flex items-center gap-2 pt-0.5">
            <span
              className={`text-xs font-mono font-semibold ${
                swState === "active"
                  ? "text-emerald-400"
                  : swState === "updating"
                    ? "text-(--text-accent)"
                    : "text-(--text-secondary)"
              }`}
            >
              {swStatusLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2.5 border-t border-(--border-subtle)">
        <span className="text-xs text-(--text-muted) leading-relaxed">
          CacheStorage covers public routes,{" "}
          <code className="font-mono text-(--text-primary)">
            /api/portfolio
          </code>
          , and uploaded media (never{" "}
          <code className="font-mono text-(--text-primary)">/admin</code>).
        </span>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2 sm:gap-2.5 w-full lg:w-auto shrink-0">
          {updateReady && (
            <Button
              type="button"
              onClick={applyUpdate}
              variant="primary"
              size="sm"
              className="w-full sm:w-auto"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Reload for Update</span>
            </Button>
          )}

          {canInstall && (
            <Button
              type="button"
              onClick={() => void promptInstall()}
              variant="primary"
              size="sm"
              className="w-full sm:w-auto"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Install App</span>
            </Button>
          )}

          <Button
            type="button"
            onClick={() => void handleCheckUpdates()}
            disabled={checkingUpdate}
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
          >
            {checkingUpdate ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
            )}
            <span>Check for Updates</span>
          </Button>

          <Button
            type="button"
            onClick={() => void handlePrewarm()}
            disabled={prewarming || !isOnline}
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
          >
            {prewarming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <CloudDownload className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
            )}
            <span>Sync Portfolio Offline</span>
          </Button>
        </div>
      </div>
    </div>
  );

  /* 2. Browser CacheStorage & Quota Inspector */
  const storageSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5"
    >
      <SectionHeader
        eyebrow="Origin Storage Diagnostics"
        title="CacheStorage Buckets & Quota Footprint"
        description="Inspect how much origin storage this browser has allocated and review cached routes and media."
        size="sm"
        tooltip={
          <InfoTooltip
            label="Browser origin quota explained"
            content="Measures persistent browser storage used by CacheStorage buckets and local offline query state under this domain."
          />
        }
        rightSlot={<HardDrive className="w-5 h-5 text-(--text-accent)" />}
      />

      <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-mono">
          <span className="text-(--text-muted) uppercase tracking-wider">
            Browser Origin Usage ({diagnostics?.totalEntries ?? 0} cached entries)
          </span>
          <span className="text-(--text-primary) font-semibold">
            {formatBytes(diagnostics?.usageBytes)} /{" "}
            {formatBytes(diagnostics?.quotaBytes)} ({usagePct}%)
          </span>
        </div>
        <AnimatedBar percentage={usagePct} heightClassName="h-1.5" />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-(--border-subtle)/60">
          <button
            type="button"
            onClick={() => setInspectOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 py-1 text-xs font-mono text-(--text-primary) hover:text-(--text-accent) cursor-pointer transition-colors"
          >
            <span>
              {inspectOpen
                ? "Hide Cached URLs"
                : `Inspect Entries (${diagnostics?.totalEntries ?? 0})`}
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
            className="py-1 text-[11px] font-mono text-(--text-accent) hover:underline cursor-pointer transition-colors"
          >
            Refresh Metrics
          </button>
        </div>
      </div>

      <Collapsible open={inspectOpen} allowOverflowWhenOpen>
        <div className="space-y-3 pt-1">
          {!diagnostics || diagnostics.buckets.length === 0 ? (
            <p className="text-xs font-mono text-(--text-muted) p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) leading-relaxed">
              No Service Worker CacheStorage entries are present yet. Run
              &ldquo;Sync Portfolio Offline&rdquo; on a production build to
              populate caches.
            </p>
          ) : (
            diagnostics.buckets.map((bucket) => (
              <div
                key={bucket.name}
                className="p-3.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-2"
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-xs font-mono font-semibold text-(--text-primary) truncate">
                    {bucket.name}
                  </span>
                  <span className="text-[11px] font-mono text-(--text-muted) tabular-nums shrink-0">
                    {bucket.urls.length} files
                  </span>
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

      <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2 sm:gap-2.5 pt-2.5 border-t border-(--border-subtle)">
        <Button
          type="button"
          onClick={() => setConfirmClearMode("sw-only")}
          disabled={clearingPwaCache}
          variant="danger"
          size="sm"
          className="w-full sm:w-auto"
        >
          {clearingPwaCache ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>Clear SW Cache</span>
        </Button>

        <Button
          type="button"
          onClick={() => setConfirmClearMode("full")}
          disabled={clearingPwaCache}
          variant="danger"
          size="sm"
          className="w-full sm:w-auto"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>Reset SW &amp; Query Cache</span>
        </Button>
      </div>
    </div>
  );

  /* 3. Queued Contact Outbox Inspector */
  const outboxSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4"
    >
      <SectionHeader
        eyebrow="Background Sync Queue"
        title="Queued Offline Contact Outbox"
        description="Inquiries submitted while visitors are offline stay queued locally and auto-flush on reconnect."
        size="sm"
        tooltip={
          <InfoTooltip
            label="How offline outbox sync works"
            content="Visitors submitting Contact inquiries while offline have their message queued safely in local IndexedDB/localStorage and dispatched once reconnected."
          />
        }
        rightSlot={
          <span
            className={`text-[11px] font-mono tabular-nums ${
              pendingOutboxCount > 0 ? "text-amber-400" : "text-(--text-muted)"
            }`}
          >
            {pendingOutboxCount} Queued
          </span>
        }
      />

      {outboxItems.length === 0 ? (
        <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex items-center gap-2.5 text-xs text-(--text-muted)">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>All queued contact submissions have been synced to the server.</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {outboxItems.map((item) => (
            <div
              key={item.queuedAt}
              className="p-3.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs font-semibold text-(--text-primary)">
                    {item.name}
                  </span>
                  <span className="text-[11px] font-mono text-(--text-muted) break-all">
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
                variant="danger"
                size="icon"
                onClick={() => removeOutboxItem(item.queuedAt)}
                aria-label={`Discard queued message from ${item.name}`}
              >
                <X className="w-4 h-4" />
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
              className="w-full sm:w-auto"
            >
              {flushingOutbox ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Send className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Flush Outbox Now</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const pwaPanels = [
    lifecycleSectionNode,
    storageSectionNode,
    outboxSectionNode,
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {isMobileOrTablet ? (
        <AdminMobileStepView
          ariaLabel="Offline cache and PWA sections"
          steps={pwaSteps}
          activeStep={activeStep}
          direction={stepDirection}
          onChangeStep={(next) => switchStep(next as OfflinePwaStep)}
        >
          {pwaPanels[activeStep] ?? pwaPanels[0]}
        </AdminMobileStepView>
      ) : (
        <>
          {lifecycleSectionNode}
          {storageSectionNode}
          {outboxSectionNode}
        </>
      )}

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
