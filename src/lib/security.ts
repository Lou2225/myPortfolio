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

export interface InternalAdminSecurityStore extends AdminSecurityStore {
  stealthKeyHash: string | null;
  totpEnabled: boolean;
  totpSecretEnc: string | null;
  totpPendingSecretEnc: string | null;
  totpLastStepUsed: number | null;
}

// In-process async write queue so concurrent security updates never clobber one another
let securityWriteQueue: Promise<unknown> = Promise.resolve();

export function getDefaultSecurityStore(): InternalAdminSecurityStore {
  return {
    sessionEpoch: 1,
    stealthGateEnabled: false,
    stealthKeyHash: null,
    totpEnabled: false,
    totpSecretEnc: null,
    totpPendingSecretEnc: null,
    totpLastStepUsed: null,
    devices: [],
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

  return {
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
    devices: Array.isArray(raw.devices) ? raw.devices : [],
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

export async function readAdminSecurityStore(): Promise<InternalAdminSecurityStore> {
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
      return normalizeStore(rows[0].payload);
    }
    return getDefaultSecurityStore();
  }

  try {
    const raw = await fs.readFile(getLocalSecurityFile(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<InternalAdminSecurityStore>;
    return normalizeStore(parsed);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return getDefaultSecurityStore();
    }
    throw new StorageReadError("Unable to read local security registry.");
  }
}

async function writeAdminSecurityStore(
  store: InternalAdminSecurityStore
): Promise<InternalAdminSecurityStore> {
  const next = normalizeStore({
    ...store,
    updatedAt: new Date().toISOString(),
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
      res = await fetch(`${url}/rest/v1/portfolio_store`, {
        method: "POST",
        headers: buildSupabaseHeaders(key, {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        }),
        body: JSON.stringify({
          id: SUPABASE_SECURITY_ROW_ID,
          payload: next,
          updated_at: new Date().toISOString(),
        }),
      });
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

  return next;
}

export async function mutateAdminSecurityStore(
  updater: (current: InternalAdminSecurityStore) => InternalAdminSecurityStore
): Promise<InternalAdminSecurityStore> {
  const executeMutation = async () => {
    const current = await readAdminSecurityStore();
    const next = updater(current);
    return writeAdminSecurityStore(next);
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

export function checkLoginRateLimit(
  store: InternalAdminSecurityStore,
  ipRateKey: string
): { allowed: boolean; retryAfterSec: number } {
  return checkSecurityRateLimit(store, ipRateKey);
}

export function recordLoginFailureState(
  store: InternalAdminSecurityStore,
  ipRateKey: string
): InternalAdminSecurityStore {
  return recordSecurityRateFailure(store, ipRateKey);
}

export function clearLoginFailureState(
  store: InternalAdminSecurityStore,
  ipRateKey: string
): InternalAdminSecurityStore {
  return clearSecurityRateBucket(store, ipRateKey);
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

  return {
    id:
      params.existingDeviceId ||
      `dev_${crypto.randomBytes(6).toString("hex")}`,
    name: resolvedName,
    model,
    platform,
    osVersion,
    browser,
    architecture: t.architecture || null,
    cpuCores: typeof t.cpuCores === "number" ? t.cpuCores : null,
    gpuRenderer: t.gpuRenderer || null,
    screenMetrics: t.screenMetrics || null,
    timezone: t.timezone || null,
    deviceType,
    keyThumbprint: t.keyThumbprint || null,
    publicKeySpki: t.publicKeySpki || null,
    ipMasked: params.ipMasked,
    userAgent: params.userAgent,
    trustSource: params.trustSource,
    status: "active",
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
}

export function upsertTrustedDevice(
  store: InternalAdminSecurityStore,
  device: TrustedDevice,
  options?: { preserveExistingName?: boolean }
): { store: InternalAdminSecurityStore; saved: TrustedDevice } {
  const existingIdx = store.devices.findIndex(
    (d) =>
      d.id === device.id ||
      (Boolean(device.keyThumbprint) &&
        d.keyThumbprint === device.keyThumbprint &&
        d.status === "active")
  );

  if (existingIdx >= 0) {
    const existing = store.devices[existingIdx];
    const resolvedName =
      options?.preserveExistingName && existing.name.trim()
        ? existing.name
        : device.name;
    const merged: TrustedDevice = {
      ...existing,
      ...device,
      name: resolvedName,
      id: existing.id,
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

    await writeAdminSecurityStore({
      ...store,
      devices: store.devices.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              lastSeenAt: new Date().toISOString(),
              ipMasked: ipMasked || d.ipMasked,
            }
          : d
      ),
    });
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
    auditLog: store.auditLog,
    pendingPairings,
  };
}

