"use client";

import { useEffect, useState } from "react";
import {
  CheckSquare,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import type { RestoreSectionFlags } from "@/lib/validation";

export interface BackupSectionCounts {
  projects: number;
  skills: number;
  pillars: number;
  messages: number | null;
  analytics: number | null;
}

export interface BackupRestoreModalProps {
  open: boolean;
  sourceLabel: string;
  integrityStatus: "verified" | "mismatch" | "legacy";
  incomingCounts: BackupSectionCounts;
  currentCounts: BackupSectionCounts;
  restoring: boolean;
  onCancel: () => void;
  onConfirm: (sections: RestoreSectionFlags) => Promise<void>;
}

interface SectionOptionMeta {
  key: keyof RestoreSectionFlags;
  label: string;
  detail: (incoming: BackupSectionCounts, current: BackupSectionCounts) => string;
  isAvailable: (incoming: BackupSectionCounts) => boolean;
}

const SECTION_OPTIONS: readonly SectionOptionMeta[] = [
  {
    key: "profile",
    label: "Profile & Contact Identity",
    detail: () => "Name, bio, headline, roles, avatar, monogram & CV link",
    isAvailable: () => true,
  },
  {
    key: "narrative",
    label: "Section Headers, Story & Marquee",
    detail: (inc, cur) =>
      `${inc.pillars} pillars (live: ${cur.pillars}) + marquee & headers`,
    isAvailable: () => true,
  },
  {
    key: "skills",
    label: "Skills Architecture & Impact KPIs",
    detail: (inc, cur) => `${inc.skills} skill groups (live: ${cur.skills})`,
    isAvailable: () => true,
  },
  {
    key: "projects",
    label: "Selected Systems & Projects",
    detail: (inc, cur) => `${inc.projects} projects (live: ${cur.projects})`,
    isAvailable: () => true,
  },
  {
    key: "appearance",
    label: "Appearance, Theme & Motion",
    detail: () => "Theme default, accent palette, typography & motion rules",
    isAvailable: () => true,
  },
  {
    key: "messages",
    label: "Inbox Contact Messages",
    detail: (inc, cur) =>
      inc.messages === null
        ? "Not included in Content-Only backup"
        : `${inc.messages} inquiries (live: ${cur.messages ?? 0})`,
    isAvailable: (inc) => inc.messages !== null,
  },
  {
    key: "analytics",
    label: "Analytics Telemetry Events",
    detail: (inc, cur) =>
      inc.analytics === null
        ? "Not included in Content-Only backup"
        : `${inc.analytics} events (live: ${cur.analytics ?? 0})`,
    isAvailable: (inc) => inc.analytics !== null,
  },
];

/**
 * Interactive selective-restore modal with SHA-256 verification status and section checkboxes.
 */
export function BackupRestoreModal({
  open,
  sourceLabel,
  integrityStatus,
  incomingCounts,
  currentCounts,
  restoring,
  onCancel,
  onConfirm,
}: BackupRestoreModalProps) {
  const [sections, setSections] = useState<RestoreSectionFlags>({
    profile: true,
    narrative: true,
    skills: true,
    projects: true,
    appearance: true,
    messages: false,
    analytics: false,
  });

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      setSections({
        profile: true,
        narrative: true,
        skills: true,
        projects: true,
        appearance: true,
        messages: false,
        analytics: false,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, sourceLabel]);

  const toggleSection = (key: keyof RestoreSectionFlags, available: boolean) => {
    if (!available || restoring) return;
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const anySelected = Object.values(sections).some(Boolean);
  const canConfirm =
    anySelected && integrityStatus !== "mismatch" && !restoring;

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      closeDisabled={restoring}
      ariaLabelledBy="backup-restore-title"
      maxWidthClassName="max-w-xl"
    >
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-(--border-subtle) flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-(--text-accent) block">
              Selective Snapshot Restore
            </span>
            <h3
              id="backup-restore-title"
              className="font-display text-xl sm:text-2xl uppercase tracking-tight text-(--text-primary) mt-0.5"
            >
              Review Restore Scope
            </h3>
            <p className="text-xs font-mono text-(--text-muted) mt-1 truncate max-w-md">
              Source: {sourceLabel}
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            shape="pill"
            disabled={restoring}
            onClick={onCancel}
            aria-label="Close restore preview"
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0 lou-scrollarea">
          {/* Integrity & Rollback Guarantee */}
          <div className="p-3.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2 text-xs font-mono">
              {integrityStatus === "verified" ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-(--text-primary)">
                    SHA-256 checksum matches backup payload
                  </span>
                </>
              ) : integrityStatus === "mismatch" ? (
                <>
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-rose-400">
                    SHA-256 mismatch — file may be modified or corrupted
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-(--text-secondary)">
                    Schema-checked on server prior to applying
                  </span>
                </>
              )}
            </div>
            <StatusPill
              label={
                integrityStatus === "verified"
                  ? "Verified v2"
                  : integrityStatus === "mismatch"
                    ? "Tampered"
                    : "Legacy Format"
              }
              variant={
                integrityStatus === "verified"
                  ? "success"
                  : integrityStatus === "mismatch"
                    ? "danger"
                    : "warning"
              }
              size="xs"
            />
          </div>

          {/* Checkboxes per Domain */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Choose Sections to Overwrite
            </span>

            <div className="grid grid-cols-1 gap-2">
              {SECTION_OPTIONS.map((opt) => {
                const available = opt.isAvailable(incomingCounts);
                const checked = available && sections[opt.key];

                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={!available || restoring}
                    onClick={() => toggleSection(opt.key, available)}
                    className={`w-full text-left p-3 rounded-(--radius-control) border flex items-center justify-between gap-3 transition-colors ${
                      !available
                        ? "bg-(--bg-surface-2)/50 border-(--border-subtle) opacity-55 cursor-not-allowed"
                        : checked
                          ? "bg-(--bg-badge-highlight)/35 border-brand/45 cursor-pointer"
                          : "bg-(--bg-surface-2) border-(--border-subtle) hover:border-(--border-strong) cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-(--text-accent) shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-4 h-4 text-(--text-muted) shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-(--text-primary)">
                          {opt.label}
                        </p>
                        <p className="text-[11px] font-mono text-(--text-muted) truncate mt-0.5">
                          {opt.detail(incomingCounts, currentCounts)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-(--text-muted)">
            Safety guarantee: Your current live database is automatically saved to the Server Snapshot Vault right before this restore executes.
          </p>
        </div>

        <div className="px-4 sm:px-6 py-3.5 bg-(--bg-surface-2) flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-2.5 border-t border-(--border-subtle) shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={restoring}
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canConfirm}
            onClick={() => void onConfirm(sections)}
            className="w-full sm:w-auto"
          >
            {restoring && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            <span>Publish Selected Sections Live</span>
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

