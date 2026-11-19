import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { PUT as authPut } from "@/app/api/admin/auth/route";
import { PATCH as devicesPatch } from "@/app/api/admin/devices/route";
import {
  ADMIN_COOKIE_NAME,
  createAdminToken,
  createRegisteredDeviceToken,
  getSessionAndDeviceContext,
  REGISTERED_DEVICE_COOKIE,
} from "@/lib/auth";
import { sanitizeAppearanceConfig } from "@/lib/appearance";
import {
  extractReferencedAssetPaths,
  isSafeUploadStoragePath,
  UPLOAD_SUBFOLDERS,
} from "@/lib/backups";
import { getDefaultSeedDatabase } from "@/lib/db";
import {
  buildDeviceFromTelemetry,
  getDefaultSecurityStore,
  mutateAdminSecurityStore,
  readAdminSecurityStore,
} from "@/lib/security";

let tempDataDir = "";
const origEnv = {
  PORTFOLIO_DATA_DIR: process.env.PORTFOLIO_DATA_DIR,
  PORTFOLIO_FORCE_LOCAL_STORAGE: process.env.PORTFOLIO_FORCE_LOCAL_STORAGE,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
};

describe("Settings Integrity: Orphan Media, Appearance Cleanup, Password Epoch & Session Revocation", () => {
  beforeAll(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-settings-test-"));
    process.env.PORTFOLIO_DATA_DIR = tempDataDir;
    process.env.PORTFOLIO_FORCE_LOCAL_STORAGE = "1";
    process.env.ADMIN_SESSION_SECRET = "unit-test-hmac-secret-32-chars-minimum!";
    process.env.ADMIN_PASSWORD = "InitialEnvPassword#2026";
  });

  beforeEach(async () => {
    cookieMap.clear();
    process.env.ADMIN_PASSWORD = "InitialEnvPassword#2026";
    await mutateAdminSecurityStore(() => getDefaultSecurityStore());
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("includes cursors, scares, and audio upload folders and protects active appearance assets from orphan deletion", () => {
    expect(UPLOAD_SUBFOLDERS).toEqual(
      expect.arrayContaining(["cursors", "scares", "audio"])
    );
    expect(isSafeUploadStoragePath("cursors/custom-arrow.png")).toBe(true);
    expect(isSafeUploadStoragePath("scares/gotcha.webp")).toBe(true);
    expect(isSafeUploadStoragePath("audio/sting.mp3")).toBe(true);
    expect(isSafeUploadStoragePath("cursors/../secret.txt")).toBe(false);

    const db = getDefaultSeedDatabase();
    db.appearance = sanitizeAppearanceConfig({
      ...db.appearance,
      customCursorDefaultUrl: "/uploads/cursors/arrow.png",
      customCursorPointerUrl:
        "https://demo.supabase.co/storage/v1/object/public/myPortfolio/cursors/hand.cur",
      jumpscareImageUrl: "/uploads/scares/boo.webp",
      jumpscareAudioUrl: "/uploads/audio/scream.mp3",
    });

    const refs = extractReferencedAssetPaths(db);
    expect(refs.has("cursors/arrow.png")).toBe(true);
    expect(refs.has("/uploads/cursors/arrow.png")).toBe(true);
    expect(refs.has("cursors/hand.cur")).toBe(true);
    expect(refs.has("scares/boo.webp")).toBe(true);
    expect(refs.has("audio/scream.mp3")).toBe(true);
  });

  it("clears stale cursor sourceSize and image transforms when appearance URLs are cleared", () => {
    const cleaned = sanitizeAppearanceConfig({
      customCursorDefaultUrl: "",
      customCursorDefaultSourceSize: 128,
      customCursorDefaultTransform: {
        zoom: 1.5,
        offsetXPercent: 10,
        offsetYPercent: -5,
        rotation: 0,
        fit: "contain",
        aspect: "1:1",
        clipCircle: false,
      },
      customCursorPointerUrl: "",
      customCursorPointerSourceSize: 96,
      jumpscareImageUrl: "",
      jumpscareImageTransform: {
        zoom: 2,
        offsetXPercent: 0,
        offsetYPercent: 0,
        rotation: 0,
        fit: "cover",
        aspect: "16:9",
        clipCircle: false,
      },
    });

    expect(cleaned.customCursorDefaultSourceSize).toBeUndefined();
    expect(cleaned.customCursorDefaultTransform).toBeUndefined();
    expect(cleaned.customCursorPointerSourceSize).toBeUndefined();
    expect(cleaned.customCursorPointerTransform).toBeUndefined();
    expect(cleaned.jumpscareImageTransform).toBeUndefined();
  });

  it("refreshes the active browser's lou_registered_device cookie epoch on password change and env revert", async () => {
    const device = buildDeviceFromTelemetry({
      ipMasked: "127.0.0.x",
      userAgent: "Vitest/1.0",
      localHostname: null,
      trustSource: "login",
      telemetry: {
        platform: "Windows",
        osVersion: "11",
        browser: "Chrome",
        model: "Windows PC",
        deviceType: "desktop",
        keyThumbprint: "DEV-PWD-0001-0002",
        secureContext: true,
      },
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      sessionEpoch: 1,
      devices: [device],
    }));

    cookieMap.set(ADMIN_COOKIE_NAME, {
      name: ADMIN_COOKIE_NAME,
      value: createAdminToken({ epoch: 1, deviceId: device.id }),
    });
    cookieMap.set(REGISTERED_DEVICE_COOKIE, {
      name: REGISTERED_DEVICE_COOKIE,
      value: createRegisteredDeviceToken({
        deviceId: device.id,
        keyThumbprint: device.keyThumbprint,
        epoch: 1,
      }),
    });

    // 1. Change password -> bumps epoch to 2 and must refresh BOTH session and device cookies
    const changeRes = await authPut(
      new Request("https://louvaldellon.vercel.app/api/admin/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change-password",
          currentPassword: "InitialEnvPassword#2026",
          newPassword: "RotatedStrongPassword#2027",
          confirmPassword: "RotatedStrongPassword#2027",
        }),
      })
    );
    expect(changeRes.status).toBe(200);
    const afterChangeCtx = await getSessionAndDeviceContext();
    expect(afterChangeCtx.authenticated).toBe(true);
    expect(afterChangeCtx.deviceRegistered).toBe(true);
    expect(afterChangeCtx.currentDeviceId).toBe(device.id);
    expect(afterChangeCtx.sessionEpoch).toBe(2);

    // 2. Revert to ADMIN_PASSWORD env -> bumps epoch to 3 and must keep device trust valid
    const revertRes = await authPut(
      new Request("https://louvaldellon.vercel.app/api/admin/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revert-env" }),
      })
    );
    expect(revertRes.status).toBe(200);
    const afterRevertCtx = await getSessionAndDeviceContext();
    expect(afterRevertCtx.authenticated).toBe(true);
    expect(afterRevertCtx.deviceRegistered).toBe(true);
    expect(afterRevertCtx.currentDeviceId).toBe(device.id);
    expect(afterRevertCtx.sessionEpoch).toBe(3);
  });

  it("revokes all active trusted devices and linked passkeys when revoke-other-sessions runs from an unregistered browser", async () => {
    const trustedPhone = buildDeviceFromTelemetry({
      ipMasked: "198.51.100.*",
      userAgent: "Mobile Safari",
      localHostname: null,
      trustSource: "qr-pair",
      customName: "iPhone 16 Pro",
    });
    const trustedLaptop = buildDeviceFromTelemetry({
      ipMasked: "198.51.100.*",
      userAgent: "Chrome/131",
      localHostname: null,
      trustSource: "login",
      customName: "Workstation",
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      sessionEpoch: 1,
      devices: [trustedPhone, trustedLaptop],
      passkeys: [
        {
          credentialId: "cred_laptop_1",
          deviceId: trustedLaptop.id,
          rpId: "louvaldellon.vercel.app",
          publicKeySpki: "spki_placeholder",
          algorithm: -7,
          counter: 1,
          transports: ["internal"],
          authenticatorLabel: "Windows Hello",
          aaguid: "08987058-cadc-4b81-b6e1-30de50dcbe96",
          backedUp: false,
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        },
      ],
    }));

    // Authenticated session WITHOUT any registered device cookie (currentDeviceId === null)
    cookieMap.set(ADMIN_COOKIE_NAME, {
      name: ADMIN_COOKIE_NAME,
      value: createAdminToken({ epoch: 1 }),
    });

    const patchRes = await devicesPatch(
      new Request("https://louvaldellon.vercel.app/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke-other-sessions" }),
      })
    );
    expect(patchRes.status).toBe(200);

    const updatedStore = await readAdminSecurityStore();
    expect(updatedStore.sessionEpoch).toBe(2);
    expect(updatedStore.devices.every((d) => d.status === "revoked")).toBe(true);
    expect(updatedStore.passkeys).toHaveLength(0);
  });
});
