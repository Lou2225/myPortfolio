"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { OtpCodeField } from "@/components/ui/fields/OtpCodeField";
import { PasswordField } from "@/components/ui/fields/PasswordField";
import { validatePassword } from "@/lib/inputValidation";
import { collectClientDeviceTelemetry } from "@/lib/deviceTelemetry";
import {
  announceBrandPortalStatus,
  DEVICE_STORAGE_KEY,
  DEVICE_SYNC_EVENT,
} from "@/lib/brandPortalStatus";
import {
  authenticateWithPasskey,
  checkPlatformPasskeySupport,
} from "@/lib/passkeyClient";
import { useBrandPortal } from "@/components/motion/BrandPortal";
import {
  Lock,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  KeyRound,
  Fingerprint,
} from "lucide-react";

interface AdminLoginProps {
  onSuccess: () => void | Promise<void>;
  stealthUnlockToken?: string | null;
}

export function AdminLogin({ onSuccess, stealthUnlockToken }: AdminLoginProps) {
  const { triggerLoginPortal } = useBrandPortal();
  const [password, setPassword] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [forceTouched, setForceTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void checkPlatformPasskeySupport().then((res) => {
      if (!cancelled) {
        setPasskeySupported(res.supported);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lock viewport scrolling while the login screen is mounted
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const passwordValidation = validatePassword(password, {
    label: "Admin Password",
    minLength: 4,
    maxLength: 128,
    required: true,
  });

  const handlePasskeySignIn = async () => {
    if (loading || passkeyBusy) return;
    setPasskeyBusy(true);
    setError("");
    try {
      const result = await authenticateWithPasskey();
      if (!result.ok) {
        if (!result.cancelled) {
          setError(result.error);
        }
        setPasskeyBusy(false);
        return;
      }

      announceBrandPortalStatus({
        tone: "live",
        label: "Passkey Verified",
        detail: `${result.authenticatorLabel} · ${result.deviceName}`,
        durationMs: 3200,
      });
      triggerLoginPortal(onSuccess);
    } catch {
      setError("Failed to authenticate with passkey.");
      setPasskeyBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForceTouched(true);

    if (!passwordValidation.valid) {
      return;
    }

    const cleanTotp = totpCode.replace(/\D/g, "");
    if (requiresTotp && cleanTotp.length !== 6) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const telemetry = await collectClientDeviceTelemetry();
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          ...(requiresTotp ? { totpCode: cleanTotp } : {}),
          registerDevice: true,
          telemetry,
          ...(stealthUnlockToken ? { stealthUnlockToken } : {}),
        }),
      });

      const data = await res.json();
      if (data?.requiresTotp && !requiresTotp) {
        setRequiresTotp(true);
        setForceTouched(false);
        setLoading(false);
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.error || "Invalid administrator password.");
        setLoading(false);
        return;
      }

      localStorage.setItem(DEVICE_STORAGE_KEY, "true");
      window.dispatchEvent(
        new CustomEvent(DEVICE_SYNC_EVENT, { detail: true })
      );

      // Animate the bottom-left logo to spread across the viewport,
      // then shrink back to original size upon entering the dashboard
      triggerLoginPortal(onSuccess);
    } catch {
      setError("Network error while authenticating.");
      setLoading(false);
    }
  };

  return (
    <div
      data-lenis-prevent
      className="fixed inset-0 z-50 h-dvh w-full overflow-y-auto overflow-x-clip bg-(--bg-canvas) text-(--text-primary) flex flex-col justify-between gap-4 px-4 py-4 sm:px-8 sm:py-6 [@media(max-height:640px)]:py-3 select-none"
    >
      <div className="max-w-(--container-max) w-full mx-auto flex items-center justify-between gap-2 shrink-0">
        <Button
          href="/"
          variant="ghost"
          size="sm"
          slideDirection="left"
          className="px-2.5 sm:px-3 -ml-2 sm:-ml-3"
        >
          <ArrowLeft className="w-4 h-4 text-(--text-accent)" />
          <span>Back to Public Portfolio</span>
        </Button>
        <span className="hidden min-[400px]:inline text-[0.625rem] sm:text-[0.6875rem] font-mono uppercase tracking-[0.2em] text-(--text-muted) whitespace-nowrap">
          Restricted Access
        </span>
      </div>

      <div className="max-w-md w-full mx-auto bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-5 sm:p-8 [@media(max-height:640px)]:p-5 shadow-2xl my-auto">
        <div className="w-11 h-11 rounded-full bg-(--bg-badge-highlight) border border-brand/40 flex items-center justify-center mb-5">
          {requiresTotp ? (
            <KeyRound className="w-5 h-5 text-(--text-accent)" />
          ) : (
            <Lock className="w-5 h-5 text-(--text-accent)" />
          )}
        </div>

        <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-(--text-accent) font-semibold block mb-1">
          {requiresTotp ? "2-Factor Verification" : "Private Portfolio CMS"}
        </span>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-tight text-(--text-primary)">
          {requiresTotp ? "Authenticator Check" : "Administrator Login"}
        </h1>
        <p className="text-xs text-(--text-secondary) leading-relaxed mt-2">
          {requiresTotp
            ? "Password verified. Enter the 6-digit code from your Authenticator app to trust this device and enter /admin."
            : "Enter your administrator password to manage projects, skills, story content, inbox messages, and business analytics."}
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
          autoComplete="off"
          className="mt-5 space-y-4"
        >
          {!requiresTotp ? (
            <PasswordField
              id="admin-password"
              label="Admin Password"
              value={password}
              onChange={(val) => {
                setPassword(val);
                if (error) setError("");
              }}
              placeholder="Enter password..."
              minLength={4}
              maxLength={128}
              showCounter={false}
              autoFocus
              forceTouched={forceTouched}
              disabled={loading}
            />
          ) : (
            <div className="space-y-3">
              <OtpCodeField
                id="admin-login-totp"
                label="Authenticator 6-Digit Code"
                value={totpCode}
                onChange={(val) => {
                  setTotpCode(val);
                  if (error) setError("");
                }}
                forceTouched={forceTouched}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => {
                  setRequiresTotp(false);
                  setTotpCode("");
                  setError("");
                }}
                className="text-[11px] font-mono text-(--text-muted) hover:text-(--text-primary) transition-colors cursor-pointer"
              >
                &larr; Use a different password
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-(--text-accent) bg-(--bg-badge-highlight) border border-brand/30 p-3 rounded-(--radius-control)">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={
              loading ||
              passkeyBusy ||
              (requiresTotp && totpCode.replace(/\D/g, "").length !== 6)
            }
            variant="primary"
            size="lg"
            fullWidth
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {requiresTotp
                    ? "Verify 2FA & Unlock"
                    : "Unlock Portfolio Manager"}
                </span>
              </>
            )}
          </Button>

          {!requiresTotp && passkeySupported && (
            <Button
              type="button"
              variant="secondary"
              size="md"
              fullWidth
              disabled={loading || passkeyBusy}
              onClick={() => void handlePasskeySignIn()}
            >
              {passkeyBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-(--text-accent)" />
                  <span>Waiting for Device Passkey...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4 text-(--text-accent)" />
                  <span>Sign In with Passkey (Biometrics / PIN)</span>
                </>
              )}
            </Button>
          )}
        </form>

        <div className="mt-5 pt-4 border-t border-(--border-subtle) text-[11px] text-(--text-muted) leading-relaxed">
          <p className="text-[10px]">
            Protected with environment-configured HMAC-SHA256 session auth via{" "}
            <code className="font-mono text-(--text-primary)">ADMIN_PASSWORD</code> &{" "}
            <code className="font-mono text-(--text-primary)">ADMIN_SESSION_SECRET</code>.
          </p>
        </div>
      </div>

      <div className="text-center text-[11px] text-(--text-muted) shrink-0">
        Lou Diamond Valdellon · Full-Stack Portfolio Management System
      </div>
    </div>
  );
}
