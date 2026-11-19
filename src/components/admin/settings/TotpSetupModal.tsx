"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  isNetworkOffline,
  useOfflineStatus,
} from "@/components/pwa/OfflineManager";
import { ModalShell } from "@/components/ui/ModalShell";
import { Button } from "@/components/ui/Button";
import { OtpCodeField, PasswordField } from "@/components/ui/fields";

export interface TotpSetupModalProps {
  open: boolean;
  totpEnabled: boolean;
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
}

interface SetupPayload {
  qrSvg: string;
  manualSecret: string;
  otpAuthUri: string;
}

/**
 * Modular Authenticator App (RFC 6238 TOTP) enrollment and disable modal.
 */
export function TotpSetupModal({
  open,
  totpEnabled,
  onClose,
  onUpdated,
}: TotpSetupModalProps) {
  const { isOnline } = useOfflineStatus();
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [setupData, setSetupData] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [forceTouched, setForceTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializedRef = useRef(false);

  const beginSetup = useCallback(async () => {
    if (isNetworkOffline(isOnline)) {
      setLoadingSetup(false);
      setError("Offline — Reconnect to initialize Authenticator 2FA setup.");
      return;
    }

    setLoadingSetup(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/devices/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "begin-setup" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || "Unable to initialize Authenticator setup.");
        return;
      }
      setSetupData({
        qrSvg: data.qrSvg,
        manualSecret: data.manualSecret,
        otpAuthUri: data.otpAuthUri,
      });
    } catch {
      setError("Network error while generating Authenticator secret.");
    } finally {
      setLoadingSetup(false);
    }
  }, [isOnline]);

  const resetModalState = useCallback(() => {
    initializedRef.current = false;
    setSetupData(null);
    setCode("");
    setDisablePassword("");
    setForceTouched(false);
    setError(null);
    setCopiedSecret(false);
  }, []);

  const handleClose = useCallback(() => {
    resetModalState();
    onClose();
  }, [onClose, resetModalState]);

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }

    if (!totpEnabled && !initializedRef.current) {
      initializedRef.current = true;
      void beginSetup();
    }
  }, [open, totpEnabled, beginSetup]);

  const handleConfirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setForceTouched(true);
    setError(null);

    const cleanCode = code.replace(/\D/g, "");
    if (cleanCode.length !== 6) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/devices/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm-setup", code: cleanCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Authenticator verification code failed.");
        return;
      }
      await onUpdated();
      handleClose();
    } catch {
      setError("Network error while verifying Authenticator code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setForceTouched(true);
    setError(null);
    if (disablePassword.length < 4) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/devices/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable",
          currentPassword: disablePassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Could not disable Authenticator 2FA.");
        return;
      }
      await onUpdated();
      handleClose();
    } catch {
      setError("Network error while updating Authenticator setting.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySecret = async () => {
    if (!setupData?.manualSecret) return;
    try {
      await navigator.clipboard.writeText(setupData.manualSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Ignore clipboard deny
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      closeDisabled={submitting}
      ariaLabelledBy="totp-modal-title"
      maxWidthClassName="max-w-lg"
    >
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-(--border-subtle) flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/40 flex items-center justify-center shrink-0 text-(--text-accent)">
              <KeyRound className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3
                id="totp-modal-title"
                className="font-display text-xl uppercase tracking-tight text-(--text-primary)"
              >
                {totpEnabled
                  ? "Disable Authenticator 2FA"
                  : "Enable Authenticator App (TOTP)"}
              </h3>
              <p className="text-[11px] font-mono text-(--text-muted)">
                {totpEnabled
                  ? "Confirm your administrator password to turn off 2FA."
                  : "Scan in Google Authenticator, Bitwarden, 1Password, or Apple Passwords."}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            shape="pill"
            onClick={handleClose}
            aria-label="Close Authenticator dialog"
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0 lou-scrollarea">
          {error && (
            <div className="p-3 rounded-(--radius-control) bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
              {error}
            </div>
          )}

          {totpEnabled ? (
            <form onSubmit={handleDisable} className="space-y-4">
              <div className="p-3.5 rounded-(--radius-control) bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Turning off Authenticator 2FA leaves remote password sign-ins protected only by your administrator password and Stealth Gate.
                </span>
              </div>

              <PasswordField
                id="totp-disable-password"
                label="Current Administrator Password"
                value={disablePassword}
                onChange={(val) => {
                  setDisablePassword(val);
                  if (error) setError(null);
                }}
                minLength={4}
                maxLength={128}
                showCounter={false}
                forceTouched={forceTouched}
                disabled={submitting}
              />

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-(--border-subtle)">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={submitting}
                  onClick={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  disabled={submitting || disablePassword.length < 4}
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Disable 2FA</span>
                </Button>
              </div>
            </form>
          ) : loadingSetup ? (
            <div className="py-10 flex items-center justify-center gap-2.5 text-xs font-mono text-(--text-muted)">
              <Loader2 className="w-4 h-4 animate-spin text-(--text-accent)" />
              <span>Generating encrypted TOTP key...</span>
            </div>
          ) : !setupData ? (
            <div className="py-8 text-center space-y-3">
              <ShieldAlert className="w-8 h-8 text-rose-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-(--text-primary)">
                  Authenticator Setup Unavailable
                </p>
                <p className="text-xs text-(--text-muted) max-w-sm mx-auto">
                  Could not generate a TOTP QR code right now. Verify your
                  connection and try again.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleClose}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!isOnline}
                  onClick={() => void beginSetup()}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Setup</span>
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConfirmSetup} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[176px_1fr] gap-4 items-center">
                <div className="w-40 h-40 sm:w-44 sm:h-44 mx-auto sm:mx-0 p-2 rounded-(--radius-control) bg-white border border-(--border-strong) flex items-center justify-center">
                  <div
                    className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: setupData.qrSvg }}
                  />
                </div>

                <div className="space-y-2.5 text-xs min-w-0">
                  <p className="text-(--text-secondary) leading-relaxed">
                    Open your authenticator app, scan this QR code, and enter the live 6-digit code below to activate offline 2FA.
                  </p>
                  <div className="p-2.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted) block">
                      Manual Setup Key (Base32)
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-[11px] text-(--text-primary) break-all">
                        {setupData.manualSecret}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleCopySecret()}
                        aria-label="Copy Base32 secret"
                      >
                        {copiedSecret ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <OtpCodeField
                id="totp-confirm-code"
                label="Enter 6-Digit Authenticator Code"
                value={code}
                onChange={(next) => {
                  setCode(next);
                  if (error) setError(null);
                }}
                forceTouched={forceTouched}
                disabled={submitting}
              />

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-(--border-subtle)">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={submitting}
                  onClick={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submitting || code.replace(/\D/g, "").length !== 6}
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>Verify &amp; Enable 2FA</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
