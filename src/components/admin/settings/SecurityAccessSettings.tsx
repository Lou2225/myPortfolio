"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  EyeOff,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  MonitorCheck,
  MonitorOff,
  Pencil,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  Users,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { Collapsible } from "@/components/motion/Collapsible";
import { collectClientDeviceTelemetry } from "@/lib/deviceTelemetry";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import {
  DEVICE_STORAGE_KEY,
  DEVICE_SYNC_EVENT,
} from "@/components/admin/AdminLogin";
import { DeviceEditModal } from "./DeviceEditModal";
import { QrDevicePairModal } from "./QrDevicePairModal";
import { SecurityAuditFeed } from "./SecurityAuditFeed";
import { TotpSetupModal } from "./TotpSetupModal";
import type {
  ClientDeviceTelemetry,
  SafeSecuritySummary,
  TrustedDevice,
} from "@/types/security";
import type { SettingsFeedback } from "./types";

export interface SecurityAccessSettingsProps {
  deviceRegistered: boolean;
  togglingDevice: boolean;
  onToggleDevice: () => void;
  onLogout: (unregisterDevice?: boolean) => Promise<void> | void;
  onFeedback?: (feedback: SettingsFeedback | null) => void;
  onSyncAuth?: () => void | Promise<void>;
}

const TRUST_SOURCE_LABELS: Record<TrustedDevice["trustSource"], string> = {
  login: "Password Sign-In",
  manual: "Manual Trust",
  "qr-pair": "QR Paired",
  "stealth-unlock": "Stealth Unlock",
  totp: "Authenticator 2FA",
};

export function SecurityAccessSettings({
  deviceRegistered,
  togglingDevice,
  onToggleDevice,
  onLogout,
  onFeedback,
  onSyncAuth,
}: SecurityAccessSettingsProps) {
  const queryClient = useQueryClient();

  const [telemetry, setTelemetry] = useState<ClientDeviceTelemetry | null>(
    null
  );
  const [editModalState, setEditModalState] = useState<{
    open: boolean;
    mode: "register" | "edit";
    device: TrustedDevice | null;
  }>({ open: false, mode: "register", device: null });
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [totpModalOpen, setTotpModalOpen] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [generatedStealthKey, setGeneratedStealthKey] = useState<string | null>(
    null
  );
  const [copiedPortalLink, setCopiedPortalLink] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    variant: "danger" | "warning" | "primary";
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    void collectClientDeviceTelemetry().then(setTelemetry);
  }, []);

  const securityQuery = useQuery<SafeSecuritySummary>({
    queryKey: ["admin-security-registry"],
    queryFn: async () => {
      const res = await fetch("/api/admin/devices");
      if (!res.ok) {
        throw new Error("Failed to load security registry.");
      }
      return (await res.json()) as SafeSecuritySummary;
    },
    staleTime: 10_000,
  });

  const summary = securityQuery.data;

  const refreshSecurityState = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["admin-security-registry"],
    });
    if (onSyncAuth) {
      await onSyncAuth();
    }
  }, [queryClient, onSyncAuth]);

  const handleCloseQrModal = useCallback(() => {
    setQrModalOpen(false);
  }, []);

  const handlePairedSuccess = useCallback(() => {
    void refreshSecurityState();
  }, [refreshSecurityState]);

  const syncLocalDeviceFlag = (registered: boolean) => {
    try {
      if (registered) {
        localStorage.setItem(DEVICE_STORAGE_KEY, "true");
      } else {
        localStorage.removeItem(DEVICE_STORAGE_KEY);
      }
      window.dispatchEvent(
        new CustomEvent(DEVICE_SYNC_EVENT, { detail: registered })
      );
    } catch {
      // Ignore storage failure
    }
  };

  const activeDevices = (summary?.devices || []).filter(
    (d) => d.status === "active"
  );
  const revokedDevices = (summary?.devices || []).filter(
    (d) => d.status === "revoked"
  );
  const currentDeviceRecord =
    activeDevices.find((d) => d.id === summary?.currentDeviceId) || null;

  const handleSaveDeviceMetadata = async (payload: { name: string }) => {
    setSavingDevice(true);
    try {
      if (editModalState.mode === "register") {
        const live = telemetry || (await collectClientDeviceTelemetry());
        const res = await fetch("/api/admin/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            telemetry: live,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          onFeedback?.({
            type: "error",
            message: data.error || "Failed to register this device.",
          });
          return;
        }
        syncLocalDeviceFlag(true);
        onFeedback?.(null);
        announceBrandPortalStatus({
          tone: "live",
          label: "Device Registered",
          detail: `"${payload.name}" added to trust list`,
          durationMs: 3200,
        });
      } else if (editModalState.device) {
        const res = await fetch("/api/admin/devices", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update-device",
            deviceId: editModalState.device.id,
            ...payload,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          onFeedback?.({
            type: "error",
            message: data.error || "Failed to update device details.",
          });
          return;
        }
        onFeedback?.(null);
        announceBrandPortalStatus({
          tone: "synced",
          label: "Device Updated",
          detail: `Renamed "${payload.name}"`,
          durationMs: 3000,
        });
      }

      setEditModalState({ open: false, mode: "register", device: null });
      await refreshSecurityState();
    } catch {
      onFeedback?.({
        type: "error",
        message: "Network error while saving device registration.",
      });
    } finally {
      setSavingDevice(false);
    }
  };

  const runDevicePatch = async (
    body: Record<string, unknown>,
    successMsg: string,
    key: string
  ) => {
    setBusyAction(key);
    try {
      const res = await fetch("/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onFeedback?.({
          type: "error",
          message: data.error || "Security update failed.",
        });
        return;
      }

      if (data.revokedCurrentDevice || data.removedCurrentDevice) {
        syncLocalDeviceFlag(false);
      }
      if (data.generatedStealthKey) {
        setGeneratedStealthKey(data.generatedStealthKey);
      }

      onFeedback?.(null);
      announceBrandPortalStatus({
        tone: "live",
        label: "Security Updated",
        detail: successMsg,
        durationMs: 3200,
      });
      await refreshSecurityState();
    } catch {
      onFeedback?.({
        type: "error",
        message: "Network error while applying security change.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const promptRevokeDevice = (device: TrustedDevice) => {
    const isSelf = device.id === summary?.currentDeviceId;
    setConfirmState({
      open: true,
      title: isSelf ? "Unregister Current Device?" : "Revoke Trusted Device?",
      description: isSelf
        ? `"${device.name}" will immediately lose Brand Portal shortcut access and must re-register later.`
        : `Revoking "${device.name}" (${device.model}) immediately invalidates its portal cookie and bound sessions.`,
      confirmLabel: isSelf ? "Unregister Device" : "Revoke Access",
      variant: "danger",
      onConfirm: async () => {
        setConfirmState(null);
        await runDevicePatch(
          { action: "revoke-device", deviceId: device.id },
          `Revoked trust for "${device.name}".`,
          `revoke-${device.id}`
        );
      },
    });
  };

  const promptRevokeOtherSessions = () => {
    setConfirmState({
      open: true,
      title: "Sign Out All Other Sessions?",
      description:
        "Rotates the global session epoch. Any other browser holding a 7-day admin cookie will be forced to sign in again immediately, while your current session stays active.",
      confirmLabel: "Rotate Sessions",
      variant: "warning",
      onConfirm: async () => {
        setConfirmState(null);
        await runDevicePatch(
          { action: "revoke-other-sessions" },
          "Session epoch rotated — all other admin sessions signed out.",
          "rotate-sessions"
        );
      },
    });
  };

  const promptToggleStealth = () => {
    const nextEnabled = !(summary?.stealthGateEnabled ?? false);
    setConfirmState({
      open: true,
      title: nextEnabled ? "Enable Stealth 404 Gate?" : "Disable Stealth 404 Gate?",
      description: nextEnabled
        ? "Unknown visitors hitting /admin without a trusted device cookie will receive a standard HTTP 404 page. Your trusted portal shortcut, QR pairing, and ?portal= link still unlock access."
        : "Visiting /admin directly in any browser will render the password sign-in prompt instead of returning HTTP 404.",
      confirmLabel: nextEnabled ? "Enable Stealth Gate" : "Disable Stealth Gate",
      variant: nextEnabled ? "warning" : "primary",
      onConfirm: async () => {
        setConfirmState(null);
        await runDevicePatch(
          { action: "toggle-stealth", stealthGateEnabled: nextEnabled },
          nextEnabled
            ? "Stealth 404 gate active on /admin"
            : "/admin direct login opened",
          "toggle-stealth"
        );
      },
    });
  };

  const portalRecoveryUrl =
    typeof window !== "undefined" && generatedStealthKey
      ? `${window.location.origin}/admin?portal=${encodeURIComponent(
          generatedStealthKey
        )}`
      : generatedStealthKey
        ? `/admin?portal=${encodeURIComponent(generatedStealthKey)}`
        : null;

  const copyRecoveryUrl = async () => {
    if (!portalRecoveryUrl) return;
    try {
      await navigator.clipboard.writeText(portalRecoveryUrl);
      setCopiedPortalLink(true);
      setTimeout(() => setCopiedPortalLink(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const renderDeviceIcon = (type: TrustedDevice["deviceType"]) => {
    if (type === "mobile") return <Smartphone className="w-4 h-4" />;
    if (type === "tablet") return <Tablet className="w-4 h-4" />;
    return <Laptop className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* 1. Current Browser / Device Telemetry & Registration */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Hardware & Key Identity"
          title="This Device & Portal Access"
          description="Combines platform telemetry and a non-extractable ECDSA P-256 browser keypair with the bottom-left LDV Brand Portal."
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="WebCrypto hardware identity"
                content="Generates an origin-bound ECDSA P-256 keypair inside your browser IndexedDB that cannot be exported or cloned to another machine."
              />
              <ShieldCheck className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        <div className="p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <div
                className={`w-10 h-10 rounded-sm border flex items-center justify-center shrink-0 ${
                  deviceRegistered
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : "bg-(--bg-surface) border-(--border-subtle) text-(--text-muted)"
                }`}
              >
                {deviceRegistered ? (
                  <MonitorCheck className="w-5 h-5" />
                ) : (
                  <MonitorOff className="w-5 h-5" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-(--text-primary) truncate">
                    {currentDeviceRecord?.name ||
                      telemetry?.suggestedName ||
                      "Current Browser Session"}
                  </span>
                  <StatusPill
                    label={deviceRegistered ? "Trusted Device" : "Unregistered"}
                    variant={deviceRegistered ? "success" : "neutral"}
                    size="xs"
                  />
                  {(currentDeviceRecord?.keyThumbprint ||
                    telemetry?.keyThumbprint) && (
                    <StatusPill
                      label={
                        currentDeviceRecord?.keyThumbprint ||
                        telemetry?.keyThumbprint ||
                        ""
                      }
                      variant="accent"
                      size="xs"
                    />
                  )}
                </div>

                <p className="text-[11px] font-mono text-(--text-muted) mt-1 truncate">
                  {currentDeviceRecord
                    ? `${currentDeviceRecord.model} · ${currentDeviceRecord.platform} ${currentDeviceRecord.osVersion} · ${currentDeviceRecord.browser}`
                    : telemetry
                      ? `${telemetry.model} · ${telemetry.platform} ${telemetry.osVersion} · ${telemetry.browser}`
                      : "Inspecting browser capabilities..."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {currentDeviceRecord ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setEditModalState({
                      open: true,
                      mode: "edit",
                      device: currentDeviceRecord,
                    })
                  }
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Details</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={togglingDevice}
                  onClick={() =>
                    setEditModalState({
                      open: true,
                      mode: "register",
                      device: null,
                    })
                  }
                >
                  <MonitorCheck className="w-3.5 h-3.5" />
                  <span>Register This Device</span>
                </Button>
              )}

              {deviceRegistered && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={togglingDevice}
                  onClick={() => {
                    if (currentDeviceRecord) {
                      promptRevokeDevice(currentDeviceRecord);
                    } else {
                      onToggleDevice();
                    }
                  }}
                >
                  <MonitorOff className="w-3.5 h-3.5" />
                  <span>Unregister</span>
                </Button>
              )}
            </div>
          </div>

          {/* Automatic Hardware / GPU / Display Telemetry Strip */}
          {(currentDeviceRecord || telemetry) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-(--border-subtle) text-[11px] font-mono">
              <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm px-3 py-2">
                <span className="text-[9px] uppercase tracking-wider text-(--text-muted) block">
                  Hardware &amp; OS
                </span>
                <span className="text-(--text-primary) truncate block">
                  {(currentDeviceRecord || telemetry)?.model || "Browser"}{" "}
                  · {(currentDeviceRecord || telemetry)?.platform || "Unknown"}{" "}
                  {(currentDeviceRecord || telemetry)?.osVersion || ""}
                </span>
              </div>
              <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm px-3 py-2">
                <span className="text-[9px] uppercase tracking-wider text-(--text-muted) block">
                  GPU Renderer
                </span>
                <span className="text-(--text-primary) truncate block">
                  {currentDeviceRecord?.gpuRenderer ||
                    telemetry?.gpuRenderer ||
                    "Standard WebGL / Auto"}
                </span>
              </div>
              <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm px-3 py-2">
                <span className="text-[9px] uppercase tracking-wider text-(--text-muted) block">
                  Display &amp; CPU
                </span>
                <span className="text-(--text-primary) truncate block">
                  {currentDeviceRecord?.screenMetrics ||
                    telemetry?.screenMetrics ||
                    "—"}
                  {(currentDeviceRecord?.cpuCores || telemetry?.cpuCores) &&
                    ` · ${
                      currentDeviceRecord?.cpuCores || telemetry?.cpuCores
                    } cores`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Trusted Devices Registry & Mobile QR Code Registration */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Device Inventory & Onboarding"
          title="Trusted Devices & Cross-Device Pairing"
          description="Monitor every laptop or mobile device trusting this portfolio CMS, edit metadata, or revoke access remotely."
          size="sm"
          rightSlot={
            <div className="flex flex-wrap items-center gap-2">
              <InfoTooltip
                label="How cross-device pairing works"
                content="Generates a short-lived 3-minute HMAC pairing link, QR code, and 6-digit PIN so you can trust another device without typing your master password in public."
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setQrModalOpen(true)}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Pair Device via QR / Link</span>
              </Button>
            </div>
          }
        />

        {securityQuery.isLoading ? (
          <div className="p-6 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) flex items-center justify-center gap-2.5 text-xs font-mono text-(--text-muted)">
            <Loader2 className="w-4 h-4 animate-spin text-(--text-accent)" />
            <span>Loading registered device inventory...</span>
          </div>
        ) : activeDevices.length === 0 ? (
          <div className="p-6 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) text-center space-y-3">
            <Users className="w-6 h-6 text-(--text-muted) mx-auto" />
            <div>
              <p className="text-sm font-semibold text-(--text-primary)">
                No Registered Devices Yet
              </p>
              <p className="text-xs text-(--text-muted) mt-1">
                Register this browser above or scan a QR code on your phone to build your server-verified trust list.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeDevices.map((device) => {
              const isCurrent = device.id === summary?.currentDeviceId;
              return (
                <div
                  key={device.id}
                  className="p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <span className="w-9.5 h-9.5 rounded-sm bg-(--bg-surface) border border-(--border-subtle) flex items-center justify-center shrink-0 text-(--text-accent)">
                      {renderDeviceIcon(device.deviceType)}
                    </span>

                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-(--text-primary) truncate">
                          {device.name}
                        </span>
                        {isCurrent && (
                          <StatusPill
                            label="This Browser"
                            variant="accent"
                            size="xs"
                          />
                        )}
                        <StatusPill
                          label={TRUST_SOURCE_LABELS[device.trustSource]}
                          variant={
                            device.trustSource === "qr-pair"
                              ? "success"
                              : "neutral"
                          }
                          size="xs"
                        />
                        {device.keyThumbprint && (
                          <StatusPill
                            label={device.keyThumbprint}
                            variant="neutral"
                            size="xs"
                          />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-(--text-muted)">
                        <span>
                          {device.model} · {device.platform} {device.osVersion} ·{" "}
                          {device.browser}
                        </span>
                        {device.gpuRenderer && (
                          <span className="truncate max-w-60">
                            GPU: {device.gpuRenderer}
                          </span>
                        )}
                        <span>IP: {device.ipMasked}</span>
                        <span suppressHydrationWarning>
                          Seen {new Date(device.lastSeenAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setEditModalState({
                          open: true,
                          mode: "edit",
                          device,
                        })
                      }
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={busyAction === `revoke-${device.id}`}
                      onClick={() => promptRevokeDevice(device)}
                    >
                      {busyAction === `revoke-${device.id}` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <MonitorOff className="w-3 h-3" />
                      )}
                      <span>{isCurrent ? "Unregister" : "Revoke"}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Revoked History Accordion */}
        {revokedDevices.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowRevoked((v) => !v)}
              className="text-[11px] font-mono text-(--text-muted) hover:text-(--text-primary) cursor-pointer transition-colors"
            >
              {showRevoked ? "Hide" : "Show"} {revokedDevices.length} revoked{" "}
              {revokedDevices.length === 1 ? "device" : "devices"}
            </button>

            <Collapsible open={showRevoked} contentClassName="pt-3">
              <div className="space-y-2">
                {revokedDevices.map((device) => (
                  <div
                    key={device.id}
                    className="p-3 rounded-sm bg-(--bg-surface) border border-(--border-subtle) flex items-center justify-between gap-3 text-xs opacity-75"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-(--text-primary) truncate">
                          {device.name}
                        </span>
                        <StatusPill
                          label="Revoked"
                          variant="danger"
                          size="xs"
                        />
                      </div>
                      <p className="text-[11px] font-mono text-(--text-muted) mt-0.5 truncate">
                        {device.model} · Revoked{" "}
                        <span suppressHydrationWarning>
                          {device.revokedAt
                            ? new Date(device.revokedAt).toLocaleString()
                            : "recently"}
                        </span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busyAction === `remove-${device.id}`}
                      onClick={() =>
                        void runDevicePatch(
                          { action: "remove-device", deviceId: device.id },
                          `Cleared "${device.name}" from device history.`,
                          `remove-${device.id}`
                        )
                      }
                      aria-label={`Remove revoked record for ${device.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-(--text-muted)" />
                    </Button>
                  </div>
                ))}
              </div>
            </Collapsible>
          </div>
        )}
      </div>

      {/* 3. /admin Stealth Gate (404 Block for Unregistered Browsers) & Session Epoch */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 space-y-5"
      >
        <SectionHeader
          eyebrow="Stealth Route & Session Control"
          title="Stealth Gate & Global Sessions"
          description="Hide /admin behind a 404 page for unknown browsers, rotate session epochs across all logins, and enforce rate limits."
          size="sm"
          rightSlot={
            <div className="flex items-center gap-2">
              <InfoTooltip
                label="Stealth 404 Gate & Session Epoch"
                content="Stealth Gate disguises /admin as HTTP 404 unless a trusted device cookie or secret ?portal= token is presented. Rotating sessions invalidates all other logged-in cookies immediately."
              />
              <EyeOff className="w-5 h-5 text-(--text-accent)" />
            </div>
          }
        />

        {/* Stealth Gate Card */}
        <div className="p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-(--text-primary)">
                  Block Unregistered Browsers on /admin URL
                </span>
                <StatusPill
                  label={
                    summary?.stealthGateEnabled
                      ? "Stealth Active (404)"
                      : "Direct Login Open"
                  }
                  variant={summary?.stealthGateEnabled ? "success" : "neutral"}
                  size="xs"
                />
              </div>
              <p className="text-[11px] text-(--text-muted)">
                When enabled and at least 1 device is registered, unknown visitors opening <code className="font-mono">/admin</code> get HTTP 404. Use your Brand Portal, QR pairing, or secret <code className="font-mono">?portal=</code> link to access.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {summary?.stealthGateEnabled && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyAction === "regen-stealth"}
                  onClick={() =>
                    void runDevicePatch(
                      { action: "regenerate-stealth-key" },
                      "Generated new ?portal= emergency recovery key.",
                      "regen-stealth"
                    )
                  }
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Rotate Bypass Key</span>
                </Button>
              )}
              <Button
                type="button"
                variant={summary?.stealthGateEnabled ? "secondary" : "primary"}
                size="sm"
                disabled={busyAction === "toggle-stealth"}
                onClick={promptToggleStealth}
              >
                {busyAction === "toggle-stealth" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                <span>
                  {summary?.stealthGateEnabled
                    ? "Disable Stealth Gate"
                    : "Enable Stealth 404 Gate"}
                </span>
              </Button>
            </div>
          </div>

          {summary?.stealthGateEnabled && activeDevices.length === 0 && (
            <div className="p-3 rounded-sm bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Anti-lockout guard active: register at least 1 trusted device above before the 404 gate starts blocking unregistered browsers.
              </span>
            </div>
          )}

          {portalRecoveryUrl && (
            <div className="p-3.5 rounded-sm bg-emerald-500/10 border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 font-semibold">
                  <KeyRound className="w-3.5 h-3.5" />
                  Save Your Secret Bypass Link (Shown Once)
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void copyRecoveryUrl()}
                >
                  {copiedPortalLink ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy URL</span>
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs font-mono text-(--text-primary) break-all bg-(--bg-surface) border border-(--border-subtle) rounded-sm px-3 py-2">
                {portalRecoveryUrl}
              </p>
              <p className="text-[11px] text-(--text-muted)">
                Bookmark this URL or set <code className="font-mono">ADMIN_STEALTH_KEY</code> in environment variables so you can always recover access if all browser cookies are cleared.
              </p>
            </div>
          )}
        </div>

        {/* Authenticator App 2FA (TOTP) Card */}
      <div className="p-5 sm:p-6 rounded-(--radius-card) bg-(--bg-surface-1) border border-(--border-subtle) flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-sm font-semibold text-(--text-primary)">
              Authenticator App 2FA (Offline TOTP)
            </h3>
            <StatusPill
              label={
                summary?.totpEnabled
                  ? "2FA Active (Offline TOTP)"
                  : "Not Configured"
              }
              variant={summary?.totpEnabled ? "success" : "neutral"}
              size="xs"
            />
          </div>
          <p className="text-xs text-(--text-secondary) leading-relaxed max-w-2xl">
            Require a rotating 6-digit RFC 6238 verification code from Google Authenticator, 1Password, or Bitwarden whenever signing into this CMS with your master password. Works offline with AES-256-GCM encryption at rest.
          </p>
        </div>
        <div className="shrink-0">
          <Button
            type="button"
            variant={summary?.totpEnabled ? "outline" : "primary"}
            size="sm"
            onClick={() => setTotpModalOpen(true)}
          >
            <span>
              {summary?.totpEnabled ? "Manage / Disable 2FA" : "Enable Authenticator 2FA"}
            </span>
          </Button>
        </div>
      </div>

      {/* Session Epoch & Sign Out Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted)">
                Session Epoch &amp; Rate Limit
              </span>
              <StatusPill
                label={`Epoch #${summary?.sessionEpoch ?? 1}`}
                variant="neutral"
                size="xs"
              />
            </div>
            <p className="text-xs font-mono text-(--text-primary)">
              7-day HMAC Cookie · 5-try / 15m login lockout
            </p>
            <p className="text-[11px] text-(--text-muted)">
              Password updates automatically rotate the global epoch across every device.
            </p>
          </div>

          <div className="p-4 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-(--text-muted)">
                Search Engine Crawlers (SEO)
              </span>
              <StatusPill label="noindex + robots.txt" variant="success" size="xs" />
            </div>
            <p className="text-xs font-mono text-(--text-primary)">
              /admin &amp; /admin/pair blocked from indexing
            </p>
            <p className="text-[11px] text-(--text-muted)">
              Protected via robots.ts Disallow rules and page robots directives.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-(--border-subtle)">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busyAction === "rotate-sessions"}
            onClick={promptRevokeOtherSessions}
          >
            {busyAction === "rotate-sessions" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sign Out All Other Devices</span>
          </Button>

          {deviceRegistered && (
            <Button
              type="button"
              onClick={() => void onLogout(true)}
              variant="secondary"
              size="sm"
            >
              <MonitorOff className="w-3.5 h-3.5 text-(--text-accent)" />
              <span>Sign Out &amp; Unregister Device</span>
            </Button>
          )}

          <Button
            type="button"
            onClick={() => void onLogout(false)}
            variant="danger"
            size="sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out Session</span>
          </Button>
        </div>
      </div>

      {/* 4. Security Activity Audit Feed */}
      <SecurityAuditFeed events={summary?.auditLog || []} />

      {/* Modals */}
      <DeviceEditModal
        open={editModalState.open}
        mode={editModalState.mode}
        targetDevice={editModalState.device}
        liveTelemetry={telemetry}
        saving={savingDevice}
        onClose={() =>
          setEditModalState({ open: false, mode: "register", device: null })
        }
        onSubmit={handleSaveDeviceMetadata}
      />

      <QrDevicePairModal
        open={qrModalOpen}
        onClose={handleCloseQrModal}
        onPairedSuccess={handlePairedSuccess}
      />

      <TotpSetupModal
        open={totpModalOpen}
        totpEnabled={Boolean(summary?.totpEnabled)}
        onClose={() => setTotpModalOpen(false)}
        onUpdated={refreshSecurityState}
      />

      {confirmState && (
        <ConfirmModal
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
