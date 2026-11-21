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
  saveLabel: string;
  validationErrorCount: number;
  canSave: boolean;
  canDiscard: boolean;
  hasFollowIssue: boolean;
}

export interface BrandPortalWorkspaceActions {
  onSave?: () => void;
  onDiscard?: () => void;
  onFollowIssue?: () => void;
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
  saveLabel: "Save & Publish",
  validationErrorCount: 0,
  canSave: false,
  canDiscard: false,
  hasFollowIssue: false,
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

/**
 * Active module command handlers kept outside snapshot equality checks
 * so callback identity updates never cause extra re-renders in BrandPortalOrb.
 */
let activeWorkspaceActions: {
  moduleId: string | null;
  actions: BrandPortalWorkspaceActions;
} = {
  moduleId: null,
  actions: {},
};

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
export const PRELOADER_ARM_EVENT = "lou-preloader-arm";
export const PRELOADER_START_EVENT = "lou-preloader-start";

let workspaceBootReady = false;

export function isWorkspaceBootReady(): boolean {
  return workspaceBootReady;
}

export function markWorkspaceBootReady(): void {
  workspaceBootReady = true;
}

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

export function setBrandPortalWorkspace(
  workspace: BrandPortalWorkspaceState,
  actions?: BrandPortalWorkspaceActions
): void {
  if (actions !== undefined) {
    activeWorkspaceActions = {
      moduleId: workspace.moduleId,
      actions,
    };
  }

  const prev = currentSnapshot.workspace;
  if (
    prev.moduleId === workspace.moduleId &&
    prev.moduleLabel === workspace.moduleLabel &&
    prev.hasUnsavedChanges === workspace.hasUnsavedChanges &&
    prev.saving === workspace.saving &&
    prev.saveLabel === workspace.saveLabel &&
    prev.validationErrorCount === workspace.validationErrorCount &&
    prev.canSave === workspace.canSave &&
    prev.canDiscard === workspace.canDiscard &&
    prev.hasFollowIssue === workspace.hasFollowIssue
  ) {
    return;
  }

  emitSnapshot({
    ...currentSnapshot,
    workspace,
  });
}

export function clearBrandPortalWorkspace(moduleId: string): void {
  if (activeWorkspaceActions.moduleId === moduleId) {
    activeWorkspaceActions = { moduleId: null, actions: {} };
  }
  if (currentSnapshot.workspace.moduleId !== moduleId) return;
  emitSnapshot({
    ...currentSnapshot,
    workspace: DEFAULT_WORKSPACE,
  });
}

/**
 * Triggers the active `/admin` module's Save / Publish / Update handler registered in Brand Portal.
 */
export function triggerBrandPortalSave(): boolean {
  const { workspace } = currentSnapshot;
  if (
    !workspace.moduleId ||
    workspace.saving ||
    !workspace.canSave ||
    activeWorkspaceActions.moduleId !== workspace.moduleId ||
    !activeWorkspaceActions.actions.onSave
  ) {
    return false;
  }
  activeWorkspaceActions.actions.onSave();
  return true;
}

/**
 * Triggers the active `/admin` module's Discard handler registered in Brand Portal.
 */
export function triggerBrandPortalDiscard(): boolean {
  const { workspace } = currentSnapshot;
  if (
    !workspace.moduleId ||
    workspace.saving ||
    !workspace.canDiscard ||
    activeWorkspaceActions.moduleId !== workspace.moduleId ||
    !activeWorkspaceActions.actions.onDiscard
  ) {
    return false;
  }
  activeWorkspaceActions.actions.onDiscard();
  return true;
}

/**
 * Triggers the active `/admin` module's Follow Validation Issue jump handler registered in Brand Portal.
 */
export function triggerBrandPortalFollowIssue(): boolean {
  const { workspace } = currentSnapshot;
  if (
    !workspace.moduleId ||
    activeWorkspaceActions.moduleId !== workspace.moduleId ||
    !activeWorkspaceActions.actions.onFollowIssue
  ) {
    return false;
  }
  activeWorkspaceActions.actions.onFollowIssue();
  return true;
}

/**
 * Returns whether the currently mounted `/admin` module holds unsaved draft edits.
 */
export function getActiveBrandPortalDraft(): {
  hasUnsavedChanges: boolean;
  moduleLabel: string;
} {
  return {
    hasUnsavedChanges: currentSnapshot.workspace.hasUnsavedChanges,
    moduleLabel: currentSnapshot.workspace.moduleLabel,
  };
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
 * Synchronizes an active `/admin` module's draft state, validation issue counter,
 * and Save / Discard / Follow Issue command handlers directly into the floating
 * Brand Portal Dynamic Island capsule.
 */
export function useBrandPortalWorkspaceSync({
  moduleId,
  moduleLabel,
  hasUnsavedChanges,
  saving,
  saveLabel = "Save & Publish",
  validationErrorCount = 0,
  canSave,
  canDiscard,
  onSave,
  onDiscard,
  onFollowIssue,
}: {
  moduleId: string;
  moduleLabel: string;
  hasUnsavedChanges: boolean;
  saving: boolean;
  saveLabel?: string;
  validationErrorCount?: number;
  canSave?: boolean;
  canDiscard?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  onFollowIssue?: () => void;
}) {
  const prevSavingRef = useRef(saving);
  const actionsRef = useRef<BrandPortalWorkspaceActions>({
    onSave,
    onDiscard,
    onFollowIssue,
  });

  useEffect(() => {
    actionsRef.current = { onSave, onDiscard, onFollowIssue };
    if (activeWorkspaceActions.moduleId === moduleId) {
      activeWorkspaceActions = {
        moduleId,
        actions: {
          onSave: onSave ? () => actionsRef.current.onSave?.() : undefined,
          onDiscard: onDiscard
            ? () => actionsRef.current.onDiscard?.()
            : undefined,
          onFollowIssue: onFollowIssue
            ? () => actionsRef.current.onFollowIssue?.()
            : undefined,
        },
      };
    }
  }, [moduleId, onSave, onDiscard, onFollowIssue]);

  const resolvedCanSave =
    canSave !== undefined ? canSave : Boolean(onSave) && hasUnsavedChanges;
  const resolvedCanDiscard =
    canDiscard !== undefined
      ? canDiscard
      : Boolean(onDiscard) && hasUnsavedChanges;
  const hasFollowIssue = Boolean(onFollowIssue) && validationErrorCount > 0;

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setBrandPortalWorkspace(
        {
          moduleId,
          moduleLabel,
          hasUnsavedChanges,
          saving,
          saveLabel,
          validationErrorCount,
          canSave: resolvedCanSave,
          canDiscard: resolvedCanDiscard,
          hasFollowIssue,
        },
        {
          onSave: onSave ? () => actionsRef.current.onSave?.() : undefined,
          onDiscard: onDiscard
            ? () => actionsRef.current.onDiscard?.()
            : undefined,
          onFollowIssue: onFollowIssue
            ? () => actionsRef.current.onFollowIssue?.()
            : undefined,
        }
      );

      if (!prevSavingRef.current && saving) {
        if (currentSnapshot.notice?.tone !== "saving") {
          announceBrandPortalStatus({
            tone: "saving",
            label: "Publishing...",
            detail: `Syncing ${moduleLabel} live`,
            durationMs: 0,
          });
        }
      }

      prevSavingRef.current = saving;
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    moduleId,
    moduleLabel,
    hasUnsavedChanges,
    saving,
    saveLabel,
    validationErrorCount,
    resolvedCanSave,
    resolvedCanDiscard,
    hasFollowIssue,
    onSave,
    onDiscard,
    onFollowIssue,
  ]);

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
