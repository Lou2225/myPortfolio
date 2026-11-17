"use client";

import { Activity, ShieldAlert, ShieldCheck, Info } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { StatusPill } from "@/components/ui/StatusPill";
import type { SecurityAuditEvent } from "@/types/security";

export interface SecurityAuditFeedProps {
  events: SecurityAuditEvent[];
}

const ACTION_LABELS: Record<SecurityAuditEvent["action"], string> = {
  login_success: "Sign In",
  login_failed: "Failed Password",
  login_blocked: "Blocked Attempt",
  device_registered: "Device Trusted",
  device_updated: "Device Updated",
  device_qr_paired: "QR Paired",
  device_revoked: "Device Revoked",
  password_changed: "Password Updated",
  sessions_revoked: "Sessions Rotated",
  stealth_toggled: "Stealth Gate",
  stealth_unlock: "Stealth Bypass",
  totp_updated: "Authenticator 2FA",
};

/**
 * Scrollable audit trail displaying sign-in attempts, QR pairings,
 * remote device revocations, and stealth gate events.
 */
export function SecurityAuditFeed({ events }: SecurityAuditFeedProps) {
  return (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-5 sm:p-6 space-y-4"
    >
      <SectionHeader
        eyebrow="Telemetry & Forensics"
        title="Security Activity Log"
        description="Server-recorded sign-ins, rate-limit blocks, QR pairings, password rotations, and device revocations."
        size="sm"
        rightSlot={
          <StatusPill
            label={`${events.length} Events`}
            variant="neutral"
            size="xs"
          />
        }
      />

      {events.length === 0 ? (
        <div className="p-6 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) text-center space-y-1.5">
          <Activity className="w-5 h-5 text-(--text-muted) mx-auto" />
          <p className="text-xs font-medium text-(--text-secondary)">
            No security events recorded yet.
          </p>
          <p className="text-[11px] text-(--text-muted)">
            Device registrations, QR pairings, and session changes appear here automatically.
          </p>
        </div>
      ) : (
        <ScrollArea maxHeight={320} fadeEdges className="rounded-sm border border-(--border-subtle) bg-(--bg-surface-2)">
          <div className="divide-y divide-(--border-subtle)">
            {events.map((evt) => {
              const Icon =
                evt.outcome === "blocked"
                  ? ShieldAlert
                  : evt.outcome === "success"
                    ? ShieldCheck
                    : Info;

              const pillVariant =
                evt.outcome === "blocked"
                  ? "danger"
                  : evt.outcome === "success"
                    ? "success"
                    : "neutral";

              return (
                <div
                  key={evt.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        evt.outcome === "blocked"
                          ? "text-rose-400"
                          : evt.outcome === "success"
                            ? "text-emerald-400"
                            : "text-(--text-muted)"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          label={ACTION_LABELS[evt.action] || evt.action}
                          variant={pillVariant}
                          size="xs"
                        />
                        <span className="font-semibold text-(--text-primary) truncate">
                          {evt.deviceLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-(--text-muted) mt-1">
                        {evt.detail}
                      </p>
                    </div>
                  </div>

                  <div className="text-left sm:text-right font-mono text-[10px] text-(--text-muted) shrink-0 pl-6 sm:pl-0">
                    <div>{evt.ipMasked}</div>
                    <div suppressHydrationWarning>
                      {new Date(evt.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

