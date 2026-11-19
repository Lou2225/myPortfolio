"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Fingerprint,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { InfoTooltip } from "@/components/ui/Tooltip";
import {
  ClientRecognitionHealth,
  inspectDeviceRecognitionHealth,
  requestPersistentDeviceStorage,
} from "@/lib/deviceTelemetry";
import { checkPlatformPasskeySupport } from "@/lib/passkeyClient";
import type { DevicePasskey, TrustedDevice } from "@/types/security";

export interface RecognitionHealthCardProps {
  deviceRegistered: boolean;
  currentDeviceRecord: TrustedDevice | null;
  passkeys?: DevicePasskey[];
  onRepairSync?: () => Promise<void> | void;
  repairing?: boolean;
  onLinkPasskey?: () => Promise<void> | void;
  linkingPasskey?: boolean;
  onRemovePasskey?: (passkey: DevicePasskey) => void;
  removingPasskeyId?: string | null;
}

export function RecognitionHealthCard({
  deviceRegistered,
  currentDeviceRecord,
  passkeys = [],
  onRepairSync,
  repairing = false,
  onLinkPasskey,
  linkingPasskey = false,
  onRemovePasskey,
  removingPasskeyId = null,
}: RecognitionHealthCardProps) {
  const [health, setHealth] = useState<ClientRecognitionHealth | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [requestingPersist, setRequestingPersist] = useState(false);

  const refreshHealth = useCallback(async () => {
    const [snapshot, pkSupport] = await Promise.all([
      inspectDeviceRecognitionHealth(),
      checkPlatformPasskeySupport(),
    ]);
    setHealth(snapshot);
    setPasskeySupported(pkSupport.supported);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      inspectDeviceRecognitionHealth(),
      checkPlatformPasskeySupport(),
    ]).then(([snapshot, pkSupport]) => {
      if (!cancelled) {
        setHealth(snapshot);
        setPasskeySupported(pkSupport.supported);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deviceRegistered, currentDeviceRecord?.id, currentDeviceRecord?.keyThumbprint]);

  const handleRequestPersist = async () => {
    setRequestingPersist(true);
    try {
      await requestPersistentDeviceStorage();
      await refreshHealth();
    } finally {
      setRequestingPersist(false);
    }
  };

  if (!health) {
    return null;
  }

  const serverThumbprint = currentDeviceRecord?.keyThumbprint || null;
  const keySyncedWithServer = Boolean(
    deviceRegistered &&
      health.hasIndexedDbKey &&
      health.keyThumbprint &&
      serverThumbprint === health.keyThumbprint
  );

  const needsKeyRepair =
    deviceRegistered &&
    health.secureContext &&
    (!health.hasIndexedDbKey ||
      !serverThumbprint ||
      serverThumbprint !== health.keyThumbprint);

  const currentDevicePasskeys = currentDeviceRecord
    ? passkeys.filter(
        (pk) =>
          pk.deviceId === currentDeviceRecord.id &&
          (!health.hostname || pk.rpId === health.hostname.toLowerCase())
      )
    : [];

  return (
    <div className="pt-3.5 border-t border-(--border-subtle) space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-(--text-muted)">
            Recognition Health &amp; Hardware Passkey Link
          </span>
          <InfoTooltip
            label="How multi-layer device recognition works"
            content="Combines a rolling 365-day cookie, an IndexedDB ECDSA recovery key, and an OS-level WebAuthn Passkey (Windows Hello / Face ID / Android Biometrics) so your physical device is recognized across every browser and even after clearing cookies."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {passkeySupported && onLinkPasskey && (
            <Button
              type="button"
              variant={currentDevicePasskeys.length === 0 ? "primary" : "secondary"}
              size="sm"
              disabled={linkingPasskey}
              onClick={() => void onLinkPasskey()}
              className="h-7 px-2.5 text-[11px]"
            >
              {linkingPasskey ? (
                <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
              ) : (
                <Fingerprint className="w-3 h-3 shrink-0" />
              )}
              <span>
                {linkingPasskey
                  ? "Waiting for Biometrics..."
                  : currentDevicePasskeys.length === 0
                    ? "Link Hardware Passkey"
                    : "Add Passkey"}
              </span>
            </Button>
          )}

          {health.storagePersisted === false && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={requestingPersist}
              onClick={() => void handleRequestPersist()}
              className="h-7 px-2.5 text-[11px]"
            >
              <Database className="w-3 h-3 shrink-0" />
              <span>
                {requestingPersist ? "Requesting..." : "Lock Browser Storage"}
              </span>
            </Button>
          )}

          {needsKeyRepair && onRepairSync && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={repairing}
              onClick={async () => {
                await onRepairSync();
                await refreshHealth();
              }}
              className="h-7 px-2.5 text-[11px]"
            >
              <RefreshCw
                className={`w-3 h-3 shrink-0 ${repairing ? "animate-spin" : ""}`}
              />
              <span>{repairing ? "Syncing Key..." : "Sync Recovery Key"}</span>
            </Button>
          )}
        </div>
      </div>

      {health.isPreviewHost && (
        <div className="flex items-start gap-2.5 p-2.5 rounded-(--radius-control) bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="min-w-0 leading-relaxed">
            <span className="font-semibold">Preview URL Detected:</span> You are
            signed in on{" "}
            <code className="font-mono text-[11px]">{health.hostname}</code>.
            Cookies and device keys registered here are isolated from{" "}
            <code className="font-mono text-[11px]">
              louvaldellon.vercel.app
            </code>
            .
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] font-mono">
        {/* 1. Active Origin & Secure Context */}
        <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-3 py-2 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) flex items-center gap-1">
              <Globe className="w-3 h-3 text-(--text-accent)" />
              Origin Scope
            </span>
            <StatusPill
              label={health.secureContext ? "TLS / Secure" : "Plain HTTP"}
              variant={health.secureContext ? "success" : "warning"}
              size="xs"
            />
          </div>
          <span
            className="text-(--text-primary) truncate block"
            title={health.origin}
          >
            {health.hostname || "localhost"}
          </span>
        </div>

        {/* 2. Server Cookie & Registry Link */}
        <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-3 py-2 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-(--text-accent)" />
              Portal Cookie
            </span>
            <StatusPill
              label={deviceRegistered ? "Active (365d)" : "Not Set"}
              variant={deviceRegistered ? "success" : "neutral"}
              size="xs"
            />
          </div>
          <span className="text-(--text-primary) truncate block">
            {currentDeviceRecord
              ? `ID: ${currentDeviceRecord.id}`
              : deviceRegistered
                ? "Bound to session"
                : "Sign in or register"}
          </span>
        </div>

        {/* 3. WebCrypto ECDSA P-256 Silent Recovery Key */}
        <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-3 py-2 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) flex items-center gap-1">
              <KeyRound className="w-3 h-3 text-(--text-accent)" />
              Recovery Key
            </span>
            <StatusPill
              label={
                keySyncedWithServer
                  ? "Synced"
                  : health.hasIndexedDbKey
                    ? "Local Only"
                    : health.secureContext
                      ? "Missing"
                      : "Unavailable"
              }
              variant={
                keySyncedWithServer
                  ? "success"
                  : health.hasIndexedDbKey
                    ? "warning"
                    : "neutral"
              }
              size="xs"
            />
          </div>
          <span className="text-(--text-primary) truncate block">
            {health.keyThumbprint || "No IndexedDB ECDSA key"}
          </span>
        </div>

        {/* 4. Eviction Protection & Local Hint */}
        <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-3 py-2 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) flex items-center gap-1">
              {health.storagePersisted ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ) : (
                <Database className="w-3 h-3 text-(--text-accent)" />
              )}
              Storage Lock
            </span>
            <StatusPill
              label={
                health.storagePersisted === true
                  ? "Protected"
                  : health.storagePersisted === false
                    ? "Best-Effort"
                    : "Standard"
              }
              variant={health.storagePersisted === true ? "success" : "neutral"}
              size="xs"
            />
          </div>
          <span className="text-(--text-primary) truncate block">
            Orb Hint: {health.localHintCached ? "Cached" : "Uncached"}
          </span>
        </div>
      </div>

      {/* Enrolled OS / Hardware Passkeys for Current Device */}
      {currentDevicePasskeys.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {currentDevicePasskeys.map((pk) => (
            <div
              key={pk.credentialId}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-(--radius-control) bg-(--bg-surface) border border-emerald-500/25 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Fingerprint className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-(--text-primary) truncate">
                      {pk.authenticatorLabel}
                    </span>
                    <StatusPill
                      label={pk.backedUp ? "Synced Passkey" : "Hardware-Bound"}
                      variant={pk.backedUp ? "accent" : "success"}
                      size="xs"
                    />
                  </div>
                  <p className="text-[10px] font-mono text-(--text-muted) truncate">
                    Domain: {pk.rpId} ·{" "}
                    {pk.lastUsedAt
                      ? `Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`
                      : `Linked ${new Date(pk.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
              </div>

              {onRemovePasskey && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removingPasskeyId === pk.credentialId}
                  onClick={() => onRemovePasskey(pk)}
                  aria-label={`Remove ${pk.authenticatorLabel} passkey`}
                  className="h-7 px-2 text-[11px] text-(--text-muted) hover:text-rose-400"
                >
                  {removingPasskeyId === pk.credentialId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Remove</span>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
