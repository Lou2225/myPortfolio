import crypto from "crypto";
import { cookies } from "next/headers";
import {
  readAdminCredentialOverride,
  StorageReadError,
} from "@/lib/db";
import { readAdminSecurityStore, verifyStealthRecoveryKey } from "@/lib/security";

export const ADMIN_COOKIE_NAME = "lou_admin_session";
export const REGISTERED_DEVICE_COOKIE = "lou_registered_device";

/**
 * Determines whether cookies on an API response should carry the `Secure` attribute.
 * Respects `x-forwarded-proto` / request URL protocol so `npm run start` over local LAN HTTP
 * (e.g., QR mobile pairing) continues to issue cookies while TLS origins enforce `Secure`.
 */
export function isSecureRequest(request?: Request): boolean {
  if (request) {
    const forwardedProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    if (forwardedProto) {
      return forwardedProto === "https";
    }
    try {
      return new URL(request.url).protocol === "https:";
    } catch {
      // Fall back to environment detection below
    }
  }
  return process.env.NODE_ENV === "production" && process.env.VERCEL === "1";
}

export type AdminPasswordSource = "override" | "env" | "unconfigured";

export interface AdminAuthMeta {
  passwordSource: AdminPasswordSource;
  envConfigured: boolean;
  overrideUpdatedAt: string | null;
}

interface AdminSessionPayload {
  role: "admin";
  epoch?: number;
  deviceId?: string;
  exp: number;
}

interface RegisteredDevicePayload {
  device: "registered_admin_device";
  deviceId?: string;
  keyThumbprint?: string | null;
  epoch?: number;
  exp: number;
}

interface StealthPassPayload {
  kind: "stealth_unlock_pass";
  exp: number;
}

const SCRYPT_PREFIX = "scrypt";

function getSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET || "";
  return secret.trim() || null;
}

export function isSessionSecretConfigured(): boolean {
  return Boolean(getSecret());
}

export function requireSessionSecret(): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not configured in environment variables."
    );
  }
  return secret;
}

export function getExpectedAdminPassword(): string | null {
  const pwd = process.env.ADMIN_PASSWORD || "";
  return pwd.trim() || null;
}

export function verifyPasswordMatch(input: string, expected: string): boolean {
  const inputDigest = crypto.createHash("sha256").update(input).digest();
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(inputDigest, expectedDigest);
}

/**
 * Generates a salted scrypt digest (`scrypt$<hexSalt>$<hexDerivedKey>`) for admin password storage.
 */
export function hashAdminPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${derived}`;
}

/**
 * Verifies a plaintext password against a stored `scrypt$<salt>$<hash>` digest in constant time.
 */
export function verifyScryptPasswordHash(
  input: string,
  storedHash: string
): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) {
    return false;
  }
  const [, salt, hexKey] = parts;
  if (!salt || !hexKey) return false;

  try {
    const expectedBuffer = Buffer.from(hexKey, "hex");
    const derivedBuffer = crypto.scryptSync(input, salt, 64);
    if (expectedBuffer.length !== derivedBuffer.length) return false;
    return crypto.timingSafeEqual(derivedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function signPayload(payloadObj: Record<string, unknown>): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "Admin authentication secret is not configured in environment variables."
    );
  }
  const payload = JSON.stringify(payloadObj);
  const encoded = Buffer.from(payload).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySignedToken<T extends { exp?: number }>(
  token?: string
): T | null {
  const secret = getSecret();
  if (!secret || !token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");

  if (signature.length !== expectedSig.length) return null;
  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig)
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8")
    ) as T;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createAdminToken(options?: {
  epoch?: number;
  deviceId?: string;
}): string {
  return signPayload({
    role: "admin",
    epoch: options?.epoch ?? 1,
    ...(options?.deviceId ? { deviceId: options.deviceId } : {}),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  });
}

function createRegisteredDeviceToken(options?: {
  deviceId?: string;
  keyThumbprint?: string | null;
  epoch?: number;
}): string {
  return signPayload({
    device: "registered_admin_device",
    epoch: options?.epoch ?? 1,
    ...(options?.deviceId ? { deviceId: options.deviceId } : {}),
    ...(options?.keyThumbprint
      ? { keyThumbprint: options.keyThumbprint }
      : {}),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 365, // 365 days
  });
}

/**
 * Generates a short-lived signed authorization pass when arriving at `/admin?portal=KEY`.
 */
export function createStealthUnlockPass(): string {
  return signPayload({
    kind: "stealth_unlock_pass",
    exp: Date.now() + 1000 * 60 * 10, // 10 minutes
  });
}

export function setSessionCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  options: { epoch: number; deviceId?: string; secure: boolean }
): void {
  const token = createAdminToken({
    epoch: options.epoch,
    deviceId: options.deviceId,
  });
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function setDeviceCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  options: {
    deviceId: string;
    keyThumbprint?: string | null;
    epoch: number;
    secure: boolean;
  }
): void {
  const deviceToken = createRegisteredDeviceToken({
    deviceId: options.deviceId,
    keyThumbprint: options.keyThumbprint,
    epoch: options.epoch,
  });
  cookieStore.set(REGISTERED_DEVICE_COOKIE, deviceToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function verifyStealthUnlockPass(token?: string | null): boolean {
  if (!token) return false;
  const payload = verifySignedToken<StealthPassPayload>(token);
  return payload?.kind === "stealth_unlock_pass";
}

export async function getSessionAndDeviceContext(): Promise<{
  authenticated: boolean;
  deviceRegistered: boolean;
  currentDeviceId: string | null;
  sessionEpoch: number;
  storageUnavailable?: boolean;
}> {
  try {
    const [cookieStore, securityStore] = await Promise.all([
      cookies(),
      readAdminSecurityStore(),
    ]);

    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    const deviceCookie = cookieStore.get(REGISTERED_DEVICE_COOKIE)?.value;

    const sessionPayload = verifySignedToken<AdminSessionPayload>(sessionCookie);
    const devicePayload =
      verifySignedToken<RegisteredDevicePayload>(deviceCookie);

    const isLegacyPermitted =
      securityStore.sessionEpoch === 1 && securityStore.devices.length === 0;

    // Validate Session Epoch & Bound Device
    let authenticated = false;
    if (sessionPayload?.role === "admin") {
      const epochMatches =
        typeof sessionPayload.epoch === "number"
          ? sessionPayload.epoch === securityStore.sessionEpoch
          : isLegacyPermitted;

      let deviceStillAllowed = true;
      if (sessionPayload.deviceId && securityStore.devices.length > 0) {
        const boundDevice = securityStore.devices.find(
          (d) => d.id === sessionPayload.deviceId
        );
        deviceStillAllowed = boundDevice?.status === "active";
      }

      authenticated = epochMatches && deviceStillAllowed;
    }

    // Validate Registered Device Cookie against Server Registry
    let deviceRegistered = false;
    let currentDeviceId: string | null = null;

    if (devicePayload?.device === "registered_admin_device") {
      if (devicePayload.deviceId) {
        const match = securityStore.devices.find(
          (d) => d.id === devicePayload.deviceId && d.status === "active"
        );
        if (match) {
          deviceRegistered = true;
          currentDeviceId = match.id;
        }
      } else if (isLegacyPermitted) {
        deviceRegistered = true;
      }
    }

    if (!currentDeviceId && authenticated && sessionPayload?.deviceId) {
      const boundActive = securityStore.devices.find(
        (d) => d.id === sessionPayload.deviceId && d.status === "active"
      );
      if (boundActive) {
        currentDeviceId = boundActive.id;
      }
    }

    return {
      authenticated,
      deviceRegistered,
      currentDeviceId,
      sessionEpoch: securityStore.sessionEpoch,
    };
  } catch (err) {
    return {
      authenticated: false,
      deviceRegistered: false,
      currentDeviceId: null,
      sessionEpoch: 1,
      storageUnavailable: err instanceof StorageReadError,
    };
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const ctx = await getSessionAndDeviceContext();
  return ctx.authenticated;
}

export async function checkStealthGateAccess(options?: {
  portalKey?: string | null;
  stealthUnlockToken?: string | null;
}): Promise<{
  allowed: boolean;
  stealthActive: boolean;
  unlockedViaKey: boolean;
  storageUnavailable?: boolean;
}> {
  try {
    const [ctx, store] = await Promise.all([
      getSessionAndDeviceContext(),
      readAdminSecurityStore(),
    ]);

    if (ctx.storageUnavailable) {
      return {
        allowed: false,
        stealthActive: true,
        unlockedViaKey: false,
        storageUnavailable: true,
      };
    }

    const activeDeviceCount = store.devices.filter(
      (d) => d.status === "active"
    ).length;

    // Bootstrap Safety: never block /admin when Stealth Gate is OFF or 0 active devices exist
    const stealthActive = store.stealthGateEnabled && activeDeviceCount > 0;
    if (!stealthActive) {
      return { allowed: true, stealthActive: false, unlockedViaKey: false };
    }

    if (ctx.authenticated || ctx.deviceRegistered) {
      return { allowed: true, stealthActive: true, unlockedViaKey: false };
    }

    if (
      verifyStealthRecoveryKey(options?.portalKey, store) ||
      verifyStealthUnlockPass(options?.stealthUnlockToken)
    ) {
      return { allowed: true, stealthActive: true, unlockedViaKey: true };
    }

    return { allowed: false, stealthActive: true, unlockedViaKey: false };
  } catch (err) {
    return {
      allowed: false,
      stealthActive: true,
      unlockedViaKey: false,
      storageUnavailable: err instanceof StorageReadError,
    };
  }
}

export async function getAdminAuthMeta(): Promise<AdminAuthMeta> {
  const envConfigured = Boolean(getExpectedAdminPassword());
  const override = await readAdminCredentialOverride();
  if (override?.passwordHash) {
    return {
      passwordSource: "override",
      envConfigured,
      overrideUpdatedAt: override.updatedAt,
    };
  }
  return {
    passwordSource: envConfigured ? "env" : "unconfigured",
    envConfigured,
    overrideUpdatedAt: null,
  };
}

export async function verifyAdminCredential(input: string): Promise<{
  valid: boolean;
  source: AdminPasswordSource;
  error?: string;
}> {
  const override = await readAdminCredentialOverride();
  if (override?.passwordHash) {
    return {
      valid: verifyScryptPasswordHash(input, override.passwordHash),
      source: "override",
    };
  }

  const expected = getExpectedAdminPassword();
  if (!expected) {
    return {
      valid: false,
      source: "unconfigured",
      error:
        "Administrator password is not configured. Set ADMIN_PASSWORD in environment variables.",
    };
  }

  return {
    valid: verifyPasswordMatch(input, expected),
    source: "env",
  };
}
