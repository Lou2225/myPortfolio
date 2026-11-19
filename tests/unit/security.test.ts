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

import {
  buildDeviceFromTelemetry,
  checkSecurityRateLimit,
  clearSecurityRateBucket,
  getDefaultSecurityStore,
  mutateAdminSecurityStore,
  readAdminSecurityStore,
  recordSecurityRateFailure,
  SecurityStoreConflictError,
  sha256Hex,
  upsertTrustedDevice,
  verifyStealthRecoveryKey,
} from "@/lib/security";
import { POST as pairVerifyPost, PUT as pairVerifyPut } from "@/app/api/admin/devices/pair/verify/route";
import { extractNormalizedClientIp } from "@/lib/rateLimit";
import type { PairingChallenge } from "@/types/security";

let tempDataDir = "";
const origEnv = {
  PORTFOLIO_DATA_DIR: process.env.PORTFOLIO_DATA_DIR,
  PORTFOLIO_FORCE_LOCAL_STORAGE: process.env.PORTFOLIO_FORCE_LOCAL_STORAGE,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  ADMIN_STEALTH_KEY: process.env.ADMIN_STEALTH_KEY,
};

const VALID_TELEMETRY = {
  suggestedName: "Pixel 9 Test",
  model: "Pixel 9",
  platform: "Android",
  osVersion: "15",
  browser: "Chrome Mobile",
  deviceType: "mobile" as const,
  secureContext: true,
};

function makeChallenge(overrides?: Partial<PairingChallenge>): PairingChallenge {
  const id = overrides?.id || `pair_chal_${Math.random().toString(16).slice(2, 14)}`;
  return {
    id,
    codeHash: sha256Hex("654321"),
    claimTokenHash: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    attempts: 0,
    maxAttempts: 5,
    grantAdminSession: true,
    requireDesktopApproval: true,
    status: "pending",
    createdByDeviceId: null,
    pendingDevice: null,
    pairedDeviceId: null,
    ...overrides,
  };
}

describe("Security Rate Limiting, Stealth Keys & Pairing Abuse Guards", () => {
  beforeAll(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-sec-test-"));
    process.env.PORTFOLIO_DATA_DIR = tempDataDir;
    process.env.PORTFOLIO_FORCE_LOCAL_STORAGE = "1";
    process.env.ADMIN_SESSION_SECRET = "unit-test-hmac-secret-32-chars-minimum!";
  });

  beforeEach(async () => {
    cookieMap.clear();
    delete process.env.ADMIN_STEALTH_KEY;
    await mutateAdminSecurityStore(() => getDefaultSecurityStore());
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("enforces login/pairing rate-limit buckets and resets after clearing", () => {
    let store = getDefaultSecurityStore();
    const bucketKey = "192.0.2.10";

    for (let i = 0; i < 4; i += 1) {
      store = recordSecurityRateFailure(store, bucketKey, { maxFailures: 5 });
      expect(checkSecurityRateLimit(store, bucketKey).allowed).toBe(true);
    }

    store = recordSecurityRateFailure(store, bucketKey, { maxFailures: 5 });
    const blocked = checkSecurityRateLimit(store, bucketKey);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    store = clearSecurityRateBucket(store, bucketKey);
    expect(checkSecurityRateLimit(store, bucketKey).allowed).toBe(true);
  });

  it("burns QR pairing challenge after 5 wrong 6-digit code attempts", async () => {
    const challenge = makeChallenge({
      id: "pair_chal_burn_test_01",
      codeHash: sha256Hex("123456"),
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      pairings: [challenge],
    }));

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const req = new Request("http://127.0.0.1:3100/api/admin/devices/pair/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": `198.51.100.${attempt}`,
        },
        body: JSON.stringify({
          challengeId: challenge.id,
          code: "000000",
          deviceName: "Test Phone",
          telemetry: VALID_TELEMETRY,
        }),
      });
      const res = await pairVerifyPost(req);
      const data = (await res.json()) as { burned?: boolean; attemptsRemaining?: number };
      expect(res.status).toBe(401);
      expect(data.attemptsRemaining).toBe(5 - attempt);
      if (attempt === 5) {
        expect(data.burned).toBe(true);
      }
    }

    const updatedStore = await readAdminSecurityStore();
    const persisted = updatedStore.pairings.find((p) => p.id === challenge.id);
    expect(persisted?.status).toBe("burned");

    // Subsequent attempt—even with the right code—is rejected because challenge is burned.
    const postBurnReq = new Request("http://127.0.0.1:3100/api/admin/devices/pair/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.id,
        code: "123456",
        deviceName: "Test Phone",
        telemetry: VALID_TELEMETRY,
      }),
    });
    const postBurnRes = await pairVerifyPost(postBurnReq);
    expect(postBurnRes.status).toBe(409);
  });

  it("enforces expiry on both pending and approved pairing challenges", async () => {
    const claimSecret = "claim-secret-token-for-expiry-check";
    const expiredPending = makeChallenge({
      id: "pair_chal_exp_pending_01",
      status: "pending",
      expiresAt: new Date(Date.now() - 10_000).toISOString(),
    });
    const expiredApproved = makeChallenge({
      id: "pair_chal_exp_approved_01",
      status: "approved",
      claimTokenHash: sha256Hex(claimSecret),
      pairedDeviceId: "dev_never_used",
      expiresAt: new Date(Date.now() - 10_000).toISOString(),
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      pairings: [expiredPending, expiredApproved],
    }));

    const postRes = await pairVerifyPost(
      new Request("http://127.0.0.1:3100/api/admin/devices/pair/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: expiredPending.id,
          code: "654321",
          deviceName: "Test Phone",
          telemetry: VALID_TELEMETRY,
        }),
      })
    );
    expect(postRes.status).toBe(410);

    const putRes = await pairVerifyPut(
      new Request("http://127.0.0.1:3100/api/admin/devices/pair/verify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: expiredApproved.id,
          claimToken: claimSecret,
        }),
      })
    );
    const putData = (await putRes.json()) as { success: boolean; status: string };
    expect(putData.success).toBe(false);
    expect(putData.status).toBe("expired");
  });

  it("verifies stealth recovery keys from env or hashed security store", () => {
    process.env.ADMIN_STEALTH_KEY = "my-stealth-override-key";
    const store = getDefaultSecurityStore();

    expect(verifyStealthRecoveryKey("my-stealth-override-key", store)).toBe(true);
    expect(verifyStealthRecoveryKey("wrong-key", store)).toBe(false);
    expect(verifyStealthRecoveryKey("", store)).toBe(false);
  });

  it("prefers proxy-verified headers and rightmost x-forwarded-for entry in extractNormalizedClientIp", () => {
    expect(
      extractNormalizedClientIp(
        new Headers({
          "x-vercel-forwarded-for": "198.51.100.10",
          "x-real-ip": "203.0.113.20",
          "x-forwarded-for": "1.2.3.4, 203.0.113.30",
        })
      )
    ).toBe("198.51.100.10");

    expect(
      extractNormalizedClientIp(
        new Headers({
          "x-real-ip": "::ffff:198.51.100.42",
          "x-forwarded-for": "1.2.3.4, 203.0.113.50",
        })
      )
    ).toBe("198.51.100.42");

    expect(
      extractNormalizedClientIp(
        new Headers({
          "x-forwarded-for": "10.0.0.1, 203.0.113.77",
        })
      )
    ).toBe("203.0.113.77");
  });

  it("retries optimistic concurrency conflicts in Supabase mode without losing concurrent device updates", async () => {
    const prevForceLocal = process.env.PORTFOLIO_FORCE_LOCAL_STORAGE;
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    delete process.env.PORTFOLIO_FORCE_LOCAL_STORAGE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-supabase.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_mock_service_key";

    let serverRevision = 1;
    const existingDevice = buildDeviceFromTelemetry({
      ipMasked: "198.51.100.*",
      userAgent: "Mozilla/5.0 Chrome/131.0",
      localHostname: null,
      trustSource: "login",
      customName: "Existing Laptop",
    });
    const concurrentDevice = buildDeviceFromTelemetry({
      ipMasked: "203.0.113.*",
      userAgent: "Mozilla/5.0 iPhone",
      localHostname: null,
      trustSource: "qr-pair",
      customName: "Concurrent Phone",
    });
    const newDevice = buildDeviceFromTelemetry({
      ipMasked: "192.0.2.*",
      userAgent: "Mozilla/5.0 Edge/131.0",
      localHostname: null,
      trustSource: "login",
      customName: "New Workstation",
    });

    let serverPayload = {
      ...getDefaultSecurityStore(),
      revision: serverRevision,
      devices: [existingDevice],
    };

    let patchCallCount = 0;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        const method = (init?.method || "GET").toUpperCase();

        if (method === "GET") {
          return new Response(JSON.stringify([{ payload: serverPayload }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (method === "PATCH") {
          patchCallCount += 1;
          // Simulate another serverless instance slipping in `concurrentDevice` before our first PATCH lands
          if (patchCallCount === 1) {
            serverRevision = 2;
            serverPayload = {
              ...serverPayload,
              revision: serverRevision,
              devices: [concurrentDevice, ...serverPayload.devices],
            };
            // PostgREST returns 200 with 0 updated rows `[]` when revision filter fails to match
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          expect(urlStr).toContain(`payload->>revision=eq.${serverRevision}`);
          const body = JSON.parse(String(init?.body)) as {
            payload: typeof serverPayload;
          };
          serverRevision = body.payload.revision;
          serverPayload = body.payload;
          return new Response(JSON.stringify([{ id: "admin_security" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response("Unexpected fetch", { status: 500 });
      });

    try {
      const updated = await mutateAdminSecurityStore((store) => {
        const upserted = upsertTrustedDevice(store, newDevice);
        return upserted.store;
      });

      expect(patchCallCount).toBe(2);
      expect(updated.revision).toBe(3);
      // Both the concurrent device AND the newly registered device must be preserved!
      const names = updated.devices.map((d) => d.name);
      expect(names).toContain("New Workstation");
      expect(names).toContain("Concurrent Phone");
      expect(names).toContain("Existing Laptop");
    } finally {
      fetchSpy.mockRestore();
      if (prevForceLocal === undefined) {
        delete process.env.PORTFOLIO_FORCE_LOCAL_STORAGE;
      } else {
        process.env.PORTFOLIO_FORCE_LOCAL_STORAGE = prevForceLocal;
      }
      if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });

  it("throws SecurityStoreConflictError when CAS conflicts exceed maxAttempts", async () => {
    const prevForceLocal = process.env.PORTFOLIO_FORCE_LOCAL_STORAGE;
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    delete process.env.PORTFOLIO_FORCE_LOCAL_STORAGE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-supabase.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_mock_service_key";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_input, init) => {
        const method = (init?.method || "GET").toUpperCase();
        if (method === "GET") {
          return new Response(
            JSON.stringify([
              { payload: { ...getDefaultSecurityStore(), revision: 5 } },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

    try {
      await expect(
        mutateAdminSecurityStore(
          (store) => ({ ...store, sessionEpoch: store.sessionEpoch + 1 }),
          { maxAttempts: 2 }
        )
      ).rejects.toBeInstanceOf(SecurityStoreConflictError);
    } finally {
      fetchSpy.mockRestore();
      if (prevForceLocal === undefined) {
        delete process.env.PORTFOLIO_FORCE_LOCAL_STORAGE;
      } else {
        process.env.PORTFOLIO_FORCE_LOCAL_STORAGE = prevForceLocal;
      }
      if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });

  it("deduplicates plain-HTTP LAN devices lacking a WebCrypto keyThumbprint by hardware & UA profile", () => {
    let store = getDefaultSecurityStore();
    const lanFirst = buildDeviceFromTelemetry({
      ipMasked: "192.168.1.*",
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0",
      localHostname: null,
      trustSource: "login",
      telemetry: {
        model: "Pixel 9",
        platform: "Android",
        screenMetrics: "412×915",
        keyThumbprint: null,
        publicKeySpki: null,
      },
    });
    const lanSecond = buildDeviceFromTelemetry({
      ipMasked: "192.168.1.*",
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0",
      localHostname: null,
      trustSource: "login",
      telemetry: {
        model: "Pixel 9",
        platform: "Android",
        screenMetrics: "412×915",
        keyThumbprint: null,
        publicKeySpki: null,
      },
    });

    store = upsertTrustedDevice(store, lanFirst).store;
    const secondUpsert = upsertTrustedDevice(store, lanSecond);
    expect(secondUpsert.store.devices).toHaveLength(1);
    expect(secondUpsert.saved.id).toBe(lanFirst.id);
  });
});
