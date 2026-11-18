"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Trash2,
  RotateCcw,
  Loader2,
  RefreshCw,
  HardDrive,
  MailCheck,
  Search,
} from "lucide-react";
import type { PortfolioDatabase } from "@/types/portfolio";
import type { MediaAuditReport } from "@/lib/backups";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  useOfflineStatus,
  isNetworkOffline,
} from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import {
  AdminMobileStepView,
  MobileStepItem,
  useStepNavigation,
} from "@/components/admin/AdminMobileStepView";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoTooltip } from "@/components/ui/Tooltip";
import type { SettingsFeedback } from "./types";

type MaintenanceStep = 0 | 1 | 2;

const MAINTENANCE_STEPS: readonly MobileStepItem[] = [
  { code: "01", shortTitle: "Cache" },
  { code: "02", shortTitle: "Hygiene" },
  { code: "03", shortTitle: "Reset" },
];

export interface MaintenanceDangerSettingsProps {
  db: PortfolioDatabase;
  resettingSeed: boolean;
  onDatabaseSync: (nextDb: PortfolioDatabase) => Promise<void> | void;
  onResetSeed: () => Promise<void> | void;
  onFeedback: (next: SettingsFeedback | null) => void;
}

type ConfirmActionState =
  | { kind: "prune-analytics"; days: 30 | 90 | 0; eligibleCount: number }
  | { kind: "purge-inbox"; eligibleCount: number }
  | { kind: "purge-orphans"; targets: string[]; totalBytes: number }
  | null;

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MaintenanceDangerSettings({
  db,
  resettingSeed,
  onDatabaseSync,
  onResetSeed,
  onFeedback,
}: MaintenanceDangerSettingsProps) {
  const { isOnline } = useOfflineStatus();
  const queryClient = useQueryClient();
  const isMobileOrTablet = useMediaQuery("(max-width: 1023px)");
  const { activeStep, stepDirection, switchStep } =
    useStepNavigation<MaintenanceStep>(0);

  const [flushingCache, setFlushingCache] = useState(false);
  const [scanningMedia, setScanningMedia] = useState(false);
  const [mediaAudit, setMediaAudit] = useState<MediaAuditReport | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmActionState>(null);
  const [executingConfirm, setExecutingConfirm] = useState(false);
  const [referenceNow, setReferenceNow] = useState<number>(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setReferenceNow(Date.now());
    });
    return () => cancelAnimationFrame(id);
  }, [db.analytics]);

  const analyticsCount = db.analytics.length;

  const { older30Count, older90Count, readUnstarredCount } = useMemo(() => {
    const readInbox = db.messages.filter((m) => m.isRead && !m.isStarred).length;
    if (referenceNow === 0) {
      return {
        older30Count: 0,
        older90Count: 0,
        readUnstarredCount: readInbox,
      };
    }
    const cutoff30 = referenceNow - 30 * 24 * 60 * 60 * 1000;
    const cutoff90 = referenceNow - 90 * 24 * 60 * 60 * 1000;
    let o30 = 0;
    let o90 = 0;
    for (const ev of db.analytics) {
      const ts = new Date(ev.createdAt).getTime();
      if (!Number.isNaN(ts)) {
        if (ts < cutoff30) o30 += 1;
        if (ts < cutoff90) o90 += 1;
      }
    }
    return {
      older30Count: o30,
      older90Count: o90,
      readUnstarredCount: readInbox,
    };
  }, [db.analytics, db.messages, referenceNow]);

  const requireOnline = (): boolean => {
    if (isNetworkOffline(isOnline)) {
      onFeedback({
        type: "error",
        message: "Offline — Reconnect to run maintenance tasks",
      });
      return false;
    }
    return true;
  };

  const handleFlushServerCache = async () => {
    if (!requireOnline()) return;
    setFlushingCache(true);
    onFeedback(null);
    try {
      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flush-server-cache" }),
      });
      if (!res.ok) throw new Error("Failed to flush server cache.");
      onFeedback(null);
      announceBrandPortalStatus({
        tone: "synced",
        label: "Cache Flushed",
        detail: "ISR & RAM snapshots revalidated",
        durationMs: 3200,
      });
    } catch (err) {
      onFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to purge server cache.",
      });
    } finally {
      setFlushingCache(false);
    }
  };

  const handleScanMedia = async () => {
    if (!requireOnline()) return;
    setScanningMedia(true);
    onFeedback(null);
    try {
      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan-media" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.mediaAudit) {
        throw new Error(json?.error || "Failed to audit upload storage.");
      }
      setMediaAudit(json.mediaAudit as MediaAuditReport);
    } catch (err) {
      onFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Media storage scan failed.",
      });
    } finally {
      setScanningMedia(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmState) return;
    setExecutingConfirm(true);
    onFeedback(null);

    try {
      if (confirmState.kind === "prune-analytics") {
        const res = await fetch("/api/admin/system", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "prune-analytics",
            mode: confirmState.days === 0 ? "clear-all" : "older-than-days",
            days: confirmState.days,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.data) {
          throw new Error(json?.error || "Failed to prune analytics.");
        }
        await onDatabaseSync(json.data as PortfolioDatabase);
        await queryClient.invalidateQueries({ queryKey: ["admin-system-overview"] });
        onFeedback(null);
        announceBrandPortalStatus({
          tone: "live",
          label: "Telemetry Pruned",
          detail: `Removed ${json.removedCount ?? confirmState.eligibleCount} event(s)`,
          durationMs: 3400,
        });
      } else if (confirmState.kind === "purge-inbox") {
        const res = await fetch("/api/admin/system", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "purge-read-messages" }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.data) {
          throw new Error(json?.error || "Failed to purge inbox messages.");
        }
        await onDatabaseSync(json.data as PortfolioDatabase);
        await queryClient.invalidateQueries({ queryKey: ["admin-system-overview"] });
        onFeedback(null);
        announceBrandPortalStatus({
          tone: "live",
          label: "Inbox Purged",
          detail: `Cleared ${json.purgedCount ?? confirmState.eligibleCount} read message(s)`,
          durationMs: 3400,
        });
      } else if (confirmState.kind === "purge-orphans") {
        const res = await fetch("/api/admin/system", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "purge-orphan-media",
            targets: confirmState.targets,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Failed to purge orphaned uploads.");
        }
        if (json.mediaAudit) {
          setMediaAudit(json.mediaAudit as MediaAuditReport);
        }
        const deletedCount = Array.isArray(json.deleted)
          ? json.deleted.length
          : 0;
        onFeedback(null);
        announceBrandPortalStatus({
          tone: "live",
          label: "Media Cleaned",
          detail: `Deleted ${deletedCount} orphaned upload(s)`,
          durationMs: 3400,
        });
      }
      setConfirmState(null);
    } catch (err) {
      setConfirmState(null);
      onFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Maintenance action failed.",
      });
    } finally {
      setExecutingConfirm(false);
    }
  };

  /* 1. Runtime Server & Edge Revalidation */
  const cacheSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4"
    >
      <SectionHeader
        eyebrow="Runtime Cache Control"
        title="Server Memory & Public ISR Revalidation"
        description="Immediately clears the server's 60-second RAM snapshot and revalidates Next.js public pages and /api/portfolio."
        size="sm"
        tooltip={
          <InfoTooltip
            label="When to flush server & ISR cache"
            content="Use if public pages appear stale after direct Supabase row edits or external media replacements. Forces immediate server cache invalidation."
          />
        }
        rightSlot={<RefreshCw className="w-5 h-5 text-(--text-accent)" />}
      />

      <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
        <p className="text-xs text-(--text-muted) leading-relaxed">
          Use this after editing database rows directly in Supabase or
          troubleshooting stale cached content on live routes.
        </p>
        <Button
          type="button"
          onClick={() => void handleFlushServerCache()}
          disabled={flushingCache || !isOnline}
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto shrink-0"
        >
          {flushingCache ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
          )}
          <span>Flush Server &amp; ISR Cache</span>
        </Button>
      </div>
    </div>
  );

  /* 2. Data Retention & Orphan Media Hygiene */
  const hygieneSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5"
    >
      <SectionHeader
        eyebrow="Data & Asset Hygiene"
        title="Telemetry Retention, Inbox & Orphan Upload Cleanup"
        description="Trim historical logs or reclaim storage space from superseded image/CV uploads safely."
        size="sm"
        tooltip={
          <InfoTooltip
            label="Safe hygiene boundaries"
            content="Pruning analytics only deletes telemetry rows. Purging inbox never removes Unread or Starred inquiries. Orphan scanner never touches currently referenced images or seed assets."
          />
        }
        rightSlot={<HardDrive className="w-5 h-5 text-(--text-accent)" />}
      />

      <div className="space-y-3">
        {/* Analytics Pruner */}
        <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-(--text-primary)">
                Analytics Telemetry Retention
              </p>
              <StatusPill
                label={`${analyticsCount} total`}
                variant="neutral"
                size="xs"
              />
            </div>
            <p className="text-xs text-(--text-muted) mt-1 leading-relaxed">
              Prune aging funnel logs by age while keeping recent activity, or
              wipe all recorded events.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 w-full lg:w-auto shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              disabled={older90Count === 0}
              onClick={() =>
                requireOnline() &&
                setConfirmState({
                  kind: "prune-analytics",
                  days: 90,
                  eligibleCount: older90Count,
                })
              }
            >
              <span>&gt; 90 Days ({older90Count})</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              disabled={older30Count === 0}
              onClick={() =>
                requireOnline() &&
                setConfirmState({
                  kind: "prune-analytics",
                  days: 30,
                  eligibleCount: older30Count,
                })
              }
            >
              <span>&gt; 30 Days ({older30Count})</span>
            </Button>
            <div className="col-span-2 sm:col-span-1">
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="w-full sm:w-auto"
                disabled={analyticsCount === 0}
                onClick={() =>
                  requireOnline() &&
                  setConfirmState({
                    kind: "prune-analytics",
                    days: 0,
                    eligibleCount: analyticsCount,
                  })
                }
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Clear All ({analyticsCount})</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Read Inbox Purge */}
        <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-(--text-primary)">
                Purge Read Inbox Inquiries
              </p>
              <StatusPill
                label={`${readUnstarredCount} eligible`}
                variant={readUnstarredCount > 0 ? "accent" : "neutral"}
                size="xs"
              />
            </div>
            <p className="text-xs text-(--text-muted) mt-1 leading-relaxed">
              Deletes archived read messages only. Unread and starred inquiries
              remain strictly protected.
            </p>
          </div>

          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={readUnstarredCount === 0}
            onClick={() =>
              requireOnline() &&
              setConfirmState({
                kind: "purge-inbox",
                eligibleCount: readUnstarredCount,
              })
            }
            className="w-full sm:w-auto shrink-0"
          >
            <MailCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Purge Read ({readUnstarredCount})</span>
          </Button>
        </div>

        {/* Orphaned Upload Media Audit */}
        <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-(--text-primary)">
                Orphaned Upload Asset Scanner
              </p>
              <p className="text-xs text-(--text-muted) mt-1 leading-relaxed">
                Scans uploaded avatars, monograms, project covers, and PDFs not
                currently linked by any active portfolio record.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto"
                disabled={scanningMedia || !isOnline}
                onClick={() => void handleScanMedia()}
              >
                {scanningMedia ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Search className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                )}
                <span>Scan Uploads</span>
              </Button>

              {mediaAudit && mediaAudit.orphans.length > 0 && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    const totalBytes = mediaAudit.orphans.reduce(
                      (s, o) => s + o.sizeBytes,
                      0
                    );
                    setConfirmState({
                      kind: "purge-orphans",
                      targets: mediaAudit.orphans.map((o) => o.storagePath),
                      totalBytes,
                    });
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Purge {mediaAudit.orphans.length} Orphans</span>
                </Button>
              )}
            </div>
          </div>

          {mediaAudit && (
            <div className="p-3 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) space-y-2 text-xs font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-(--text-muted)">
                <span className="truncate">
                  Bucket/Dir:{" "}
                  <strong className="text-(--text-primary)">
                    {mediaAudit.bucketOrDir}
                  </strong>{" "}
                  · {mediaAudit.totalFiles} files (
                  {formatByteSize(mediaAudit.totalBytes)})
                </span>
                <StatusPill
                  label={
                    mediaAudit.orphans.length === 0
                      ? "0 Orphans Found"
                      : `${mediaAudit.orphans.length} Unreferenced`
                  }
                  variant={
                    mediaAudit.orphans.length === 0 ? "success" : "warning"
                  }
                  size="xs"
                />
              </div>
              {mediaAudit.scanWarning && (
                <p className="text-amber-400">{mediaAudit.scanWarning}</p>
              )}
              {mediaAudit.orphans.length > 0 && (
                <ul
                  data-lenis-prevent
                  className="max-h-36 overflow-y-auto overscroll-contain lou-scrollarea space-y-1 text-[11px] text-(--text-secondary) pt-1"
                >
                  {mediaAudit.orphans.map((file) => (
                    <li
                      key={file.id}
                      className="flex items-center justify-between gap-2 truncate"
                    >
                      <span className="truncate">{file.storagePath}</span>
                      <span className="text-(--text-muted) shrink-0">
                        {formatByteSize(file.sizeBytes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* 3. Danger Zone (Factory Reset with Pre-Reset Snapshot & Typed Safeguard) */
  const resetSectionNode = (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4"
    >
      <SectionHeader
        eyebrow="Danger Zone"
        title="Factory Reset Portfolio Seed Defaults"
        description="Restores baseline portfolio copy from src/data/* while automatically saving a Server Snapshot Vault recovery checkpoint first."
        size="sm"
        tooltip={
          <InfoTooltip
            label="Pre-reset automatic snapshot"
            content="Before seed defaults are written, an automatic 'Pre-Reset' recovery checkpoint is saved inside Database & Backups so you can roll back anytime."
          />
        }
        rightSlot={<AlertTriangle className="w-5 h-5 text-rose-500" />}
      />

      <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-rose-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="text-sm font-semibold text-(--text-primary)">
            Reset Content to Initial Seed Defaults
          </p>
          <p className="text-xs text-(--text-muted) leading-relaxed">
            Overwrites{" "}
            <strong className="text-(--text-primary)">
              Profile, Story, Skills, Impact &amp; Projects
            </strong>
            . Preserves{" "}
            <strong className="text-(--text-primary)">
              Inbox, Analytics, Trusted Devices &amp; Password
            </strong>
            .
          </p>
        </div>
        <Button
          type="button"
          onClick={onResetSeed}
          disabled={resettingSeed}
          variant="danger"
          size="sm"
          className="w-full sm:w-auto shrink-0"
        >
          <RotateCcw
            className={`w-3.5 h-3.5 shrink-0 ${
              resettingSeed ? "animate-spin" : ""
            }`}
          />
          <span>Factory Reset to Seed Defaults</span>
        </Button>
      </div>
    </div>
  );

  const maintenancePanels = [
    cacheSectionNode,
    hygieneSectionNode,
    resetSectionNode,
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {isMobileOrTablet ? (
        <AdminMobileStepView
          ariaLabel="Cache control, data hygiene, and danger zone sections"
          steps={MAINTENANCE_STEPS}
          activeStep={activeStep}
          direction={stepDirection}
          onChangeStep={(next) => switchStep(next as MaintenanceStep)}
        >
          {maintenancePanels[activeStep] ?? maintenancePanels[0]}
        </AdminMobileStepView>
      ) : (
        <>
          {cacheSectionNode}
          {hygieneSectionNode}
          {resetSectionNode}
        </>
      )}

      <ConfirmModal
        open={Boolean(confirmState)}
        variant="danger"
        title={
          confirmState?.kind === "prune-analytics"
            ? confirmState.days === 0
              ? `Clear All ${confirmState.eligibleCount} Analytics Events?`
              : `Prune ${confirmState.eligibleCount} Analytics Events (> ${confirmState.days}d)?`
            : confirmState?.kind === "purge-inbox"
              ? `Purge ${confirmState.eligibleCount} Read Inbox Inquiries?`
              : confirmState?.kind === "purge-orphans"
                ? `Delete ${confirmState.targets.length} Orphaned Files?`
                : "Confirm Maintenance Action"
        }
        description={
          confirmState?.kind === "prune-analytics"
            ? confirmState.days === 0
              ? "All recorded analytics telemetry events will be permanently removed. Portfolio content and inbox messages remain untouched."
              : `Analytics events older than ${confirmState.days} days (${confirmState.eligibleCount} events) will be deleted. Recent metrics stay intact.`
            : confirmState?.kind === "purge-inbox"
              ? `Deletes ${confirmState.eligibleCount} read inquiries. All unread and starred messages stay safely protected in your inbox.`
              : confirmState?.kind === "purge-orphans"
                ? `Permanently deletes ${confirmState.targets.length} unreferenced files (${formatByteSize(
                    confirmState.totalBytes
                  )}) from upload storage. Active portfolio images and resumes cannot be deleted.`
                : ""
        }
        confirmLabel={
          confirmState?.kind === "purge-orphans"
            ? "Delete Orphans"
            : confirmState?.kind === "purge-inbox"
              ? "Purge Read Messages"
              : "Confirm Prune"
        }
        loading={executingConfirm}
        onCancel={() => {
          if (!executingConfirm) setConfirmState(null);
        }}
        onConfirm={executeConfirmedAction}
      />
    </div>
  );
}
