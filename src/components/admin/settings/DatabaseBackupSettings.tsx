"use client";

import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HardDrive,
  Database,
  Download,
  Upload,
  Loader2,
  History,
  RefreshCw,
  Trash2,
  RotateCcw,
  BookmarkPlus,
  Activity,
  ShieldAlert,
} from "lucide-react";
import type { PortfolioDatabase } from "@/types/portfolio";
import type { DatabaseHealthReport } from "@/lib/db";
import type {
  PortfolioBackupEnvelope,
  PortfolioSnapshotMeta,
  SectionFootprint,
} from "@/lib/backups";
import type { RestoreSectionFlags } from "@/lib/validation";
import {
  useOfflineStatus,
  isNetworkOffline,
} from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { IconActionButton } from "@/components/ui/ActionButtons";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { TextField } from "@/components/ui/fields";
import { TruncatedText, InfoTooltip } from "@/components/ui/Tooltip";
import { AnimatedCounter, AnimatedBar } from "@/components/motion/AdminMotion";
import { BackupRestoreModal, type BackupSectionCounts } from "./BackupRestoreModal";
import type { SettingsFeedback } from "./types";

interface SystemOverviewResponse {
  health: DatabaseHealthReport;
  footprints: {
    totalBytes: number;
    sections: SectionFootprint[];
  };
  snapshots: PortfolioSnapshotMeta[];
}

export interface DatabaseBackupSettingsProps {
  db: PortfolioDatabase;
  storageMode: "local-json" | "supabase";
  onDatabaseSync: (nextDb: PortfolioDatabase) => Promise<void> | void;
  onFeedback: (next: SettingsFeedback | null) => void;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function computeBrowserSha256(payload: unknown): Promise<string | null> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return null;
  }
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export function DatabaseBackupSettings({
  db,
  storageMode,
  onDatabaseSync,
  onFeedback,
}: DatabaseBackupSettingsProps) {
  const { isOnline } = useOfflineStatus();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [confirmSnapshotOpen, setConfirmSnapshotOpen] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deletingSnapshot, setDeletingSnapshot] =
    useState<PortfolioSnapshotMeta | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const [pendingRestore, setPendingRestore] = useState<{
    kind: "json" | "snapshot";
    sourceLabel: string;
    integrityStatus: "verified" | "mismatch" | "legacy";
    incomingCounts: BackupSectionCounts;
    rawBackup?: unknown;
    snapshotId?: string;
  } | null>(null);

  const systemQuery = useQuery<SystemOverviewResponse>({
    queryKey: ["admin-system-overview"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load database diagnostics");
      }
      return (await res.json()) as SystemOverviewResponse;
    },
    staleTime: 20_000,
  });

  const currentCounts: BackupSectionCounts = {
    projects: db.projects.length,
    skills: db.skills.length,
    pillars: db.pillars.length,
    messages: db.messages.length,
    analytics: db.analytics.length,
  };

  const handleExportJson = async (scope: "content-only" | "full") => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const exportData: Partial<PortfolioDatabase> =
        scope === "content-only"
          ? {
              profile: db.profile,
              sectionHeaders: db.sectionHeaders,
              marqueePrinciples: db.marqueePrinciples,
              pillars: db.pillars,
              skills: db.skills,
              projects: db.projects,
              impactMetrics: db.impactMetrics,
              appearance: db.appearance,
              updatedAt: db.updatedAt,
            }
          : db;

      const sha256 = (await computeBrowserSha256(exportData)) ?? "";
      const envelope: PortfolioBackupEnvelope = {
        schemaVersion: 2,
        scope,
        exportedAt: new Date().toISOString(),
        storageMode,
        sha256,
        data: exportData,
      };

      const fileName =
        scope === "content-only"
          ? `lou-portfolio-content-${dateStr}.json`
          : `lou-portfolio-full-archive-${dateStr}.json`;

      const blob = new Blob([JSON.stringify(envelope, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onFeedback(null);
      announceBrandPortalStatus({
        tone: "live",
        label: "Backup Exported",
        detail: fileName,
        durationMs: 3200,
      });
    } catch {
      onFeedback({
        type: "error",
        message: "Failed to generate JSON backup file.",
      });
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isNetworkOffline(isOnline)) {
      onFeedback({
        type: "error",
        message: "Offline — Reconnect to save changes",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    onFeedback(null);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as
        | Partial<PortfolioBackupEnvelope>
        | Partial<PortfolioDatabase>;

      const isEnvelope =
        parsed &&
        typeof parsed === "object" &&
        "schemaVersion" in parsed &&
        parsed.schemaVersion === 2 &&
        "data" in parsed &&
        parsed.data &&
        typeof parsed.data === "object";

      const candidate = (
        isEnvelope ? (parsed as PortfolioBackupEnvelope).data : parsed
      ) as Partial<PortfolioDatabase>;

      if (
        !candidate ||
        typeof candidate !== "object" ||
        !candidate.profile ||
        !Array.isArray(candidate.projects) ||
        !Array.isArray(candidate.skills)
      ) {
        throw new Error(
          "Invalid backup schema. Expected profile, projects, and skills sections."
        );
      }

      let integrityStatus: "verified" | "mismatch" | "legacy" = "legacy";
      if (isEnvelope) {
        const expectedSha = (parsed as PortfolioBackupEnvelope).sha256;
        if (expectedSha) {
          const actualSha = await computeBrowserSha256(candidate);
          if (!actualSha) {
            integrityStatus = "legacy";
          } else {
            integrityStatus =
              actualSha === expectedSha ? "verified" : "mismatch";
          }
        }
      }

      setPendingRestore({
        kind: "json",
        sourceLabel: file.name,
        integrityStatus,
        rawBackup: parsed,
        incomingCounts: {
          projects: candidate.projects.length,
          skills: candidate.skills.length,
          pillars: Array.isArray(candidate.pillars)
            ? candidate.pillars.length
            : 0,
          messages: Array.isArray(candidate.messages)
            ? candidate.messages.length
            : null,
          analytics: Array.isArray(candidate.analytics)
            ? candidate.analytics.length
            : null,
        },
      });
    } catch (err) {
      onFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not parse JSON backup file.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmRestore = async (sections: RestoreSectionFlags) => {
    if (!pendingRestore) return;
    setRestoring(true);
    announceBrandPortalStatus({
      tone: "saving",
      label: "Restoring...",
      detail: "Validating & publishing live",
      durationMs: 0,
    });

    try {
      const payload =
        pendingRestore.kind === "json"
          ? {
              action: "restore-json",
              rawBackup: pendingRestore.rawBackup,
              sections,
            }
          : {
              action: "restore-snapshot",
              snapshotId: pendingRestore.snapshotId,
              sections,
            };

      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.data) {
        throw new Error(json?.error || "Restore operation failed.");
      }

      await onDatabaseSync(json.data as PortfolioDatabase);
      await queryClient.invalidateQueries({ queryKey: ["admin-system-overview"] });
      setPendingRestore(null);

      onFeedback(null);
      announceBrandPortalStatus({
        tone: "live",
        label: "Restored & Live!",
        detail: "Pre-restore backup checkpoint saved",
        durationMs: 3600,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to restore backup.";
      setPendingRestore(null);
      onFeedback({ type: "error", message: msg });
      announceBrandPortalStatus({
        tone: "error",
        label: "Restore Failed",
        detail: msg,
      });
    } finally {
      setRestoring(false);
    }
  };

  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNetworkOffline(isOnline)) {
      onFeedback({
        type: "error",
        message: "Offline — Reconnect to save changes",
      });
      return;
    }
    setConfirmSnapshotOpen(true);
  };

  const executeCreateSnapshot = async () => {
    if (isNetworkOffline(isOnline)) {
      onFeedback({
        type: "error",
        message: "Offline — Reconnect to save changes",
      });
      setConfirmSnapshotOpen(false);
      return;
    }

    setCreatingSnapshot(true);
    onFeedback(null);
    try {
      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-snapshot",
          label:
            checkpointLabel.trim() ||
            `Checkpoint (${new Date().toLocaleDateString()})`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to create server checkpoint.");
      }
      setCheckpointLabel("");
      setConfirmSnapshotOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-system-overview"] });
      onFeedback(null);
      announceBrandPortalStatus({
        tone: "live",
        label: "Snapshot Saved",
        detail: `"${json.snapshot?.label || "Checkpoint"}" stored in vault`,
        durationMs: 3400,
      });
    } catch (err) {
      setConfirmSnapshotOpen(false);
      onFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not create server checkpoint.",
      });
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleDeleteSnapshot = async () => {
    if (!deletingSnapshot) return;
    setDeletingLoading(true);
    try {
      const res = await fetch(
        `/api/admin/system?snapshotId=${encodeURIComponent(deletingSnapshot.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error("Failed to remove checkpoint.");
      }
      setDeletingSnapshot(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-system-overview"] });
      onFeedback(null);
      announceBrandPortalStatus({
        tone: "synced",
        label: "Checkpoint Deleted",
        detail: "Removed from Server Snapshot Vault",
        durationMs: 3000,
      });
    } catch (err) {
      setDeletingSnapshot(null);
      onFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Could not delete checkpoint.",
      });
    } finally {
      setDeletingLoading(false);
    }
  };

  const health = systemQuery.data?.health;
  const footprints = systemQuery.data?.footprints;
  const snapshots = systemQuery.data?.snapshots || [];

  return (
    <div className="space-y-6">
      {/* 1. Storage Engine Health & Portability */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Engine Health & Data Portability"
          title="Database Health, Export & Selective Import"
          description="Verify live storage reachability, export sanitized content or complete archives with SHA-256 checksums, or selectively restore files."
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Backup checksum & restore safety"
                content="Exports bundle a SHA-256 integrity hash. Content-Only omits analytics logs & inbox messages; Full Archive exports every table. Selective Import saves a pre-restore checkpoint before writing."
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={systemQuery.isFetching}
                onClick={() => void systemQuery.refetch()}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    systemQuery.isFetching ? "animate-spin" : ""
                  }`}
                />
                <span>Probe Health</span>
              </Button>
            </div>
          }
        />

        {health?.warning && (
          <div className="p-3.5 rounded-sm bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{health.warning}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3.5 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-(--text-muted) block">
              Active Engine
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-(--text-primary) font-semibold">
                {storageMode === "supabase"
                  ? "Supabase PostgreSQL"
                  : "Local Hybrid JSON"}
              </span>
              <StatusPill
                label={
                  health?.status === "healthy"
                    ? "Healthy"
                    : health?.status === "degraded"
                      ? "Degraded"
                      : health?.status === "offline"
                        ? "Offline"
                        : "Ready"
                }
                variant={
                  health?.status === "degraded"
                    ? "warning"
                    : health?.status === "offline"
                      ? "danger"
                      : "success"
                }
                size="xs"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-(--text-muted) block">
              Probe Latency &amp; Payload
            </span>
            <div className="flex items-center gap-2 text-(--text-primary)">
              <Activity className="w-3.5 h-3.5 text-(--text-accent)" />
              <span>
                {health ? `${health.latencyMs} ms` : "—"} ·{" "}
                {footprints ? formatByteSize(footprints.totalBytes) : "—"}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-(--text-muted) block">
              Last Database Sync
            </span>
            <span
              suppressHydrationWarning
              className="text-(--text-primary) block truncate"
            >
              {new Date(db.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>

        {health && storageMode === "supabase" && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <StatusPill
              label={
                health.tables.analyticsEventsV2
                  ? "analytics_events v2"
                  : health.tables.analyticsEvents
                    ? "analytics_events (missing v2 cols)"
                    : "analytics_events missing"
              }
              variant={
                health.tables.analyticsEventsV2
                  ? "success"
                  : health.tables.analyticsEvents
                    ? "warning"
                    : "danger"
              }
              size="xs"
            />
            <StatusPill
              label={
                health.tables.contactMessagesV2
                  ? "contact_messages v2"
                  : health.tables.contactMessages
                    ? "contact_messages (missing v2 cols)"
                    : "contact_messages missing"
              }
              variant={
                health.tables.contactMessagesV2
                  ? "success"
                  : health.tables.contactMessages
                    ? "warning"
                    : "danger"
              }
              size="xs"
            />
            <StatusPill
              label={
                health.storage.exists
                  ? `Bucket ${health.storage.bucket} (${health.storage.isPublic ? "Public" : "Private"})`
                  : `Bucket ${health.storage.bucket} missing`
              }
              variant={
                health.storage.exists && health.storage.isPublic
                  ? "success"
                  : "warning"
              }
              size="xs"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-(--border-subtle)">
          <Button
            type="button"
            onClick={() => void handleExportJson("content-only")}
            variant="primary"
            size="sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Content Only (.json)</span>
          </Button>

          <Button
            type="button"
            onClick={() => void handleExportJson("full")}
            variant="secondary"
            size="sm"
          >
            <HardDrive className="w-3.5 h-3.5 text-(--text-accent)" />
            <span>Export Full Archive</span>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportJson}
            className="hidden"
          />

          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
            variant="secondary"
            size="sm"
          >
            {restoring ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-(--text-accent)" />
            )}
            <span>Import &amp; Selective Restore</span>
          </Button>
        </div>
      </div>

      {/* 2. Server Snapshot Vault (Rolling 10 Checkpoints) */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Rollback Protection"
          title="Server Snapshot Vault"
          description="Maintains up to 10 rolling server checkpoints (auto-saved before resets & restores, or created manually)."
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Server Snapshot Vault rotation"
                content="Stores up to 10 rolling full-state server backups with SHA-256 checksums. Oldest manual snapshots rotate automatically when full."
              />
              <History className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        <form
          onSubmit={handleCreateSnapshot}
          className="flex flex-col sm:flex-row sm:items-end gap-3"
        >
          <div className="flex-1 min-w-0">
            <TextField
              id="snapshot-checkpoint-label"
              label="Checkpoint Label"
              value={checkpointLabel}
              onChange={(val) => setCheckpointLabel(val.slice(0, 80))}
              placeholder="e.g., Before Q4 Portfolio Redesign"
              required={false}
              minLength={0}
              maxLength={80}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={creatingSnapshot || !isOnline}
            className="sm:mb-0.5 shrink-0"
          >
            {creatingSnapshot ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BookmarkPlus className="w-3.5 h-3.5" />
            )}
            <span>Create Checkpoint</span>
          </Button>
        </form>

        {snapshots.length === 0 ? (
          <div className="p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) text-xs font-mono text-(--text-muted)">
            No checkpoints in vault yet. Click &ldquo;Create Checkpoint&rdquo; above or run a Factory Reset / JSON Restore to save your first recovery point.
          </div>
        ) : (
          <div className="space-y-2.5">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="p-3.5 sm:p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-(--text-primary) truncate">
                      {snap.label}
                    </span>
                    <StatusPill
                      label={
                        snap.trigger === "pre-reset"
                          ? "Pre-Reset"
                          : snap.trigger === "pre-restore"
                            ? "Pre-Restore"
                            : "Manual"
                      }
                      variant={
                        snap.trigger === "manual" ? "accent" : "warning"
                      }
                      size="xs"
                    />
                    <StatusPill
                      label={formatByteSize(snap.sizeBytes)}
                      variant="neutral"
                      size="xs"
                    />
                  </div>
                  <p className="text-[11px] font-mono text-(--text-muted)">
                    <span suppressHydrationWarning>
                      {new Date(snap.createdAt).toLocaleString()}
                    </span>{" "}
                    · {snap.counts.projects} projects · {snap.counts.skills}{" "}
                    skills · {snap.counts.messages} msgs · SHA{" "}
                    {snap.sha256.slice(0, 8)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setPendingRestore({
                        kind: "snapshot",
                        snapshotId: snap.id,
                        sourceLabel: snap.label,
                        integrityStatus: "verified",
                        incomingCounts: {
                          projects: snap.counts.projects,
                          skills: snap.counts.skills,
                          pillars: snap.counts.pillars,
                          messages: snap.counts.messages,
                          analytics: snap.counts.analytics,
                        },
                      })
                    }
                  >
                    <RotateCcw className="w-3 h-3 text-(--text-accent)" />
                    <span>Restore</span>
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      window.open(
                        `/api/admin/system?downloadSnapshot=${encodeURIComponent(
                          snap.id
                        )}`,
                        "_blank"
                      );
                    }}
                    aria-label={`Download ${snap.label} JSON`}
                  >
                    <Download className="w-3 h-3" />
                    <span>JSON</span>
                  </Button>

                  <IconActionButton
                    intent="danger"
                    size="compact"
                    onClick={() => setDeletingSnapshot(snap)}
                    label={`Delete ${snap.label}`}
                    icon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Real Payload Byte Breakdown */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Schema Footprint"
          title="Indexed Records & Byte Distribution"
          description="Actual UTF-8 JSON storage distribution across each portfolio table domain."
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="UTF-8 payload telemetry"
                content="Calculates serialized UTF-8 byte sizes per table domain so you can spot oversized image base64 strings or unbounded telemetry growth."
              />
              <Database className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
          {(footprints?.sections || []).map((section, idx) => (
            <div
              key={section.key}
              className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-sm p-3 sm:p-4 space-y-2 sm:space-y-2.5"
            >
              <TruncatedText
                text={section.label}
                className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted) block"
              />
              <div className="font-display text-3xl text-(--text-primary)">
                <AnimatedCounter
                  value={section.records}
                  durationMs={850 + idx * 80}
                />
              </div>
              <AnimatedBar
                percentage={section.percentage}
                delayMs={120 + idx * 70}
                heightClassName="h-1.5"
              />
              <span className="text-[10px] font-mono text-(--text-muted) block">
                {formatByteSize(section.bytes)} ({section.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {pendingRestore && (
        <BackupRestoreModal
          open={Boolean(pendingRestore)}
          sourceLabel={pendingRestore.sourceLabel}
          integrityStatus={pendingRestore.integrityStatus}
          incomingCounts={pendingRestore.incomingCounts}
          currentCounts={currentCounts}
          restoring={restoring}
          onCancel={() => {
            if (!restoring) setPendingRestore(null);
          }}
          onConfirm={handleConfirmRestore}
        />
      )}

      <ConfirmModal
        open={confirmSnapshotOpen}
        variant="primary"
        title="Save Server Snapshot Checkpoint?"
        description={`Store a verified full-database checkpoint labeled "${
          checkpointLabel.trim() ||
          `Checkpoint (${new Date().toLocaleDateString()})`
        }" into your rolling Server Snapshot Vault?`}
        confirmLabel="Save Checkpoint"
        loading={creatingSnapshot}
        onCancel={() => {
          if (!creatingSnapshot) setConfirmSnapshotOpen(false);
        }}
        onConfirm={() => void executeCreateSnapshot()}
      />

      <ConfirmModal
        open={Boolean(deletingSnapshot)}
        variant="danger"
        title="Delete Server Checkpoint?"
        description={
          deletingSnapshot
            ? `Permanently delete snapshot "${deletingSnapshot.label}" created ${new Date(
                deletingSnapshot.createdAt
              ).toLocaleString()} from the Server Snapshot Vault?`
            : ""
        }
        confirmLabel="Delete Checkpoint"
        loading={deletingLoading}
        onCancel={() => {
          if (!deletingLoading) setDeletingSnapshot(null);
        }}
        onConfirm={handleDeleteSnapshot}
      />
    </div>
  );
}
