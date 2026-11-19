"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Link2,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  X,
  XCircle,
} from "lucide-react";
import {
  isNetworkOffline,
  useOfflineStatus,
} from "@/components/pwa/OfflineManager";
import { ModalShell } from "@/components/ui/ModalShell";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import type { PairedDevicePreview } from "@/types/security";

interface GeneratedPairData {
  challengeId: string;
  code: string;
  pairUrl: string;
  qrSvg: string;
  baseOrigin: string;
  expiresAt: string;
  grantAdminSession: boolean;
  requireDesktopApproval: boolean;
}

interface PollChallengeResponse {
  id: string;
  status:
    | "pending"
    | "awaiting_approval"
    | "approved"
    | "completed"
    | "expired"
    | "burned"
    | "cancelled";
  remainingSec: number;
  pendingDevice: PairedDevicePreview | null;
  pairedDeviceId: string | null;
}

export interface QrDevicePairModalProps {
  open: boolean;
  onClose: () => void;
  onPairedSuccess: () => void;
}

/**
 * Generates an interactive time-bound QR pairing session with an independent 6-digit code
 * and live incoming device approval preview.
 */
export function QrDevicePairModal({
  open,
  onClose,
  onPairedSuccess,
}: QrDevicePairModalProps) {
  const { isOnline } = useOfflineStatus();
  const [generating, setGenerating] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantSession, setGrantSession] = useState(false);
  const [requireDesktopApproval, setRequireDesktopApproval] = useState(true);
  const [pairData, setPairData] = useState<GeneratedPairData | null>(null);
  const [liveStatus, setLiveStatus] = useState<PollChallengeResponse | null>(
    null
  );
  const [remainingSec, setRemainingSec] = useState(180);
  const [copiedLink, setCopiedLink] = useState(false);

  const startPairingSession = useCallback(
    async (opts?: {
      withSession?: boolean;
      withApproval?: boolean;
    }) => {
      if (isNetworkOffline(isOnline)) {
        setGenerating(false);
        setError("Offline — Reconnect to generate a mobile QR pairing code.");
        return;
      }

      setGenerating(true);
      setError(null);
      setLiveStatus(null);

      try {
        const res = await fetch("/api/admin/devices/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grantAdminSession: opts?.withSession ?? grantSession,
            requireDesktopApproval:
              opts?.withApproval ?? requireDesktopApproval,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Failed to generate QR pairing code.");
          return;
        }
        setPairData(data);
        setRemainingSec(
          Math.max(
            0,
            Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / 1000)
          )
        );
      } catch {
        setError("Network error while creating QR pairing session.");
      } finally {
        setGenerating(false);
      }
    },
    [grantSession, isOnline, requireDesktopApproval]
  );

  const initializedOpenRef = React.useRef(false);

  // Auto-generate once when modal transitions open (never re-trigger per keystroke)
  useEffect(() => {
    if (!open) {
      initializedOpenRef.current = false;
      return;
    }
    if (!initializedOpenRef.current) {
      initializedOpenRef.current = true;
      void startPairingSession();
    }
  }, [open, startPairingSession]);

  // Countdown tick (clears immediately once expired or terminal)
  useEffect(() => {
    if (!open || !pairData) return;
    if (
      liveStatus?.status === "approved" ||
      liveStatus?.status === "completed" ||
      liveStatus?.status === "expired" ||
      liveStatus?.status === "burned" ||
      liveStatus?.status === "cancelled"
    ) {
      return;
    }

    const computeRemaining = () =>
      Math.max(
        0,
        Math.ceil((new Date(pairData.expiresAt).getTime() - Date.now()) / 1000)
      );

    if (computeRemaining() <= 0) {
      const zeroTimer = window.setTimeout(() => setRemainingSec(0), 0);
      return () => window.clearTimeout(zeroTimer);
    }

    const tick = setInterval(() => {
      const secs = computeRemaining();
      setRemainingSec(secs);
      if (secs <= 0) {
        clearInterval(tick);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [open, pairData, liveStatus?.status]);

  // Poll desktop status while waiting for mobile scan / approval
  useEffect(() => {
    if (!open || !pairData) return;
    if (
      liveStatus?.status === "completed" ||
      liveStatus?.status === "expired" ||
      liveStatus?.status === "burned" ||
      liveStatus?.status === "cancelled"
    ) {
      return;
    }

    const poll = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/admin/devices/pair?challenge=${encodeURIComponent(
            pairData.challengeId
          )}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as PollChallengeResponse;
        setLiveStatus(data);
        if (data.status === "completed") {
          onPairedSuccess();
        }
      } catch {
        // Silent transient poll failure
      }
    }, 1500);

    return () => clearInterval(poll);
  }, [open, pairData, liveStatus?.status, onPairedSuccess]);

  const handleClose = () => {
    if (
      pairData &&
      (liveStatus?.status === "pending" ||
        liveStatus?.status === "awaiting_approval" ||
        !liveStatus)
    ) {
      void fetch(
        `/api/admin/devices/pair?challenge=${encodeURIComponent(
          pairData.challengeId
        )}`,
        { method: "DELETE" }
      );
    }
    setPairData(null);
    setLiveStatus(null);
    setError(null);
    setCopiedLink(false);
    onClose();
  };

  const handleCopyPairUrl = async () => {
    if (!pairData?.pairUrl) return;
    try {
      await navigator.clipboard.writeText(pairData.pairUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setError("Clipboard access was blocked. Copy the URL manually.");
    }
  };

  const handleDecision = async (action: "approve" | "reject") => {
    if (!pairData) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/devices/pair", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: pairData.challengeId,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to confirm pairing decision.");
        return;
      }
      if (action === "approve") {
        setLiveStatus((prev) =>
          prev ? { ...prev, status: "approved" } : null
        );
        onPairedSuccess();
      } else {
        setLiveStatus((prev) =>
          prev ? { ...prev, status: "cancelled" } : null
        );
      }
    } catch {
      setError("Network error while confirming device pairing.");
    } finally {
      setActing(false);
    }
  };

  const currentStatus =
    liveStatus?.status || (remainingSec <= 0 ? "expired" : "pending");
  const formattedCode = pairData
    ? `${pairData.code.slice(0, 3)} ${pairData.code.slice(3)}`
    : "--- ---";
  const mins = Math.floor(remainingSec / 60);
  const secs = String(remainingSec % 60).padStart(2, "0");

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      closeDisabled={acting}
      ariaLabelledBy="qr-pair-modal-title"
      maxWidthClassName="max-w-2xl"
    >
      <div className="flex flex-col max-h-[90dvh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-(--border-subtle) flex items-start justify-between gap-3 bg-(--bg-surface) shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/40 flex items-center justify-center shrink-0 text-(--text-accent)">
              <QrCode className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3
                id="qr-pair-modal-title"
                className="font-display text-xl uppercase tracking-tight text-(--text-primary)"
              >
                Pair Mobile Device via QR
              </h3>
              <p className="text-[11px] font-mono text-(--text-muted)">
                Scan the QR code on your phone, then enter the 6-digit security PIN.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            shape="pill"
            onClick={handleClose}
            aria-label="Close QR pairing dialog"
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0 lou-scrollarea">
          {error && (
            <div className="p-3 rounded-(--radius-control) bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
              {error}
            </div>
          )}

          {/* Incoming Device Approval View */}
          {currentStatus === "awaiting_approval" && liveStatus?.pendingDevice ? (
            <div className="p-5 rounded-(--radius-card) bg-(--bg-surface-2) border border-brand/40 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Smartphone className="w-5 h-5 text-(--text-accent)" />
                  <div>
                    <p className="text-sm font-semibold text-(--text-primary)">
                      Incoming Mobile Pairing Request
                    </p>
                    <p className="text-[11px] font-mono text-(--text-muted)">
                      Verified 6-digit code — confirm this is your device
                    </p>
                  </div>
                </div>
                <StatusPill label="6-Digit Verified" variant="success" size="xs" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) p-2.5">
                  <span className="text-[10px] text-(--text-muted) uppercase block">
                    Device Name &amp; Model
                  </span>
                  <span className="text-(--text-primary) font-semibold">
                    {liveStatus.pendingDevice.name}
                  </span>
                  <span className="text-[11px] text-(--text-muted) block">
                    {liveStatus.pendingDevice.model}
                  </span>
                  {liveStatus.pendingDevice.gpuRenderer && (
                    <span className="text-[10px] text-(--text-muted) block truncate">
                      GPU: {liveStatus.pendingDevice.gpuRenderer}
                    </span>
                  )}
                </div>
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) p-2.5">
                  <span className="text-[10px] text-(--text-muted) uppercase block">
                    Platform &amp; Network
                  </span>
                  <span className="text-(--text-primary)">
                    {liveStatus.pendingDevice.platform}{" "}
                    {liveStatus.pendingDevice.osVersion} ·{" "}
                    {liveStatus.pendingDevice.browser}
                  </span>
                  <span className="text-[11px] text-(--text-muted) block">
                    IP: {liveStatus.pendingDevice.ipMasked}
                  </span>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center sm:justify-end gap-2 sm:gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={acting}
                  onClick={() => void handleDecision("reject")}
                  className="w-full sm:w-auto"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Reject</span>
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={acting}
                  onClick={() => void handleDecision("approve")}
                  className="w-full sm:w-auto"
                >
                  {acting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>Approve &amp; Trust Device</span>
                </Button>
              </div>
            </div>
          ) : currentStatus === "approved" || currentStatus === "completed" ? (
            <div className="p-6 rounded-(--radius-control) bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <div>
                <p className="font-display text-2xl uppercase tracking-tight text-(--text-primary)">
                  Mobile Device Paired
                </p>
                <p className="text-xs text-(--text-secondary) mt-1">
                  {liveStatus?.pendingDevice?.name || "Mobile browser"} is now
                  trusted in your server device registry.
                </p>
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleClose}
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[208px_1fr] md:grid-cols-[224px_1fr] gap-4 sm:gap-5 items-stretch">
              {/* Left Column: QR Frame, TTL & 1-Time Link */}
              <div className="flex flex-col gap-2.5 w-48 sm:w-52 md:w-56 mx-auto sm:mx-0 shrink-0">
                <div className="w-48 h-48 sm:w-52 sm:h-52 md:w-56 md:h-56 p-3 rounded-(--radius-card) bg-white border border-(--border-strong) flex items-center justify-center relative overflow-hidden">
                  {generating ? (
                    <Loader2 className="w-6 h-6 animate-spin text-[#111114]" />
                  ) : !pairData ? (
                    <div className="text-center space-y-2 px-3">
                      <ShieldAlert className="w-7 h-7 text-brand-deep mx-auto" />
                      <p className="text-xs font-mono font-semibold text-[#111114] uppercase">
                        QR Unavailable
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={!isOnline}
                        onClick={() => void startPairingSession()}
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry</span>
                      </Button>
                    </div>
                  ) : currentStatus === "expired" ||
                    currentStatus === "burned" ||
                    currentStatus === "cancelled" ? (
                    <div className="text-center space-y-2 px-3">
                      <ShieldAlert className="w-7 h-7 text-brand-deep mx-auto" />
                      <p className="text-xs font-mono font-semibold text-[#111114] uppercase">
                        {currentStatus === "burned"
                          ? "Locked (Too Many Tries)"
                          : currentStatus === "cancelled"
                            ? "Pairing Cancelled"
                            : "QR Code Expired"}
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => void startPairingSession()}
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Regenerate</span>
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                      dangerouslySetInnerHTML={{ __html: pairData.qrSvg }}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-(--text-muted) px-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-(--text-accent)" />
                    TTL {mins}:{secs}
                  </span>
                  <button
                    type="button"
                    onClick={() => void startPairingSession()}
                    className="inline-flex items-center gap-1 text-(--text-primary) hover:text-(--text-accent) cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>New Code</span>
                  </button>
                </div>

                {pairData && currentStatus === "pending" && (
                  <div className="pt-0.5 space-y-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onClick={() => void handleCopyPairUrl()}
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>1-Time Link Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy 1-Time Link</span>
                        </>
                      )}
                    </Button>
                    <div
                      title={pairData.challengeId}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) text-[10px] font-mono text-(--text-muted)"
                    >
                      <Link2 className="w-3 h-3 text-(--text-accent) shrink-0" />
                      <span className="truncate">
                        ID: {pairData.challengeId.slice(0, 12)}...
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: 6-Digit Security PIN & Options */}
              <div className="flex flex-col justify-between gap-3.5 min-w-0">
                <div className="p-4 sm:p-5 rounded-(--radius-card) bg-(--bg-surface-2) border border-(--border-subtle) text-center space-y-2 flex-1 flex flex-col justify-center">
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
                    Verification PIN (Never Stored in QR)
                  </span>
                  <p className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.22em] text-(--text-primary) tabular-nums">
                    {formattedCode}
                  </p>
                  <p className="text-[11px] text-(--text-muted)">
                    Enter this code on your device after scanning · max 5 tries
                  </p>
                </div>

                {/* Pairing Security Toggles */}
                <div className="space-y-2.5 text-xs">
                  <label className="flex items-center justify-between gap-3 p-3 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) cursor-pointer hover:border-(--border-strong) transition-colors">
                    <span className="min-w-0">
                      <span className="font-semibold text-(--text-primary) block">
                        Require desktop approval after PIN
                      </span>
                      <span className="text-[10px] text-(--text-muted) block">
                        Verify incoming phone model &amp; IP before trusting
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={requireDesktopApproval}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setRequireDesktopApproval(next);
                        void startPairingSession({ withApproval: next });
                      }}
                      className="accent-brand w-4 h-4 shrink-0 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 p-3 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) cursor-pointer hover:border-(--border-strong) transition-colors">
                    <span className="min-w-0">
                      <span className="font-semibold text-(--text-primary) block">
                        Also grant 7-day admin sign-in session
                      </span>
                      <span className="text-[10px] text-(--text-muted) block">
                        Leave off to still require admin password on phone
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={grantSession}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setGrantSession(next);
                        void startPairingSession({ withSession: next });
                      }}
                      className="accent-brand w-4 h-4 shrink-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
