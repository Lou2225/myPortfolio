"use client";

import React, { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  ShieldAlert,
  RotateCcw,
  Check,
  Lock,
} from "lucide-react";
import type { AdminPasswordSource } from "@/lib/auth";
import { queryKeys } from "@/lib/queryClient";
import {
  evaluatePasswordStrength,
  passwordChangeSchema,
} from "@/lib/validation";
import { useOfflineStatus, isNetworkOffline } from "@/components/pwa/OfflineManager";
import {
  announceBrandPortalStatus,
  useBrandPortalWorkspaceSync,
} from "@/lib/brandPortalStatus";
import { PasswordField } from "@/components/ui/fields/PasswordField";
import {
  InfoTooltip,
} from "@/components/ui/Tooltip";
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
  const queryClient = useQueryClient();
  const { isOnline } = useOfflineStatus();
  const formRef = useRef<HTMLFormElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forceTouched, setForceTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false);
  const [confirmPasswordSaveOpen, setConfirmPasswordSaveOpen] = useState(false);

  const hasDraftInput = Boolean(
    currentPassword || newPassword || confirmPassword
  );

  const handleClearDraft = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setForceTouched(false);
    onFeedback(null);
    announceBrandPortalStatus({
      tone: "synced",
      label: "Fields Cleared",
      detail: "Password draft cleared",
      durationMs: 2400,
    });
  };

  const validationResult = passwordChangeSchema.safeParse({
    currentPassword,
    newPassword,
    confirmPassword,
  });
  const validationErrorCount =
    hasDraftInput && !validationResult.success
      ? validationResult.error.issues.length
      : 0;

  const handleFollowIssue = () => {
    setForceTouched(true);
    if (!currentPassword) {
      document.getElementById("settings-current-password")?.focus();
    } else if (!newPassword || strength.score < 2) {
      document.getElementById("settings-new-password")?.focus();
    } else {
      document.getElementById("settings-confirm-password")?.focus();
    }
  };

  useBrandPortalWorkspaceSync({
    moduleId: "settings-password",
    moduleLabel: "Admin Password",
    hasUnsavedChanges: hasDraftInput,
    validationErrorCount: hasDraftInput ? validationErrorCount : 0,
    onFollowIssue: handleFollowIssue,
    saving: submitting,
    saveLabel: "Update Password",
    onSave: () => formRef.current?.requestSubmit(),
    onDiscard: handleClearDraft,
  });

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSecurity });

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSecurity });
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
    <div className="space-y-4 sm:space-y-6">
      {/* Credential Source Posture Card */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4"
      >
        <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex items-center justify-center shrink-0 text-(--text-accent)">
            <KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-(--text-primary)">
                Active Credential{" "}
                <span className="whitespace-nowrap">
                  Source
                  <span className="inline-flex align-middle ml-1.5">
                    <InfoTooltip
                      label="How credential source precedence works"
                      content="A custom scrypt override hash stored in your database takes precedence over ADMIN_PASSWORD in .env / Vercel. Reverting deletes the stored hash and restores environment variable fallback."
                    />
                  </span>
                </span>
              </h3>
              <span className="text-[11px] font-mono text-(--text-muted)">
                ·{" "}
                {passwordSource === "override"
                  ? "Custom Scrypt Override"
                  : passwordSource === "env"
                    ? "Environment Variable"
                    : "Unconfigured"}
              </span>
            </div>
            <p className="text-xs text-(--text-muted) mt-1 leading-relaxed">
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
            className="w-full sm:w-auto font-mono text-xs shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
            <span>Revert to Env Password</span>
          </Button>
        )}
      </div>

      {/* Change Password Form */}
      <form
        ref={formRef}
        noValidate
        data-cascade
        onSubmit={handleSubmit}
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5"
      >
        <SectionHeader
          eyebrow="Credential Update"
          title="Change Administrator Password"
          description="Verify your current password and configure a strong new password (8+ characters with at least one number or symbol)."
          size="sm"
          tooltip={
            <InfoTooltip
              label="Password hashing & session behavior"
              content="Passwords are salted and hashed with Node crypto.scrypt (N=16384) before saving. Your current active browser cookie remains signed in."
            />
          }
          rightSlot={<Lock className="w-5 h-5 text-(--text-accent)" />}
        />

        {storageMode === "local-json" && (
          <div className="p-3.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex items-start gap-2.5 text-xs text-(--text-secondary) leading-relaxed">
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
        <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-3">
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

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-4 gap-y-1.5 pt-1 text-[11px] font-mono">
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
                <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{rule.text}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Hidden submit input preserves Enter-key submission while Save action lives in Brand Portal */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Update Admin Password
        </button>
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
