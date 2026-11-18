"use client";

import { Activity, ShieldAlert, ShieldCheck, Info } from "lucide-react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { InfoTooltip } from "@/components/ui/Tooltip";
import type { SecurityAuditEvent } from "@/types/security";

export interface SecurityAuditFeedProps {
  events: SecurityAuditEvent[];
}

/**
 * Scrollable audit trail displaying sign-in attempts, QR pairings,
 * remote device revocations, and stealth gate events.
 */
export function SecurityAuditFeed({ events }: SecurityAuditFeedProps) {
  return (
    <div
      data-cascade
      className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 min-w-0"
    >
      <SectionHeader
        eyebrow="Telemetry & Forensics"
        title="Security Activity Log"
        description="Server-recorded sign-ins, rate-limit blocks, QR pairings, password rotations, and device revocations."
        size="sm"
        tooltip={
          <InfoTooltip
            label="Security forensics audit log"
            content="Server-recorded ledger capturing successful logins, rate-limit blocks, QR pairings, password rotations, and remote session revocations."
          />
        }
        rightSlot={
          <StatusPill
            label={`${events.length} Events`}
            variant="neutral"
            size="xs"
          />
        }
      />

      {events.length === 0 ? (
        <div className="p-6 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) text-center space-y-1.5">
          <Activity className="w-5 h-5 text-(--text-muted) mx-auto" />
          <p className="text-xs font-medium text-(--text-secondary)">
            No security events recorded yet.
          </p>
          <p className="text-[11px] text-(--text-muted)">
            Device registrations, QR pairings, and session changes appear here automatically.
          </p>
        </div>
      ) : (
        <ScrollArea maxHeight={340} fadeEdges className="rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface-2)">
          <div className="divide-y divide-(--border-subtle)">
            {events.map((evt) => {
              const Icon =
                evt.outcome === "blocked"
                  ? ShieldAlert
                  : evt.outcome === "success"
                    ? ShieldCheck
                    : Info;

              const detailHighlightClass =
                evt.outcome === "blocked"
                  ? "text-rose-500 font-medium"
                  : evt.outcome === "success"
                    ? "text-(--text-success) font-medium"
                    : "text-(--text-accent) font-medium";

              return (
                <div
                  key={evt.id}
                  className="px-3.5 py-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        evt.outcome === "blocked"
                          ? "text-rose-500"
                          : evt.outcome === "success"
                            ? "text-(--text-success)"
                            : "text-(--text-accent)"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-(--text-primary) truncate">
                        {evt.deviceLabel}
                      </p>
                      <p
                        className={`text-[11px] mt-0.5 leading-relaxed wrap-break-word ${detailHighlightClass}`}
                      >
                        {evt.detail}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:block sm:text-right font-mono text-[10px] text-(--text-muted) shrink-0 pl-6.5 sm:pl-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-(--border-subtle)/50">
                    <span>{evt.ipMasked}</span>
                    <span suppressHydrationWarning className="sm:block">
                      {new Date(evt.createdAt).toLocaleString()}
                    </span>
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

