"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { OtpCodeField, TextField } from "@/components/ui/fields";
import { collectClientDeviceTelemetry } from "@/lib/deviceTelemetry";
import { sanitizeDeviceLabel } from "@/lib/validation";
import { DEVICE_STORAGE_KEY, DEVICE_SYNC_EVENT } from "@/components/admin/AdminLogin";
import type { ClientDeviceTelemetry } from "@/types/security";

interface ChallengeCheckState {
  status:
    | "manual_entry"
    | "loading"
    | "pending"
    | "awaiting_approval"
    | "approved"
    | "completed"
    | "expired"
    | "burned"
    | "cancelled"
    | "missing";
  remainingSec: number;
  attemptsRemaining: number;
  grantAdminSession: boolean;
  error?: string;
}

export interface DevicePairClientProps {
  challengeId: string | null;
}

function extractChallengeIdFromInput(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (/^[a-f0-9-]{16,128}$/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const param = parsed.searchParams.get("challenge")?.trim();
    if (param && /^[a-f0-9-]{16,128}$/i.test(param)) {
      return param;
    }
  } catch {
    const match = trimmed.match(/[?&]challenge=([a-f0-9-]{16,128})/i);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export function DevicePairClient({ challengeId }: DevicePairClientProps) {
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(
    challengeId
  );
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<ClientDeviceTelemetry | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [code, setCode] = useState("");
  const [forceTouched, setForceTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [completedAuth, setCompletedAuth] = useState(false);

  const [challengeState, setChallengeState] = useState<ChallengeCheckState>({
    status: challengeId ? "loading" : "manual_entry",
    remainingSec: 180,
    attemptsRemaining: 5,
    grantAdminSession: false,
  });

  useEffect(() => {
    void collectClientDeviceTelemetry().then((data) => {
      setTelemetry(data);
      setDeviceName((prev) => prev || data.suggestedName);
    });
  }, []);

  // Load QR / manual pairing challenge state asynchronously inside effect callback
  useEffect(() => {
    if (!activeChallengeId) return;
    let cancelled = false;

    fetch(`/api/admin/devices/pair?challenge=${encodeURIComponent(activeChallengeId)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setChallengeState((prev) => ({
            ...prev,
            status: "missing",
            error: "Pairing session was not found or has already expired.",
          }));
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setChallengeState((prev) => ({
          ...prev,
          status:
            prev.status === "completed"
              ? "completed"
              : (data.status ?? "expired"),
          remainingSec: data.remainingSec ?? 0,
          attemptsRemaining: data.attemptsRemaining ?? prev.attemptsRemaining,
          grantAdminSession: Boolean(data.grantAdminSession),
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setChallengeState((prev) => ({
          ...prev,
          status: "missing",
          error: "Could not reach pairing server. Check connection and try again.",
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeChallengeId]);

  // Live countdown timer while challenge is open
  useEffect(() => {
    if (
      challengeState.status !== "pending" &&
      challengeState.status !== "awaiting_approval"
    ) {
      return;
    }

    const timer = setInterval(() => {
      setChallengeState((prev) => {
        const nextSec = Math.max(0, prev.remainingSec - 1);
        return {
          ...prev,
          remainingSec: nextSec,
          status: nextSec <= 0 ? "expired" : prev.status,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [challengeState.status]);

  // Poll to finalize cookie handoff once desktop clicks "Approve & Trust Device"
  useEffect(() => {
    if (
      challengeState.status !== "awaiting_approval" ||
      !activeChallengeId ||
      !claimToken
    ) {
      return;
    }

    const poller = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/devices/pair/verify", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId: activeChallengeId, claimToken }),
        });
        const data = await res.json();
        if (data.status === "completed") {
          localStorage.setItem(DEVICE_STORAGE_KEY, "true");
          window.dispatchEvent(
            new CustomEvent(DEVICE_SYNC_EVENT, { detail: true })
          );
          setCompletedAuth(Boolean(data.authenticated));
          setChallengeState((prev) => ({ ...prev, status: "completed" }));
        } else if (
          data.status === "cancelled" ||
          data.status === "expired" ||
          data.status === "burned"
        ) {
          setError(data.error || "Desktop rejected or cancelled pairing.");
          setChallengeState((prev) => ({ ...prev, status: data.status }));
        }
      } catch {
        // Silent retry
      }
    }, 1500);

    return () => clearInterval(poller);
  }, [challengeState.status, activeChallengeId, claimToken]);

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    const extracted = extractChallengeIdFromInput(manualInput);
    if (!extracted) {
      setManualError(
        "Paste the full 1-Time Pairing Link or valid Challenge ID shown on desktop."
      );
      return;
    }
    setError(null);
    setCode("");
    setClaimToken(null);
    setForceTouched(false);
    setChallengeState({
      status: "loading",
      remainingSec: 180,
      attemptsRemaining: 5,
      grantAdminSession: false,
    });
    setActiveChallengeId(extracted);
  };

  const handleSwitchToManualEntry = () => {
    setError(null);
    setManualError(null);
    setCode("");
    setClaimToken(null);
    setActiveChallengeId(null);
    setChallengeState({
      status: "manual_entry",
      remainingSec: 180,
      attemptsRemaining: 5,
      grantAdminSession: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForceTouched(true);
    setError(null);

    const cleanCode = code.replace(/\D/g, "");
    if (!activeChallengeId || cleanCode.length !== 6 || deviceName.trim().length < 2) {
      return;
    }

    setSubmitting(true);
    try {
      const live = telemetry || (await collectClientDeviceTelemetry());
      const res = await fetch("/api/admin/devices/pair/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: activeChallengeId,
          code: cleanCode,
          deviceName: sanitizeDeviceLabel(deviceName, 60).trim(),
          telemetry: live,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Verification failed.");
        setChallengeState((prev) => ({
          ...prev,
          attemptsRemaining:
            typeof data.attemptsRemaining === "number"
              ? data.attemptsRemaining
              : prev.attemptsRemaining,
          status: data.burned ? "burned" : prev.status,
        }));
        return;
      }

      if (data.status === "awaiting_approval") {
        setClaimToken(data.claimToken || null);
        setChallengeState((prev) => ({
          ...prev,
          status: "awaiting_approval",
        }));
      } else if (data.status === "completed") {
        localStorage.setItem(DEVICE_STORAGE_KEY, "true");
        window.dispatchEvent(
          new CustomEvent(DEVICE_SYNC_EVENT, { detail: true })
        );
        setCompletedAuth(Boolean(data.authenticated));
        setChallengeState((prev) => ({ ...prev, status: "completed" }));
      }
    } catch {
      setError("Network error while verifying 6-digit code.");
    } finally {
      setSubmitting(false);
    }
  };

  const mins = Math.floor(challengeState.remainingSec / 60);
  const secs = String(challengeState.remainingSec % 60).padStart(2, "0");

  return (
    <main className="min-h-dvh bg-(--bg-canvas) text-(--text-primary) px-4 py-8 flex items-center justify-center">
      <div className="max-w-md w-full bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-6 sm:p-7 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/40 flex items-center justify-center shrink-0 text-(--text-accent)">
              <Smartphone className="w-5 h-5" />
            </span>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-(--text-accent) block">
                Device Pairing
              </span>
              <h1 className="font-display text-2xl uppercase tracking-tight">
                Trust Mobile Device
              </h1>
            </div>
          </div>

          {(challengeState.status === "pending" ||
            challengeState.status === "awaiting_approval") && (
            <StatusPill
              label={`${mins}:${secs}`}
              variant="accent"
              size="xs"
              icon={<Clock className="w-3 h-3" />}
            />
          )}
        </div>

        {/* Auto-detected Phone Hardware Badge */}
        {telemetry && (
          <div className="p-3 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) flex items-center justify-between gap-3 text-[11px] font-mono">
            <div className="min-w-0">
              <p className="font-semibold text-(--text-primary) truncate">
                {telemetry.model} · {telemetry.platform} {telemetry.osVersion}
              </p>
              <p className="text-(--text-muted) truncate">
                {telemetry.browser}
                {telemetry.gpuRenderer ? ` · ${telemetry.gpuRenderer}` : ""} ·{" "}
                {telemetry.keyThumbprint || "HTTP Context Mode"}
              </p>
            </div>
            <StatusPill
              label={telemetry.keyThumbprint ? "Key Bound" : "Browser"}
              variant={telemetry.keyThumbprint ? "success" : "neutral"}
              size="xs"
            />
          </div>
        )}

        {/* Loading State */}
        {challengeState.status === "loading" && (
          <div className="py-10 text-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-(--text-accent) mx-auto" />
            <p className="text-xs font-mono text-(--text-muted)">
              Validating pairing challenge...
            </p>
          </div>
        )}

        {/* Waiting for Desktop Approval */}
        {challengeState.status === "awaiting_approval" && (
          <div className="p-6 rounded-(--radius-card) bg-(--bg-surface-2) border border-brand/35 text-center space-y-3">
            <Timer className="w-8 h-8 text-(--text-accent) mx-auto animate-pulse" />
            <div className="space-y-1">
              <p className="font-display text-xl uppercase tracking-tight">
                Waiting for Desktop Confirmation
              </p>
              <p className="text-xs text-(--text-secondary)">
                Your 6-digit PIN matched. Click{" "}
                <strong className="text-(--text-primary)">
                  Approve &amp; Trust Device
                </strong>{" "}
                on your desktop screen to finish.
              </p>
            </div>
            <StatusPill
              label={`Expires in ${mins}:${secs}`}
              variant="neutral"
              size="xs"
            />
          </div>
        )}

        {/* Pairing Completed */}
        {challengeState.status === "completed" && (
          <div className="p-6 rounded-sm bg-emerald-500/10 border border-emerald-500/30 text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <div className="space-y-1">
              <p className="font-display text-2xl uppercase tracking-tight">
                Device Trusted
              </p>
              <p className="text-xs text-(--text-secondary)">
                {completedAuth
                  ? "Your phone is registered and authenticated for /admin."
                  : "This phone is now trusted. Tapping the bottom-left LV portal orb on your portfolio slides right into /admin."}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                href="/admin"
                variant="primary"
                size="md"
                slideDirection="right"
                fullWidth
              >
                <span>Open /admin Console</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                href="/"
                variant="secondary"
                size="sm"
                slideDirection="left"
                fullWidth
              >
                <span>Open Public Portfolio</span>
              </Button>
            </div>
          </div>
        )}

        {/* Manual Challenge ID / Link Lookup */}
        {challengeState.status === "manual_entry" && (
          <form onSubmit={handleManualLookup} className="space-y-4">
            <TextField
              id="manual-pair-lookup"
              label="1-Time Pairing Link or Challenge ID"
              value={manualInput}
              onChange={(val) => {
                setManualInput(val);
                if (manualError) setManualError(null);
              }}
              placeholder="Paste pairing URL or Challenge ID from desktop..."
              maxLength={512}
              required
              hint="Copy the 1-time link or Challenge ID displayed inside Desktop CMS -> Security -> Pair Device."
            />

            {manualError && (
              <div className="p-3 rounded-sm bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
                {manualError}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={!manualInput.trim()}
            >
              <span>Load Pairing Session</span>
              <ArrowRight className="w-4 h-4" />
            </Button>

            <div className="text-center pt-1">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-mono text-(--text-muted) hover:text-(--text-primary)"
              >
                Return to Portfolio
              </Link>
            </div>
          </form>
        )}

        {/* Expired / Burned / Missing Error States */}
        {(challengeState.status === "missing" ||
          challengeState.status === "expired" ||
          challengeState.status === "burned" ||
          challengeState.status === "cancelled") && (
          <div className="p-5 rounded-sm bg-rose-500/10 border border-rose-500/30 text-center space-y-3">
            <ShieldAlert className="w-8 h-8 text-rose-400 mx-auto" />
            <div className="space-y-1">
              <p className="font-display text-xl uppercase tracking-tight text-(--text-primary)">
                {challengeState.status === "burned"
                  ? "Pairing Challenge Locked"
                  : challengeState.status === "cancelled"
                    ? "Pairing Cancelled"
                    : "Pairing Link Expired"}
              </p>
              <p className="text-xs text-(--text-secondary)">
                {error ||
                  challengeState.error ||
                  "Generate a fresh QR code or 1-time pairing link from Security & Access Control on your desktop."}
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                fullWidth
                onClick={handleSwitchToManualEntry}
              >
                <span>Connect Manually with Link / ID</span>
              </Button>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-1.5 text-xs font-mono text-(--text-accent) hover:underline pt-1"
              >
                Return to Portfolio
              </Link>
            </div>
          </div>
        )}

        {/* Active Verification Form */}
        {challengeState.status === "pending" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <OtpCodeField
              id="mobile-pair-otp"
              label="Enter Desktop 6-Digit Code"
              value={code}
              onChange={(next) => {
                setCode(next);
                if (error) setError(null);
              }}
              forceTouched={forceTouched}
              disabled={submitting}
              hint={`${challengeState.attemptsRemaining} attempts remaining before auto-lock.`}
            />

            <TextField
              id="mobile-device-name"
              label="Device Name"
              value={deviceName}
              onChange={(val) => setDeviceName(sanitizeDeviceLabel(val, 60))}
              placeholder="e.g., Lou's iPhone or Galaxy S24"
              minLength={2}
              maxLength={60}
              required
              disabled={submitting}
            />

            {error && (
              <div className="p-3 rounded-sm bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={submitting || code.replace(/\D/g, "").length !== 6}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              <span>Verify &amp; Pair Device</span>
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

