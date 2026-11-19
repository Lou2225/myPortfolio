import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import {
  buildSupabaseHeaders,
  getStorageMode,
  resolveLocalDataDir,
  StorageReadError,
  StorageWriteError,
} from "@/lib/db";
import { extractNormalizedClientIp } from "@/lib/rateLimit";
import { parseUserAgentSummary } from "@/lib/deviceTelemetry";
import type {
  AdminSecurityStore,
  ClientDeviceTelemetry,
  DevicePasskey,
  DeviceTrustSource,
  PairingChallenge,
  SafeSecuritySummary,
  SecurityAuditEvent,
  TrustedDevice,
} from "@/types/security";

function getLocalSecurityFile(): string {
  return path.join(resolveLocalDataDir(), "admin-security.json");
}

const SUPABASE_SECURITY_ROW_ID = "admin_security";

const MAX_AUDIT_ENTRIES = 100;
const MAX_PAIRING_ENTRIES = 20;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

const MAX_MUTATION_ATTEMPTS = 4;

export interface InternalAdminSecurityStore extends AdminSecurityStore {
  /**
   * Monotonic optimistic-concurrency revision. Every successful write increments it,
   * and Supabase writes are conditional on the revision that was read, so parallel
   * serverless instances can never silently overwrite each other's device records.
   */
  revision: number;
  stealthKeyHash: string | null;
  totpEnabled: boolean;
  totpSecretEnc: string | null;
  totpPendingSecretEnc: string | null;
  totpLastStepUsed: number | null;
  passkeys: DevicePasskey[];
}

/**
 * Raised when a conditional (compare-and-swap) security write keeps losing the race
 * against concurrent writers after all retry attempts.
 */
export class SecurityStoreConflictError extends StorageWriteError {
  constructor(message = "Security registry is being updated concurrently. Please retry.") {
    super(message);
    this.name = "SecurityStoreConflictError";
  }
}

interface SecurityStoreSnapshotMeta {
  /** Whether the persisted row / file already exists. */
  exists: boolean;
  /** Raw persisted revision (`null` for legacy payloads written before revisions existed). */
  revision: number | null;
}

// In-process async write queue so concurrent security updates within one instance stay ordered
let securityWriteQueue: Promise<unknown> = Promise.resolve();

export function getDefaultSecurityStore(): InternalAdminSecurityStore {
  return {
    revision: 0,
    sessionEpoch: 1,
    stealthGateEnabled: false,
    stealthKeyHash: null,
    totpEnabled: false,
    totpSecretEnc: null,
    totpPendingSecretEnc: null,
    totpLastStepUsed: null,
    devices: [],
    passkeys: [],
    pairings: [],
    auditLog: [],
    loginFailures: {},
    updatedAt: new Date().toISOString(),
  };
}

function normalizeStore(
  raw: Partial<InternalAdminSecurityStore> | null | undefined
): InternalAdminSecurityStore {
  const base = getDefaultSecurityStore();
  if (!raw) return base;

  const now = Date.now();
  const pairings = Array.isArray(raw.pairings)
    ? raw.pairings.map((p): PairingChallenge => {
        if (
          (p.status === "pending" || p.status === "awaiting_approval") &&
          new Date(p.expiresAt).getTime() <= now
        ) {
          return { ...p, status: "expired" };
        }
        return p;
      })
    : [];

  const rawDevices = Array.isArray(raw.devices) ? raw.devices : [];
  const seenActiveThumbprints = new Set<string>();
  const seenActiveFallbackProfiles = new Set<string>();
  const deduplicatedDevices: TrustedDevice[] = [];

  for (const d of rawDevices) {
    if (d.status === "active") {
      if (d.keyThumbprint) {
        if (seenActiveThumbprints.has(d.keyThumbprint)) {
          continue;
        }
        seenActiveThumbprints.add(d.keyThumbprint);
      } else {
        const profileKey = `${d.userAgent}|${d.platform}|${d.model}|${d.screenMetrics || ""}`;
        if (seenActiveFallbackProfiles.has(profileKey)) {
          continue;
        }
        seenActiveFallbackProfiles.add(profileKey);
      }
    }
    deduplicatedDevices.push(d);
  }

  return {
    revision:
      typeof raw.revision === "number" && raw.revision >= 0
        ? Math.floor(raw.revision)
        : 0,
    sessionEpoch:
      typeof raw.sessionEpoch === "number" && raw.sessionEpoch >= 1
        ? Math.floor(raw.sessionEpoch)
        : 1,
    stealthGateEnabled: Boolean(raw.stealthGateEnabled),
    stealthKeyHash:
      typeof raw.stealthKeyHash === "string" && raw.stealthKeyHash.length > 0
        ? raw.stealthKeyHash
        : null,
    totpEnabled: Boolean(raw.totpEnabled && raw.totpSecretEnc),
    totpSecretEnc:
      typeof raw.totpSecretEnc === "string" && raw.totpSecretEnc.length > 0
        ? raw.totpSecretEnc
        : null,
    totpPendingSecretEnc:
      typeof raw.totpPendingSecretEnc === "string" &&
      raw.totpPendingSecretEnc.length > 0
        ? raw.totpPendingSecretEnc
        : null,
    totpLastStepUsed:
      typeof raw.totpLastStepUsed === "number" ? raw.totpLastStepUsed : null,
    devices: deduplicatedDevices,
    passkeys: Array.isArray(raw.passkeys) ? raw.passkeys : [],
    pairings: pairings.slice(0, MAX_PAIRING_ENTRIES),
    auditLog: Array.isArray(raw.auditLog)
      ? raw.auditLog.slice(0, MAX_AUDIT_ENTRIES)
      : [],
    loginFailures:
      raw.loginFailures && typeof raw.loginFailures === "object"
        ? raw.loginFailures
        : {},
    updatedAt: raw.updatedAt || base.updatedAt,
  };
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function constantTimeHashEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function maskIpAddress(rawIp: string): string {
  const ip = rawIp.trim();
  if (!ip) return "Unknown IP";
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return "Localhost Loopback";
  }

  const normalized = ip.replace(/^::ffff:/i, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    const parts = normalized.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  }

  if (normalized.includes(":")) {
    const parts = normalized.split(":").filter(Boolean);
    return `${parts.slice(0, 3).join(":")}::*`;
  }

  return "Protected Network";
}

export function extractRequestNetworkInfo(headers: Headers): {
  ipMasked: string;
  ipRateKey: string;
  userAgent: string;
  isLoopback: boolean;
  localHostname: string | null;
} {
  const normalized = extractNormalizedClientIp(headers);
  const userAgent = (headers.get("user-agent") || "Unknown Client").slice(
    0,
    300
  );

  const isLoopback = normalized === "127.0.0.1" || normalized === "::1";

  let localHostname: string | null = null;
  if (isLoopback) {
    try {
      localHostname = os.hostname() || null;
    } catch {
      localHostname = null;
    }
  }

  return {
    ipMasked: maskIpAddress(normalized),
    ipRateKey: sha256Hex(normalized).slice(0, 16),
    userAgent,
    isLoopback,
    localHostname,
  };
}

async function readAdminSecurityStoreWithMeta(): Promise<{
  store: InternalAdminSecurityStore;
  meta: SecurityStoreSnapshotMeta;
}> {
  if (getStorageMode() === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new StorageReadError(
        "Supabase storage environment variables are not configured."
      );
    }

    let res: Response;
    try {
      res = await fetch(
        `${url}/rest/v1/portfolio_store?id=eq.${SUPABASE_SECURITY_ROW_ID}&select=payload`,
        {
          headers: buildSupabaseHeaders(key),
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        }
      );
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Network request failed";
      throw new StorageReadError(
        `Unable to reach Supabase security store (${detail}).`
      );
    }

    if (!res.ok) {
      throw new StorageReadError(
        `Failed to read security registry from Supabase (HTTP ${res.status}).`
      );
    }

    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0 && rows[0]?.payload) {
      const rawPayload = rows[0].payload as Partial<InternalAdminSecurityStore>;
      const rawRevision =
        typeof rawPayload.revision === "number" && rawPayload.revision >= 0
          ? Math.floor(rawPayload.revision)
          : null;
      return {
        store: normalizeStore(rawPayload),
        meta: {
          exists: true,
          revision: rawRevision,
        },
      };
    }
    return {
      store: getDefaultSecurityStore(),
      meta: {
        exists: false,
        revision: null,
      },
    };
  }

  const filePath = getLocalSecurityFile();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<InternalAdminSecurityStore>;
      const rawRevision =
        typeof parsed.revision === "number" && parsed.revision >= 0
          ? Math.floor(parsed.revision)
          : null;
      return {
        store: normalizeStore(parsed),
        meta: {
          exists: true,
          revision: rawRevision,
        },
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        return {
          store: getDefaultSecurityStore(),
          meta: {
            exists: false,
            revision: null,
          },
        };
      }
      const isTransientWindowsLock =
        code === "EBUSY" ||
        code === "EPERM" ||
        code === "EACCES" ||
        err instanceof SyntaxError;
      if (isTransientWindowsLock && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
        continue;
      }
      throw new StorageReadError("Unable to read local security registry.");
    }
  }
  throw new StorageReadError("Unable to read local security registry.");
}

export async function readAdminSecurityStore(): Promise<InternalAdminSecurityStore> {
  const { store } = await readAdminSecurityStoreWithMeta();
  return store;
}

async function writeAdminSecurityStoreConditional(
  store: InternalAdminSecurityStore,
  meta: SecurityStoreSnapshotMeta
): Promise<
  | { ok: true; store: InternalAdminSecurityStore }
  | { ok: false; conflict: true }
> {
  const nextRevision = (meta.revision ?? store.revision ?? 0) + 1;
  const nowIso = new Date().toISOString();
  const next = normalizeStore({
    ...store,
    revision: nextRevision,
    updatedAt: nowIso,
  });

  const mode = getStorageMode();
  if (mode === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new StorageWriteError(
        "Supabase storage environment variables are not configured."
      );
    }

    let res: Response;
    try {
      if (!meta.exists) {
        // Atomic first-time insert: fails with 409 if another instance created the row concurrently
        res = await fetch(`${url}/rest/v1/portfolio_store`, {
          method: "POST",
          headers: buildSupabaseHeaders(key, {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          }),
          body: JSON.stringify({
            id: SUPABASE_SECURITY_ROW_ID,
            payload: next,
            updated_at: nowIso,
          }),
        });

        if (res.status === 409) {
          return { ok: false, conflict: true };
        }
      } else {
        // Optimistic concurrency compare-and-swap (CAS) on the JSON revision we read.
        // Legacy rows saved before `revision` existed (meta.revision === null) upgrade directly by row id.
        const patchQuery =
          meta.revision !== null
            ? `id=eq.${SUPABASE_SECURITY_ROW_ID}&payload->>revision=eq.${meta.revision}`
            : `id=eq.${SUPABASE_SECURITY_ROW_ID}`;

        res = await fetch(
          `${url}/rest/v1/portfolio_store?${patchQuery}`,
          {
            method: "PATCH",
            headers: buildSupabaseHeaders(key, {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            }),
            body: JSON.stringify({
              payload: next,
              updated_at: nowIso,
            }),
          }
        );
      }
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Network request failed";
      throw new StorageWriteError(
        `Unable to reach Supabase PostgreSQL (${detail}).`
      );
    }

    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const txt = (await res.text()).trim();
        if (txt) reason = `${reason}: ${txt.slice(0, 160)}`;
      } catch {
        // ignore text parse failure
      }
      throw new StorageWriteError(
        `Failed to update security registry in Supabase (${reason}).`
      );
    }

    const updatedRows = await res.json().catch(() => null);
    if (Array.isArray(updatedRows) && updatedRows.length === 0) {
      return { ok: false, conflict: true };
    }
  }

  try {
    await fs.mkdir(resolveLocalDataDir(), { recursive: true });
    await fs.writeFile(
      getLocalSecurityFile(),
      JSON.stringify(next, null, 2),
      "utf-8"
    );
  } catch (err) {
    if (mode === "local-json") {
      const detail =
        err instanceof Error ? err.message : "Filesystem write failed";
      throw new StorageWriteError(
        `Failed to save local security registry (${detail}).`
      );
    }
  }

  return { ok: true, store: next };
}

export async function mutateAdminSecurityStore(
  updater: (current: InternalAdminSecurityStore) => InternalAdminSecurityStore,
  options?: { maxAttempts?: number }
): Promise<InternalAdminSecurityStore> {
  const maxAttempts = Math.max(
    1,
    Math.min(8, options?.maxAttempts ?? MAX_MUTATION_ATTEMPTS)
  );

  const executeMutation = async (): Promise<InternalAdminSecurityStore> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const { store: current, meta } = await readAdminSecurityStoreWithMeta();
      const candidate = updater(current);

      // Skip unnecessary I/O and conflict contention when the updater returns current unchanged
      if (candidate === current) {
        return current;
      }

      const result = await writeAdminSecurityStoreConditional(candidate, meta);
      if (result.ok) {
        return result.store;
      }
    }

    throw new SecurityStoreConflictError();
  };

  const queuedTask = securityWriteQueue.then(executeMutation, executeMutation);
  securityWriteQueue = queuedTask.catch(() => undefined);
  return queuedTask;
}

export function appendSecurityAudit(
  store: InternalAdminSecurityStore,
  event: Omit<SecurityAuditEvent, "id" | "createdAt">
): InternalAdminSecurityStore {
  const record: SecurityAuditEvent = {
    id: `sec_${crypto.randomBytes(6).toString("hex")}`,
    createdAt: new Date().toISOString(),
    ...event,
  };
  return {
    ...store,
    auditLog: [record, ...store.auditLog].slice(0, MAX_AUDIT_ENTRIES),
  };
}

export function checkSecurityRateLimit(
  store: InternalAdminSecurityStore,
  bucketKey: string
): { allowed: boolean; retryAfterSec: number } {
  const bucket = store.loginFailures[bucketKey];
  if (!bucket) return { allowed: true, retryAfterSec: 0 };

  const now = Date.now();
  if (bucket.blockedUntil && now < bucket.blockedUntil) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  return { allowed: true, retryAfterSec: 0 };
}

export function recordSecurityRateFailure(
  store: InternalAdminSecurityStore,
  bucketKey: string,
  options?: { maxFailures?: number; windowMs?: number; blockMs?: number }
): InternalAdminSecurityStore {
  const now = Date.now();
  const maxFailures = options?.maxFailures ?? LOGIN_MAX_FAILURES;
  const windowMs = options?.windowMs ?? LOGIN_WINDOW_MS;
  const blockMs = options?.blockMs ?? LOGIN_BLOCK_MS;

  const prev = store.loginFailures[bucketKey];
  const expiredWindow = !prev || now - prev.firstAttemptAt > windowMs;
  const count = expiredWindow ? 1 : prev.count + 1;
  const firstAttemptAt = expiredWindow ? now : prev.firstAttemptAt;
  const blockedUntil = count >= maxFailures ? now + blockMs : null;

  return {
    ...store,
    loginFailures: {
      ...store.loginFailures,
      [bucketKey]: { count, firstAttemptAt, blockedUntil },
    },
  };
}

export function clearSecurityRateBucket(
  store: InternalAdminSecurityStore,
  bucketKey: string
): InternalAdminSecurityStore {
  if (!store.loginFailures[bucketKey]) return store;
  const copy = { ...store.loginFailures };
  delete copy[bucketKey];
  return { ...store, loginFailures: copy };
}

export function buildDeviceFromTelemetry(params: {
  telemetry?: Partial<ClientDeviceTelemetry> | null;
  customName?: string | null;
  ipMasked: string;
  userAgent: string;
  localHostname: string | null;
  trustSource: DeviceTrustSource;
  existingDeviceId?: string;
}): TrustedDevice {
  const uaParsed = parseUserAgentSummary(params.userAgent);
  const t = params.telemetry || {};
  const now = new Date().toISOString();

  const platform = t.platform?.trim() || uaParsed.platform;
  const osVersion = t.osVersion?.trim() || uaParsed.osVersion;
  const browser = t.browser?.trim() || uaParsed.browser;
  const model = t.model?.trim() || uaParsed.model;
  const deviceType = t.deviceType || uaParsed.deviceType;
  const fallbackName =
    params.localHostname
      ? `${params.localHostname} · ${browser}`
      : t.suggestedName?.trim() || `${platform} · ${browser}`;

  const resolvedName = (params.customName?.trim() || fallbackName).slice(0, 60);
  const keyThumbprint = t.keyThumbprint || null;
  const publicKeySpki = t.publicKeySpki || null;
  const browserKeys: Record<string, string> =
    keyThumbprint && publicKeySpki ? { [keyThumbprint]: publicKeySpki } : {};

  return {
    id:
      params.existingDeviceId ||
      `dev_${crypto.randomBytes(6).toString("hex")}`,
    name: resolvedName,
    model,
    platform,
    osVersion,
    browser,
    browsers: [browser],
    architecture: t.architecture || null,
    cpuCores: typeof t.cpuCores === "number" ? t.cpuCores : null,
    gpuRenderer: t.gpuRenderer || null,
    screenMetrics: t.screenMetrics || null,
    timezone: t.timezone || null,
    deviceType,
    keyThumbprint,
    publicKeySpki,
    browserKeys,
    ipMasked: params.ipMasked,
    userAgent: params.userAgent,
    trustSource: params.trustSource,
    status: "active",
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
}

/**
 * Determines whether a new browser session belongs to the same active physical device
 * (same network IP + OS platform + device class + display screen resolution + CPU core count & timezone).
 */
export function isSamePhysicalDeviceHardware(
  existing: TrustedDevice,
  candidate: {
    platform: string;
    deviceType: string;
    screenMetrics: string | null;
    cpuCores: number | null;
    timezone: string | null;
    ipMasked: string;
  }
): boolean {
  if (existing.status !== "active") return false;
  if (!existing.ipMasked || existing.ipMasked !== candidate.ipMasked) {
    return false;
  }
  if (
    existing.platform.trim().toLowerCase() !==
    candidate.platform.trim().toLowerCase()
  ) {
    return false;
  }
  if (existing.deviceType !== candidate.deviceType) {
    return false;
  }
  if (
    !existing.screenMetrics ||
    !candidate.screenMetrics ||
    existing.screenMetrics !== candidate.screenMetrics
  ) {
    return false;
  }
  if (
    typeof existing.cpuCores === "number" &&
    typeof candidate.cpuCores === "number" &&
    existing.cpuCores !== candidate.cpuCores
  ) {
    return false;
  }
  if (
    existing.timezone &&
    candidate.timezone &&
    existing.timezone !== candidate.timezone
  ) {
    return false;
  }
  return true;
}

export function resolveDevicePublicKeyForThumbprint(
  device: TrustedDevice,
  keyThumbprint: string
): string | null {
  if (device.browserKeys && device.browserKeys[keyThumbprint]) {
    return device.browserKeys[keyThumbprint];
  }
  if (device.keyThumbprint === keyThumbprint && device.publicKeySpki) {
    return device.publicKeySpki;
  }
  return null;
}

export function deviceHasThumbprint(
  device: TrustedDevice,
  keyThumbprint: string | null | undefined
): boolean {
  if (!keyThumbprint) return false;
  if (device.keyThumbprint === keyThumbprint) return true;
  return Boolean(device.browserKeys && device.browserKeys[keyThumbprint]);
}

export function upsertTrustedDevice(
  store: InternalAdminSecurityStore,
  device: TrustedDevice,
  options?: { preserveExistingName?: boolean }
): { store: InternalAdminSecurityStore; saved: TrustedDevice } {
  const existingIdx = store.devices.findIndex(
    (d) =>
      d.id === device.id ||
      (d.status === "active" &&
        Boolean(device.keyThumbprint) &&
        deviceHasThumbprint(d, device.keyThumbprint)) ||
      isSamePhysicalDeviceHardware(d, device) ||
      (!device.keyThumbprint &&
        !d.keyThumbprint &&
        d.status === "active" &&
        d.userAgent === device.userAgent &&
        d.platform === device.platform &&
        d.model === device.model &&
        d.screenMetrics === device.screenMetrics)
  );

  if (existingIdx >= 0) {
    const existing = store.devices[existingIdx];
    const resolvedName =
      options?.preserveExistingName && existing.name.trim()
        ? existing.name
        : device.name;
    const mergedBrowserKeys: Record<string, string> = {
      ...(existing.browserKeys || {}),
      ...(existing.keyThumbprint && existing.publicKeySpki
        ? { [existing.keyThumbprint]: existing.publicKeySpki }
        : {}),
      ...(device.browserKeys || {}),
      ...(device.keyThumbprint && device.publicKeySpki
        ? { [device.keyThumbprint]: device.publicKeySpki }
        : {}),
    };
    const mergedBrowsers = Array.from(
      new Set([
        ...(existing.browsers || [existing.browser]),
        ...(device.browsers || [device.browser]),
      ].filter(Boolean))
    );
    const merged: TrustedDevice = {
      ...existing,
      ...device,
      name: resolvedName,
      id: existing.id,
      browsers: mergedBrowsers,
      browserKeys: mergedBrowserKeys,
      keyThumbprint: device.keyThumbprint || existing.keyThumbprint,
      publicKeySpki: device.publicKeySpki || existing.publicKeySpki,
      createdAt: existing.createdAt,
      status: "active",
      revokedAt: null,
    };
    const nextDevices = [...store.devices];
    nextDevices[existingIdx] = merged;
    return {
      store: { ...store, devices: nextDevices },
      saved: merged,
    };
  }

  return {
    store: {
      ...store,
      devices: [device, ...store.devices],
    },
    saved: device,
  };
}

export async function touchDeviceActivity(
  deviceId: string,
  ipMasked?: string
): Promise<void> {
  try {
    const store = await readAdminSecurityStore();
    const target = store.devices.find(
      (d) => d.id === deviceId && d.status === "active"
    );
    if (!target) return;

    const ageMs = Date.now() - new Date(target.lastSeenAt).getTime();
    if (ageMs < LAST_SEEN_THROTTLE_MS && (!ipMasked || ipMasked === target.ipMasked)) {
      return;
    }

    // Best-effort single-attempt CAS touch so background lastSeenAt pings never contend with active mutations
    await mutateAdminSecurityStore(
      (latest) => {
        const currentTarget = latest.devices.find(
          (d) => d.id === deviceId && d.status === "active"
        );
        if (!currentTarget) return latest;

        const latestAgeMs =
          Date.now() - new Date(currentTarget.lastSeenAt).getTime();
        if (
          latestAgeMs < LAST_SEEN_THROTTLE_MS &&
          (!ipMasked || ipMasked === currentTarget.ipMasked)
        ) {
          return latest;
        }

        return {
          ...latest,
          devices: latest.devices.map((d) =>
            d.id === deviceId
              ? {
                  ...d,
                  lastSeenAt: new Date().toISOString(),
                  ipMasked: ipMasked || d.ipMasked,
                }
              : d
          ),
        };
      },
      { maxAttempts: 1 }
    );
  } catch {
    // Non-blocking activity touch
  }
}

function getExpectedEnvStealthKey(): string | null {
  const key = (process.env.ADMIN_STEALTH_KEY || "").trim();
  return key.length >= 6 ? key : null;
}

export function verifyStealthRecoveryKey(
  candidate: string | null | undefined,
  store: InternalAdminSecurityStore
): boolean {
  if (!candidate) return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;

  const envKey = getExpectedEnvStealthKey();
  if (envKey && constantTimeHashEqual(sha256Hex(trimmed), sha256Hex(envKey))) {
    return true;
  }

  if (
    store.stealthKeyHash &&
    constantTimeHashEqual(sha256Hex(trimmed), store.stealthKeyHash)
  ) {
    return true;
  }

  return false;
}

export function toSafeSecuritySummary(
  store: InternalAdminSecurityStore,
  currentDeviceId: string | null
): SafeSecuritySummary {
  const activeDevices = store.devices.filter((d) => d.status === "active");
  const now = Date.now();
  const pendingPairings = store.pairings
    .filter(
      (p) =>
        (p.status === "pending" || p.status === "awaiting_approval") &&
        new Date(p.expiresAt).getTime() > now
    )
    .map((p) => ({
      id: p.id,
      status: p.status,
      expiresAt: p.expiresAt,
      pendingDevice: p.pendingDevice,
      grantAdminSession: p.grantAdminSession,
    }));

  return {
    sessionEpoch: store.sessionEpoch,
    stealthGateEnabled: store.stealthGateEnabled,
    stealthKeyConfigured:
      Boolean(getExpectedEnvStealthKey()) || Boolean(store.stealthKeyHash),
    totpEnabled: store.totpEnabled,
    currentDeviceId,
    activeDeviceCount: activeDevices.length,
    devices: store.devices,
    passkeys: store.passkeys,
    auditLog: store.auditLog,
    pendingPairings,
  };
}

