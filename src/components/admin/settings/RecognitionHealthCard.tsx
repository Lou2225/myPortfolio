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
import { InfoTooltip } from "@/components/ui/Tooltip";
import {
  ClientRecognitionHealth,
  getInitialRecognitionHealthSnapshot,
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
  const [health, setHealth] = useState<ClientRecognitionHealth | null>(() =>
    getInitialRecognitionHealthSnapshot(currentDeviceRecord?.keyThumbprint)
  );
  const [passkeySupported, setPasskeySupported] = useState(true);
  const [platformBioReady, setPlatformBioReady] = useState<boolean | null>(
    null
  );
  const [requestingPersist, setRequestingPersist] = useState(false);

  const refreshHealth = useCallback(async () => {
    const [snapshot, pkSupport] = await Promise.all([
      inspectDeviceRecognitionHealth(),
      checkPlatformPasskeySupport(),
    ]);
    setHealth(snapshot);
    setPasskeySupported(pkSupport.supported);
    setPlatformBioReady(pkSupport.platformAuthenticatorAvailable);
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
        setPlatformBioReady(pkSupport.platformAuthenticatorAvailable);
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
      (serverThumbprint === health.keyThumbprint ||
        Boolean(currentDeviceRecord?.browserKeys?.[health.keyThumbprint]))
  );

  const needsKeyRepair =
    deviceRegistered &&
    health.secureContext &&
    !keySyncedWithServer;

  const currentDevicePasskeys = currentDeviceRecord
    ? passkeys.filter(
        (pk) =>
          pk.deviceId === currentDeviceRecord.id &&
          (!health.hostname || pk.rpId === health.hostname.toLowerCase())
      )
    : [];

  const hasHeaderActions =
    (currentDevicePasskeys.length === 0 &&
      passkeySupported &&
      Boolean(onLinkPasskey)) ||
    health.storagePersisted === false ||
    (needsKeyRepair && Boolean(onRepairSync));

  return (
    <div className="pt-3.5 border-t border-(--border-subtle) space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-(--text-muted) truncate">
            Recognition Health &amp; Hardware Passkey
          </span>
          <InfoTooltip
            label="How multi-layer device recognition works"
            content="Combines a rolling 365-day cookie, an IndexedDB ECDSA recovery key, and an OS-level WebAuthn Passkey (Windows Hello / Face ID / Android Biometrics) so your physical device is recognized across every browser and even after clearing cookies."
          />
        </div>

        {hasHeaderActions && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {currentDevicePasskeys.length === 0 &&
              passkeySupported &&
              onLinkPasskey && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={linkingPasskey}
                  onClick={() => void onLinkPasskey()}
                  className="flex-1 sm:flex-none h-8 sm:h-7 px-2.5 text-[11px]"
                >
                  {linkingPasskey ? (
                    <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                  ) : (
                    <Fingerprint className="w-3 h-3 shrink-0" />
                  )}
                  <span>
                    {linkingPasskey
                      ? "Waiting for Biometrics..."
                      : "Link Hardware Passkey"}
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
                className="flex-1 sm:flex-none h-8 sm:h-7 px-2.5 text-[11px]"
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
                className="flex-1 sm:flex-none h-8 sm:h-7 px-2.5 text-[11px]"
              >
                <RefreshCw
                  className={`w-3 h-3 shrink-0 ${repairing ? "animate-spin" : ""}`}
                />
                <span>{repairing ? "Syncing Key..." : "Sync Recovery Key"}</span>
              </Button>
            )}
          </div>
        )}
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] font-mono">
        {/* 1. Active Origin & Secure Context */}
        <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-2.5 py-2 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) flex items-center gap-1 truncate">
              <Globe className="w-3 h-3 text-(--text-accent) shrink-0" />
              <span className="truncate">Origin</span>
            </span>
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) shrink-0">
              {health.secureContext ? "TLS" : "HTTP"}
            </span>
          </div>
          <span
            className="text-(--text-primary) truncate block"
            title={health.origin}
          >
            {health.hostname || "localhost"}
          </span>
        </div>

        {/* 2. Server Cookie & Registry Link */}
        <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-2.5 py-2 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) flex items-center gap-1 truncate">
              <ShieldCheck className="w-3 h-3 text-(--text-accent) shrink-0" />
              <span className="truncate">Cookie</span>
            </span>
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) shrink-0">
              {deviceRegistered ? "365d" : "Off"}
            </span>
          </div>
          <span className="text-(--text-primary) truncate block">
            {currentDeviceRecord
              ? currentDeviceRecord.id
              : deviceRegistered
                ? "Bound to session"
                : "Not registered"}
          </span>
        </div>

        {/* 3. WebCrypto ECDSA P-256 Silent Recovery Key */}
        <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-2.5 py-2 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) flex items-center gap-1 truncate">
              <KeyRound className="w-3 h-3 text-(--text-accent) shrink-0" />
              <span className="truncate">ECDSA Key</span>
            </span>
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) shrink-0">
              {keySyncedWithServer
                ? "Synced"
                : health.hasIndexedDbKey
                  ? "Local"
                  : "None"}
            </span>
          </div>
          <span className="text-(--text-primary) truncate block">
            {health.keyThumbprint || "No local key"}
          </span>
        </div>

        {/* 4. Eviction Protection & Local Hint */}
        <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-2.5 py-2 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) flex items-center gap-1 truncate">
              {health.storagePersisted ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <Database className="w-3 h-3 text-(--text-accent) shrink-0" />
              )}
              <span className="truncate">Storage</span>
            </span>
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted) shrink-0">
              {health.storagePersisted === true ? "Locked" : "Standard"}
            </span>
          </div>
          <span className="text-(--text-primary) truncate block">
            Orb: {health.localHintCached ? "Cached" : "Uncached"}
          </span>
        </div>
      </div>

      {/* Enrolled OS / Hardware Passkeys for Current Device */}
      {currentDevicePasskeys.length > 0 ? (
        <div className="space-y-1.5 pt-1">
          {currentDevicePasskeys.map((pk) => (
            <div
              key={pk.credentialId}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-(--radius-control) bg-(--bg-surface) border border-emerald-500/25 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Fingerprint className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-(--text-primary) truncate">
                    {pk.authenticatorLabel}
                  </p>
                  <p className="text-[10px] font-mono text-(--text-muted) truncate">
                    {pk.backedUp ? "Synced Passkey" : "Hardware-Bound"} ·{" "}
                    {pk.rpId} ·{" "}
                    {pk.lastUsedAt
                      ? `Used ${new Date(pk.lastUsedAt).toLocaleDateString()}`
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
                  className="h-7 px-2 text-[11px] text-(--text-muted) hover:text-rose-400 shrink-0"
                >
                  {removingPasskeyId === pk.credentialId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden min-[380px]:inline">Remove</span>
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        passkeySupported && (
          <div className="px-3 py-2.5 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) text-[11px] text-(--text-muted) leading-relaxed">
            <span className="font-semibold text-(--text-primary)">
              Where to set your Biometrics or PIN:
            </span>{" "}
            Passkeys use your device&apos;s built-in OS lock —{" "}
            <strong className="text-(--text-secondary)">
              Windows Settings (Win + I) &rarr; Accounts &rarr; Sign-in options
              &rarr; PIN (Windows Hello)
            </strong>{" "}
            on Windows, or{" "}
            <strong className="text-(--text-secondary)">
              Face ID / Touch ID / Screen Lock Fingerprint
            </strong>{" "}
            on mobile.
            {platformBioReady === false && (
              <span className="block mt-1 text-amber-300">
                Note: Windows Hello PIN is not currently enabled on this
                Windows account, so clicking &ldquo;Link Hardware Passkey&rdquo;
                will offer your phone QR or browser passkey manager until you
                enable a Windows Hello PIN.
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
}
