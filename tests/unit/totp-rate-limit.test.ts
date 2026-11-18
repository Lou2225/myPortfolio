import crypto from "crypto";
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

import { POST as totpPost } from "@/app/api/admin/devices/totp/route";
import { ADMIN_COOKIE_NAME, createAdminToken } from "@/lib/auth";
import {
  buildDeviceFromTelemetry,
  mutateAdminSecurityStore,
  readAdminSecurityStore,
  toSafeSecuritySummary,
} from "@/lib/security";

function computeTotpCode(base32Secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32Secret.replace(/[\s=-]+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const step = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counterBuf.writeUInt32BE(step >>> 0, 4);

  const hmac = crypto.createHmac("sha1", Buffer.from(bytes)).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binaryCode % 1_000_000).padStart(6, "0");
}

let tempDataDir = "";
const origEnv = {
  PORTFOLIO_DATA_DIR: process.env.PORTFOLIO_DATA_DIR,
  PORTFOLIO_FORCE_LOCAL_STORAGE: process.env.PORTFOLIO_FORCE_LOCAL_STORAGE,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
};

const TEST_SECRET = "unit-test-hmac-secret-32-chars-minimum!";

describe("POST /api/admin/devices/totp Rate Limiting & Audit Trail", () => {
  beforeAll(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-totp-rl-"));
    process.env.PORTFOLIO_DATA_DIR = tempDataDir;
    process.env.PORTFOLIO_FORCE_LOCAL_STORAGE = "1";
    process.env.ADMIN_SESSION_SECRET = TEST_SECRET;
    process.env.ADMIN_PASSWORD = "CorrectAdminPassword#2026";
  });

  afterEach(() => {
    cookieMap.clear();
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("locks out TOTP disable with 429 after 5 wrong passwords even if x-forwarded-for left entry rotates, and records audit entries", async () => {
    const device = buildDeviceFromTelemetry({
      ipMasked: "198.51.100.x",
      userAgent: "Vitest/1.0",
      localHostname: "totp-rl-host",
      trustSource: "login",
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      sessionEpoch: 1,
      devices: [device],
      auditLog: [],
    }));

    const token = createAdminToken({ epoch: 1, deviceId: device.id });
    cookieMap.set(ADMIN_COOKIE_NAME, { name: ADMIN_COOKIE_NAME, value: token });

    // Enroll TOTP through the public endpoint
    const beginRes = await totpPost(
      new Request("http://127.0.0.1:3000/api/admin/devices/totp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.77",
        },
        body: JSON.stringify({ action: "begin-setup" }),
      })
    );
    expect(beginRes.status).toBe(200);
    const beginBody = (await beginRes.json()) as { manualSecret: string };

    const confirmRes = await totpPost(
      new Request("http://127.0.0.1:3000/api/admin/devices/totp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.77",
        },
        body: JSON.stringify({
          action: "confirm-setup",
          code: computeTotpCode(beginBody.manualSecret),
        }),
      })
    );
    expect(confirmRes.status).toBe(200);

    // 4 initial failed password checks (< maxAttempts=5) from rightmost proxy IP 198.51.100.77
    // with changing spoofed left-side x-forwarded-for entries
    for (let attempt = 1; attempt <= 4; attempt++) {
      const req = new Request("http://127.0.0.1:3000/api/admin/devices/totp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": `203.0.113.${attempt}, 198.51.100.77`,
        },
        body: JSON.stringify({
          action: "disable",
          currentPassword: `WrongPassword#${attempt}`,
        }),
      });

      const res = await totpPost(req);
      expect(res.ok).toBe(false);
      expect(res.status).toBeLessThan(429);
    }

    // 5th failed attempt triggers immediate lockout (429)
    const lockoutReq = new Request("http://127.0.0.1:3000/api/admin/devices/totp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.5, 198.51.100.77",
      },
      body: JSON.stringify({
        action: "disable",
        currentPassword: "WrongPassword#5",
      }),
    });
    const lockoutRes = await totpPost(lockoutReq);
    expect(lockoutRes.status).toBe(429);

    // Subsequent attempt even with the right password and spoofed left IP stays blocked (429)
    const blockedReq = new Request("http://127.0.0.1:3000/api/admin/devices/totp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.250, 198.51.100.77",
      },
      body: JSON.stringify({
        action: "disable",
        currentPassword: "CorrectAdminPassword#2026",
      }),
    });

    const blockedRes = await totpPost(blockedReq);
    expect(blockedRes.status).toBe(429);

    const updatedStore = await readAdminSecurityStore();
    expect(toSafeSecuritySummary(updatedStore, device.id).totpEnabled).toBe(true);
    expect(updatedStore.auditLog.some((e) => e.action === "login_failed")).toBe(true);
    expect(updatedStore.auditLog.some((e) => e.action === "login_blocked")).toBe(true);
  });
});
