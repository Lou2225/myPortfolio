import crypto from "crypto";
import { cookies } from "next/headers";
import {
  readAdminCredentialOverride,
  StorageReadError,
} from "@/lib/db";
import {
  type InternalAdminSecurityStore,
  readAdminSecurityStore,
  verifyStealthRecoveryKey,
} from "@/lib/security";

export const ADMIN_COOKIE_NAME = "lou_admin_session";
export const REGISTERED_DEVICE_COOKIE = "lou_registered_device";

/**
 * Determines whether cookies on an API response should carry the `Secure` attribute.
 * Forces `Secure` on Vercel production; respects `x-forwarded-proto` / request URL protocol
 * on local/self-hosted origins so LAN HTTP testing still works.
 */
export function isSecureRequest(request?: Request): boolean {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL === "1") {
    return true;
  }
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
      // Fall back to false for non-TLS local origins
    }
  }
  return false;
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

const DEVICE_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365; // 365 days
const DEVICE_COOKIE_RENEW_INTERVAL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface RegisteredDevicePayload {
  device: "registered_admin_device";
  deviceId?: string;
  keyThumbprint?: string | null;
  epoch?: number;
  iat?: number;
  exp: number;
}

interface StealthPassPayload {
  kind: "stealth_unlock_pass";
  exp: number;
}

interface DeviceChallengePayload {
  kind: "device_ecdsa_challenge";
  nonce: string;
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
  if (!secret || !token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(signature, "utf-8");
  const expectedBuf = Buffer.from(expectedSig, "utf-8");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
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

export function createRegisteredDeviceToken(options?: {
  deviceId?: string;
  keyThumbprint?: string | null;
  epoch?: number;
  iat?: number;
}): string {
  const issuedAt = options?.iat ?? Date.now();
  return signPayload({
    device: "registered_admin_device",
    epoch: options?.epoch ?? 1,
    ...(options?.deviceId ? { deviceId: options.deviceId } : {}),
    ...(options?.keyThumbprint
      ? { keyThumbprint: options.keyThumbprint }
      : {}),
    iat: issuedAt,
    exp: issuedAt + DEVICE_COOKIE_MAX_AGE_MS,
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

/**
 * Generates a short-lived signed challenge for silent WebCrypto ECDSA device re-recognition.
 */
export function createDeviceChallengeToken(): string | null {
  if (!isSessionSecretConfigured()) return null;
  return signPayload({
    kind: "device_ecdsa_challenge",
    nonce: crypto.randomBytes(16).toString("base64url"),
    exp: Date.now() + 1000 * 60 * 3, // 3 minutes
  });
}

export function verifyDeviceChallengeToken(token?: string | null): boolean {
  if (!token) return false;
  const payload = verifySignedToken<DeviceChallengePayload>(token);
  return (
    payload?.kind === "device_ecdsa_challenge" &&
    typeof payload.nonce === "string" &&
    payload.nonce.length >= 16
  );
}

/**
 * Verifies an IEEE P1363 ECDSA P-256 SHA-256 signature created by `crypto.subtle.sign`
 * against the stored base64 SPKI public key on a trusted device record.
 */
export function verifyEcdsaDeviceSignature(params: {
  publicKeySpkiBase64: string;
  challenge: string;
  signatureBase64Url: string;
}): boolean {
  try {
    const keyObject = crypto.createPublicKey({
      key: Buffer.from(params.publicKeySpkiBase64, "base64"),
      format: "der",
      type: "spki",
    });
    const sigBytes = Buffer.from(params.signatureBase64Url, "base64url");
    if (sigBytes.length < 32) return false;
    return crypto.verify(
      "sha256",
      Buffer.from(params.challenge, "utf8"),
      {
        key: keyObject,
        dsaEncoding: "ieee-p1363",
      },
      sigBytes
    );
  } catch {
    return false;
  }
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

export async function getSessionAndDeviceContext(options?: {
  securityStore?: InternalAdminSecurityStore;
}): Promise<{
  authenticated: boolean;
  deviceRegistered: boolean;
  currentDeviceId: string | null;
  currentDeviceThumbprint?: string | null;
  deviceTokenNeedsRefresh?: boolean;
  sessionEpoch: number;
  storageUnavailable?: boolean;
  securityStore?: InternalAdminSecurityStore;
}> {
  try {
    const [cookieStore, securityStore] = await Promise.all([
      cookies(),
      options?.securityStore
        ? Promise.resolve(options.securityStore)
        : readAdminSecurityStore(),
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
      if (sessionPayload.deviceId) {
        const boundDevice = securityStore.devices.find(
          (d) => d.id === sessionPayload.deviceId
        );
        deviceStillAllowed = boundDevice?.status === "active";
      }

      authenticated = epochMatches && deviceStillAllowed;
    }

    // Validate Registered Device Cookie against Server Registry & Session Epoch
    let deviceRegistered = false;
    let currentDeviceId: string | null = null;
    let currentDeviceThumbprint: string | null = null;
    let deviceTokenNeedsRefresh = false;

    if (devicePayload?.device === "registered_admin_device") {
      const deviceEpochMatches =
        typeof devicePayload.epoch === "number"
          ? devicePayload.epoch === securityStore.sessionEpoch
          : isLegacyPermitted;

      if (deviceEpochMatches && devicePayload.deviceId) {
        const match = securityStore.devices.find(
          (d) => d.id === devicePayload.deviceId && d.status === "active"
        );
        if (match) {
          deviceRegistered = true;
          currentDeviceId = match.id;
          currentDeviceThumbprint = match.keyThumbprint;
          const tokenAgeMs =
            typeof devicePayload.iat === "number"
              ? Date.now() - devicePayload.iat
              : Number.POSITIVE_INFINITY;
          if (tokenAgeMs >= DEVICE_COOKIE_RENEW_INTERVAL_MS) {
            deviceTokenNeedsRefresh = true;
          }
        }
      } else if (deviceEpochMatches && isLegacyPermitted) {
        deviceRegistered = true;
      }
    }

    if (!currentDeviceId && authenticated && sessionPayload?.deviceId) {
      const boundActive = securityStore.devices.find(
        (d) => d.id === sessionPayload.deviceId && d.status === "active"
      );
      if (boundActive) {
        currentDeviceId = boundActive.id;
        currentDeviceThumbprint = boundActive.keyThumbprint;
        deviceRegistered = true;
        deviceTokenNeedsRefresh = true;
      }
    }

    return {
      authenticated,
      deviceRegistered,
      currentDeviceId,
      currentDeviceThumbprint,
      deviceTokenNeedsRefresh,
      sessionEpoch: securityStore.sessionEpoch,
      securityStore,
    };
  } catch (err) {
    return {
      authenticated: false,
      deviceRegistered: false,
      currentDeviceId: null,
      currentDeviceThumbprint: null,
      deviceTokenNeedsRefresh: false,
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
  securityStore?: InternalAdminSecurityStore;
}): Promise<{
  allowed: boolean;
  stealthActive: boolean;
  unlockedViaKey: boolean;
  storageUnavailable?: boolean;
  securityStore?: InternalAdminSecurityStore;
}> {
  try {
    const ctx = await getSessionAndDeviceContext({
      securityStore: options?.securityStore,
    });

    if (ctx.storageUnavailable || !ctx.securityStore) {
      return {
        allowed: false,
        stealthActive: true,
        unlockedViaKey: false,
        storageUnavailable: true,
      };
    }

    const store = ctx.securityStore;
    const activeDeviceCount = store.devices.filter(
      (d) => d.status === "active"
    ).length;

    // Bootstrap Safety: never block /admin when Stealth Gate is OFF or 0 active devices exist
    const stealthActive = store.stealthGateEnabled && activeDeviceCount > 0;
    if (!stealthActive) {
      return {
        allowed: true,
        stealthActive: false,
        unlockedViaKey: false,
        securityStore: store,
      };
    }

    if (ctx.authenticated || ctx.deviceRegistered) {
      return {
        allowed: true,
        stealthActive: true,
        unlockedViaKey: false,
        securityStore: store,
      };
    }

    if (
      verifyStealthRecoveryKey(options?.portalKey, store) ||
      verifyStealthUnlockPass(options?.stealthUnlockToken)
    ) {
      return {
        allowed: true,
        stealthActive: true,
        unlockedViaKey: true,
        securityStore: store,
      };
    }

    return {
      allowed: false,
      stealthActive: true,
      unlockedViaKey: false,
      securityStore: store,
    };
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
