"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

export type BrandPortalTone =
  | "synced"
  | "live"
  | "draft"
  | "saving"
  | "offline"
  | "error";

export interface BrandPortalNotice {
  id: number;
  tone: BrandPortalTone;
  label: string;
  detail?: string;
  /**
   * 0 keeps the pill open until another notice replaces it or it is dismissed.
   * Positive values auto-collapse cleanly after durationMs.
   */
  durationMs: number;
}

export interface BrandPortalWorkspaceState {
  moduleId: string | null;
  moduleLabel: string;
  hasUnsavedChanges: boolean;
  saving: boolean;
}

export interface BrandPortalMetaState {
  lastPublishedAt: string | null;
  storageMode: "local-json" | "supabase" | null;
}

export interface BrandPortalSnapshot {
  workspace: BrandPortalWorkspaceState;
  meta: BrandPortalMetaState;
  notice: BrandPortalNotice | null;
}

export interface BrandPortalToneTheme {
  capsuleBorderClass: string;
  dotBgClass: string;
  textClass: string;
  iconClass: string;
  haloColor: string;
  haloGlow: string;
  shouldPulseDot: boolean;
}

const DEFAULT_WORKSPACE: BrandPortalWorkspaceState = {
  moduleId: null,
  moduleLabel: "",
  hasUnsavedChanges: false,
  saving: false,
};

const DEFAULT_META: BrandPortalMetaState = {
  lastPublishedAt: null,
  storageMode: null,
};

const SERVER_SNAPSHOT: BrandPortalSnapshot = {
  workspace: DEFAULT_WORKSPACE,
  meta: DEFAULT_META,
  notice: null,
};

let currentSnapshot: BrandPortalSnapshot = SERVER_SNAPSHOT;
let nextNoticeId = 1;
const listeners = new Set<() => void>();

function emitSnapshot(next: BrandPortalSnapshot) {
  currentSnapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribeBrandPortalStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getBrandPortalSnapshot(): BrandPortalSnapshot {
  return currentSnapshot;
}

export const DEVICE_STORAGE_KEY = "lou_registered_device";
export const DEVICE_SYNC_EVENT = "lou-device-change";

function getBrandPortalServerSnapshot(): BrandPortalSnapshot {
  return SERVER_SNAPSHOT;
}

/**
 * Push a transient (or sticky if durationMs === 0) Dynamic-Island status notice
 * to the bottom-left Brand Portal orb from any page or admin module.
 */
export function announceBrandPortalStatus(input: {
  tone: BrandPortalTone;
  label: string;
  detail?: string;
  durationMs?: number;
}): number {
  const id = nextNoticeId++;
  const durationMs =
    input.durationMs !== undefined
      ? input.durationMs
      : input.tone === "saving"
      ? 0
      : input.tone === "error"
      ? 4500
      : 3200;

  emitSnapshot({
    ...currentSnapshot,
    notice: {
      id,
      tone: input.tone,
      label: input.label,
      detail: input.detail,
      durationMs,
    },
  });

  return id;
}

export function dismissBrandPortalNotice(noticeId?: number): void {
  if (!currentSnapshot.notice) return;
  if (noticeId !== undefined && currentSnapshot.notice.id !== noticeId) {
    return;
  }
  emitSnapshot({
    ...currentSnapshot,
    notice: null,
  });
}

function setBrandPortalWorkspace(
  workspace: BrandPortalWorkspaceState
): void {
  const prev = currentSnapshot.workspace;
  if (
    prev.moduleId === workspace.moduleId &&
    prev.moduleLabel === workspace.moduleLabel &&
    prev.hasUnsavedChanges === workspace.hasUnsavedChanges &&
    prev.saving === workspace.saving
  ) {
    return;
  }

  emitSnapshot({
    ...currentSnapshot,
    workspace,
  });
}

function clearBrandPortalWorkspace(moduleId: string): void {
  if (currentSnapshot.workspace.moduleId !== moduleId) return;
  emitSnapshot({
    ...currentSnapshot,
    workspace: DEFAULT_WORKSPACE,
  });
}

export function setBrandPortalMeta(meta: Partial<BrandPortalMetaState>): void {
  const nextMeta: BrandPortalMetaState = {
    lastPublishedAt:
      meta.lastPublishedAt !== undefined
        ? meta.lastPublishedAt
        : currentSnapshot.meta.lastPublishedAt,
    storageMode:
      meta.storageMode !== undefined
        ? meta.storageMode
        : currentSnapshot.meta.storageMode,
  };

  if (
    nextMeta.lastPublishedAt === currentSnapshot.meta.lastPublishedAt &&
    nextMeta.storageMode === currentSnapshot.meta.storageMode
  ) {
    return;
  }

  emitSnapshot({
    ...currentSnapshot,
    meta: nextMeta,
  });
}

export function useBrandPortalStatus(): BrandPortalSnapshot {
  return useSyncExternalStore(
    subscribeBrandPortalStatus,
    getBrandPortalSnapshot,
    getBrandPortalServerSnapshot
  );
}

/**
 * Synchronizes an active admin manager's draft / saving state with the Brand Portal
 * orb, automatically announcing transitions into "Unsaved Draft" or "Publishing..."
 * and resetting cleanly when switching away from the module.
 */
export function useBrandPortalWorkspaceSync({
  moduleId,
  moduleLabel,
  hasUnsavedChanges,
  saving,
}: {
  moduleId: string;
  moduleLabel: string;
  hasUnsavedChanges: boolean;
  saving: boolean;
}) {
  const prevDirtyRef = useRef(hasUnsavedChanges);
  const prevSavingRef = useRef(saving);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setBrandPortalWorkspace({
        moduleId,
        moduleLabel,
        hasUnsavedChanges,
        saving,
      });

      if (!prevSavingRef.current && saving) {
        if (currentSnapshot.notice?.tone !== "saving") {
          announceBrandPortalStatus({
            tone: "saving",
            label: "Publishing...",
            detail: `Syncing ${moduleLabel} live`,
            durationMs: 0,
          });
        }
      } else if (!prevDirtyRef.current && hasUnsavedChanges && !saving) {
        if (currentSnapshot.notice?.tone !== "draft") {
          announceBrandPortalStatus({
            tone: "draft",
            label: "Unsaved Draft",
            detail: `${moduleLabel} · Save & Publish to go live`,
            durationMs: 2600,
          });
        }
      }

      prevDirtyRef.current = hasUnsavedChanges;
      prevSavingRef.current = saving;
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [moduleId, moduleLabel, hasUnsavedChanges, saving]);

  useEffect(() => {
    return () => {
      clearBrandPortalWorkspace(moduleId);
    };
  }, [moduleId]);
}

export function formatPortalTimestamp(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getBrandPortalToneTheme(
  tone: BrandPortalTone
): BrandPortalToneTheme {
  switch (tone) {
    case "live":
    case "synced":
      return {
        capsuleBorderClass: "border-emerald-500/45 hover:border-emerald-400/75",
        dotBgClass: "bg-emerald-400",
        textClass: "text-(--text-success)",
        iconClass: "text-(--text-success)",
        haloColor: "rgba(52, 211, 153, 0.78)",
        haloGlow: "0 0 24px rgba(52, 211, 153, 0.45)",
        shouldPulseDot: tone === "live",
      };
    case "draft":
    case "offline":
      return {
        capsuleBorderClass: "border-amber-500/50 hover:border-amber-400/80",
        dotBgClass: "bg-amber-400",
        textClass: "text-amber-500",
        iconClass: "text-amber-500",
        haloColor: "rgba(245, 158, 11, 0.8)",
        haloGlow: "0 0 24px rgba(245, 158, 11, 0.42)",
        shouldPulseDot: true,
      };
    case "saving":
      return {
        capsuleBorderClass: "border-brand/65",
        dotBgClass: "bg-brand",
        textClass: "text-(--text-accent)",
        iconClass: "text-(--text-accent)",
        haloColor: "var(--accent)",
        haloGlow: "0 0 28px var(--accent-glow)",
        shouldPulseDot: true,
      };
    case "error":
      return {
        capsuleBorderClass: "border-rose-500/60 hover:border-rose-400",
        dotBgClass: "bg-rose-500",
        textClass: "text-rose-500",
        iconClass: "text-rose-500",
        haloColor: "rgba(244, 63, 94, 0.85)",
        haloGlow: "0 0 26px rgba(244, 63, 94, 0.46)",
        shouldPulseDot: true,
      };
  }
}
