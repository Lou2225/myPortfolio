"use client";

import React, { useState } from "react";
import {
  KeyRound,
  ShieldAlert,
  RotateCcw,
  Check,
  Loader2,
  Lock,
} from "lucide-react";
import type { AdminPasswordSource } from "@/lib/auth";
import {
  evaluatePasswordStrength,
  passwordChangeSchema,
} from "@/lib/validation";
import { useOfflineStatus, isNetworkOffline } from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import { PasswordField } from "@/components/ui/fields/PasswordField";
import {
  InfoTooltip,
} from "@/components/ui/Tooltip";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { SettingsFeedback } from "./types";

export interface PasswordCredentialsSettingsProps {
  storageMode: "local-json" | "supabase";
  passwordSource: AdminPasswordSource;
  envConfigured: boolean;
  overrideUpdatedAt: string | null;
  onPasswordMetaChange: (meta: {
    passwordSource: AdminPasswordSource;
    envConfigured: boolean;
    overrideUpdatedAt: string | null;
  }) => void;
  onFeedback: (next: SettingsFeedback | null) => void;
}

export function PasswordCredentialsSettings({
  storageMode,
  passwordSource,
  envConfigured,
  overrideUpdatedAt,
  onPasswordMetaChange,
  onFeedback,
}: PasswordCredentialsSettingsProps) {
  const { isOnline } = useOfflineStatus();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forceTouched, setForceTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false);
  const [confirmPasswordSaveOpen, setConfirmPasswordSaveOpen] = useState(false);

  const strength = evaluatePasswordStrength(newPassword);
  const passwordsMatch =
    Boolean(confirmPassword) && newPassword === confirmPassword;

  const strengthColors = [
    "bg-(--bg-surface-2)",
    "bg-rose-500",
    "bg-amber-400",
    "bg-emerald-400",
    "bg-brand",
  ] as const;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setForceTouched(true);
    onFeedback(null);

    if (isNetworkOffline(isOnline)) {
      onFeedback({
        type: "error",
        message: "Offline — Reconnect to update administrator password.",
      });
      return;
    }

    const parsed = passwordChangeSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!parsed.success) {
      onFeedback({
        type: "error",
        message:
          parsed.error.issues[0]?.message ||
          "Please resolve all password validation fields.",
      });
      return;
    }

    setConfirmPasswordSaveOpen(true);
  };

  const executePasswordUpdate = async () => {
    setSubmitting(true);
    announceBrandPortalStatus({
      tone: "saving",
      label: "Updating...",
      detail: "Rotating administrator password",
      durationMs: 0,
    });

    try {
      const res = await fetch("/api/admin/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change-password",
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.error || "Unable to update administrator password."
        );
      }

      onPasswordMetaChange({
        passwordSource: json.passwordSource || "override",
        envConfigured: Boolean(json.envConfigured),
        overrideUpdatedAt: json.overrideUpdatedAt || new Date().toISOString(),
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setForceTouched(false);
      setConfirmPasswordSaveOpen(false);
      onFeedback(null);

      announceBrandPortalStatus({
        tone: "live",
        label: "Password Updated",
        detail: "Scrypt credential saved cleanly",
        durationMs: 3600,
      });
    } catch (err) {
      setConfirmPasswordSaveOpen(false);
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to update administrator password.";
      onFeedback({ type: "error", message: msg });
      announceBrandPortalStatus({
        tone: "error",
        label: "Update Failed",
        detail: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevertToEnv = async () => {
    if (isNetworkOffline(isOnline)) {
      onFeedback({
        type: "error",
        message: "Offline — Reconnect to revert credentials.",
      });
      setConfirmRevertOpen(false);
      return;
    }

    setReverting(true);
    onFeedback(null);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revert-env" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.error || "Failed to revert to environment variable password."
        );
      }

      onPasswordMetaChange({
        passwordSource: json.passwordSource || "env",
        envConfigured: Boolean(json.envConfigured),
        overrideUpdatedAt: null,
      });
      setConfirmRevertOpen(false);
      onFeedback(null);
      announceBrandPortalStatus({
        tone: "synced",
        label: "Env Fallback Active",
        detail: "Using ADMIN_PASSWORD env",
        durationMs: 3200,
      });
    } catch (err) {
      setConfirmRevertOpen(false);
      onFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to revert credentials.",
      });
    } finally {
      setReverting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Credential Source Posture Card */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) flex items-center justify-center shrink-0 text-(--text-accent)">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-(--text-primary)">
                Active Credential Source
              </h3>
              <InfoTooltip
                label="How credential source precedence works"
                content="A custom scrypt override hash stored in your database takes precedence over ADMIN_PASSWORD in .env / Vercel. Reverting deletes the stored hash and restores environment variable fallback."
              />
              <StatusPill
                label={
                  passwordSource === "override"
                    ? "Custom Scrypt Override"
                    : passwordSource === "env"
                      ? "Environment Variable (ADMIN_PASSWORD)"
                      : "Unconfigured"
                }
                variant={
                  passwordSource === "override"
                    ? "accent"
                    : passwordSource === "env"
                      ? "success"
                      : "warning"
                }
                size="xs"
              />
            </div>
            <p className="text-xs text-(--text-muted) mt-1">
              {passwordSource === "override" && overrideUpdatedAt ? (
                <>
                  Stored privately in{" "}
                  <code className="font-mono text-(--text-primary)">
                    {storageMode === "supabase"
                      ? "Supabase admin_credentials"
                      : "data/admin-credentials.json"}
                  </code>{" "}
                  (updated{" "}
                  <span suppressHydrationWarning>
                    {new Date(overrideUpdatedAt).toLocaleString()}
                  </span>
                  ) and excluded from JSON backups.
                </>
              ) : (
                <>
                  Verifying against{" "}
                  <code className="font-mono text-(--text-primary)">
                    process.env.ADMIN_PASSWORD
                  </code>
                  . Setting a new password below saves an encrypted scrypt hash
                  override without modifying{" "}
                  <code className="font-mono text-(--text-primary)">.env</code>.
                </>
              )}
            </p>
          </div>
        </div>

        {passwordSource === "override" && envConfigured && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setConfirmRevertOpen(true)}
            className="font-mono text-xs shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-(--text-accent)" />
            <span>Revert to Env Password</span>
          </Button>
        )}
      </div>

      {/* Change Password Form */}
      <form
        data-cascade
        onSubmit={handleSubmit}
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Credential Update"
          title="Change Administrator Password"
          description="Verify your current password and configure a strong new passkey (8+ characters with at least one number or symbol)."
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Password hashing & session behavior"
                content="Passwords are salted and hashed with Node crypto.scrypt (N=16384) before saving. Your current active browser cookie remains signed in."
              />
              <Lock className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        {storageMode === "local-json" && (
          <div className="p-3.5 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) flex items-start gap-2.5 text-xs text-(--text-secondary)">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Running in <strong>Local JSON</strong> mode: custom password
              overrides write to{" "}
              <code className="font-mono text-(--text-primary)">
                data/admin-credentials.json
              </code>{" "}
              locally. Production Vercel deployments require Supabase connected
              for persistent runtime writes.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="lg:col-span-2">
            <PasswordField
              id="settings-current-password"
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Enter current administrator password..."
              minLength={1}
              forceTouched={forceTouched}
              disabled={submitting}
            />
          </div>

          <PasswordField
            id="settings-new-password"
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Minimum 8 characters, mixed symbols..."
            minLength={8}
            showCounter
            forceTouched={forceTouched}
            disabled={submitting}
          />

          <div className="space-y-1.5">
            <PasswordField
              id="settings-confirm-password"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Re-enter new password..."
              minLength={8}
              forceTouched={forceTouched}
              disabled={submitting}
              hint={
                confirmPassword
                  ? passwordsMatch
                    ? "Matches new password."
                    : "Confirmation does not match new password yet."
                  : undefined
              }
            />
          </div>
        </div>

        {/* Live Password Strength Meter & Checklist */}
        <div className="p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="uppercase tracking-wider text-(--text-muted)">
              Password Strength
            </span>
            <span className="text-(--text-primary) font-semibold">
              {strength.label}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 h-1.5">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`rounded-full transition-colors duration-200 ${
                  strength.score >= step
                    ? strengthColors[strength.score]
                    : "bg-(--bg-surface) border border-(--border-subtle)"
                }`}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-[11px] font-mono">
            {[
              { ok: strength.checks.minLength, text: "8+ characters" },
              {
                ok: strength.checks.hasNumber || strength.checks.hasSymbol,
                text: "Number or symbol",
              },
              { ok: strength.checks.hasUpperLower, text: "Upper & lowercase" },
              { ok: strength.checks.noSpaces, text: "No spaces" },
            ].map((rule) => (
              <span
                key={rule.text}
                className={`inline-flex items-center gap-1 ${
                  rule.ok ? "text-emerald-400" : "text-(--text-muted)"
                }`}
              >
                <Check className="w-3 h-3" aria-hidden="true" />
                {rule.text}
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={submitting}
            variant="primary"
            size="sm"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <KeyRound className="w-3.5 h-3.5" />
            )}
            <span>
              {submitting ? "Updating Password..." : "Update Admin Password"}
            </span>
          </Button>
        </div>
      </form>

      <ConfirmModal
        open={confirmPasswordSaveOpen}
        variant="primary"
        title="Save New Administrator Password?"
        description="Your new password will be scrypt-hashed and persisted immediately. Your current browser session remains signed in."
        confirmLabel="Update Password"
        loading={submitting}
        onCancel={() => {
          if (!submitting) setConfirmPasswordSaveOpen(false);
        }}
        onConfirm={() => void executePasswordUpdate()}
      />

      <ConfirmModal
        open={confirmRevertOpen}
        variant="warning"
        title="Revert to Environment Password?"
        description="Remove your custom password override and fall back to the ADMIN_PASSWORD environment variable?"
        confirmLabel="Revert Password"
        loading={reverting}
        onCancel={() => {
          if (!reverting) setConfirmRevertOpen(false);
        }}
        onConfirm={handleRevertToEnv}
      />
    </div>
  );
}
