import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const cookieMap = new Map<string, { name: string; value: string }>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => cookieMap.get(name),
    set: (name: string, value: string) => {
      cookieMap.set(name, { name, value });
    },
    delete: (name: string) => {
      cookieMap.delete(name);
    },
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

import {
  ADMIN_COOKIE_NAME,
  createAdminToken,
  getSessionAndDeviceContext,
  hashAdminPassword,
  isAdminAuthenticated,
  isSecureRequest,
  isSessionSecretConfigured,
  REGISTERED_DEVICE_COOKIE,
  requireSessionSecret,
  verifyPasswordMatch,
  verifyScryptPasswordHash,
} from "@/lib/auth";
import { buildDeviceFromTelemetry, mutateAdminSecurityStore } from "@/lib/security";

let tempDataDir = "";
const origEnv = {
  PORTFOLIO_DATA_DIR: process.env.PORTFOLIO_DATA_DIR,
  PORTFOLIO_FORCE_LOCAL_STORAGE: process.env.PORTFOLIO_FORCE_LOCAL_STORAGE,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
};

describe("Admin Auth, Session Tokens & Device Epoch Invalidation", () => {
  beforeAll(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-auth-test-"));
    process.env.PORTFOLIO_DATA_DIR = tempDataDir;
    process.env.PORTFOLIO_FORCE_LOCAL_STORAGE = "1";
    process.env.ADMIN_SESSION_SECRET = "unit-test-hmac-secret-32-chars-minimum!";
  });

  afterEach(() => {
    cookieMap.clear();
    process.env.ADMIN_SESSION_SECRET = "unit-test-hmac-secret-32-chars-minimum!";
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("fails closed when ADMIN_SESSION_SECRET is missing", () => {
    delete process.env.ADMIN_SESSION_SECRET;
    expect(isSessionSecretConfigured()).toBe(false);
    expect(() => requireSessionSecret()).toThrow();
    expect(() => createAdminToken()).toThrow();
  });

  it("hashes and verifies scrypt and SHA-256 constant-time passwords", () => {
    const hash = hashAdminPassword("MyStrongPassword#2026");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyScryptPasswordHash("MyStrongPassword#2026", hash)).toBe(true);
    expect(verifyScryptPasswordHash("WrongPassword", hash)).toBe(false);

    expect(verifyPasswordMatch("abc123", "abc123")).toBe(true);
    expect(verifyPasswordMatch("abc123", "abc124")).toBe(false);
  });

  it("respects forwarded proto and local HTTP origin in isSecureRequest", () => {
    expect(
      isSecureRequest(new Request("http://127.0.0.1:3100/api/admin/auth"))
    ).toBe(false);
    expect(
      isSecureRequest(new Request("https://portfolio.example.com/api/admin/auth"))
    ).toBe(true);
    expect(
      isSecureRequest(
        new Request("http://127.0.0.1:3000/api/admin/auth", {
          headers: { "x-forwarded-proto": "https" },
        })
      )
    ).toBe(true);
  });

  it("signs valid admin tokens, rejects tampering, and invalidates bumped epochs or revoked devices", async () => {
    const device = buildDeviceFromTelemetry({
      ipMasked: "127.0.0.x",
      userAgent: "Vitest/1.0",
      localHostname: "test-host",
      trustSource: "login",
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      sessionEpoch: 2,
      devices: [device],
    }));

    const validToken = createAdminToken({ epoch: 2, deviceId: device.id });
    cookieMap.set(ADMIN_COOKIE_NAME, { name: ADMIN_COOKIE_NAME, value: validToken });
    cookieMap.set(REGISTERED_DEVICE_COOKIE, {
      name: REGISTERED_DEVICE_COOKIE,
      value: validToken,
    });

    expect(await isAdminAuthenticated()).toBe(true);

    // Tampered token must be rejected.
    cookieMap.set(ADMIN_COOKIE_NAME, {
      name: ADMIN_COOKIE_NAME,
      value: `${validToken.slice(0, -3)}xxx`,
    });
    expect(await isAdminAuthenticated()).toBe(false);

    // Stale epoch token must be rejected when epoch > 1.
    const staleEpochToken = createAdminToken({ epoch: 1, deviceId: device.id });
    cookieMap.set(ADMIN_COOKIE_NAME, {
      name: ADMIN_COOKIE_NAME,
      value: staleEpochToken,
    });
    expect(await isAdminAuthenticated()).toBe(false);

    // Revoking device must reject even a token with the active epoch.
    await mutateAdminSecurityStore((store) => ({
      ...store,
      devices: store.devices.map((d) =>
        d.id === device.id ? { ...d, status: "revoked" as const } : d
      ),
    }));
    cookieMap.set(ADMIN_COOKIE_NAME, { name: ADMIN_COOKIE_NAME, value: validToken });
    const ctx = await getSessionAndDeviceContext();
    expect(ctx.authenticated).toBe(false);
  });
});
