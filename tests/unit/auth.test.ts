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

import crypto from "crypto";
import { GET as authGet, POST as authPost } from "@/app/api/admin/auth/route";
import {
  DELETE as passkeyDelete,
  POST as passkeyPost,
} from "@/app/api/admin/devices/passkey/route";
import {
  ADMIN_COOKIE_NAME,
  createAdminToken,
  createDeviceChallengeToken,
  createRegisteredDeviceToken,
  getSessionAndDeviceContext,
  hashAdminPassword,
  isAdminAuthenticated,
  isSecureRequest,
  isSessionSecretConfigured,
  REGISTERED_DEVICE_COOKIE,
  requireSessionSecret,
  verifyDeviceChallengeToken,
  verifyEcdsaDeviceSignature,
  verifyPasswordMatch,
  verifyScryptPasswordHash,
} from "@/lib/auth";
import { buildDeviceFromTelemetry, mutateAdminSecurityStore } from "@/lib/security";
import { resolveCanonicalRedirectUrl } from "@/lib/siteUrl";

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

  it("recovers device registration cookie via WebCrypto ECDSA P-256 hardware key challenge", async () => {
    const subtle = crypto.webcrypto.subtle;
    const keyPair = await subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"]
    );
    const spkiBuf = await subtle.exportKey("spki", keyPair.publicKey);
    const digestBuf = await subtle.digest("SHA-256", spkiBuf);
    const hex = Array.from(new Uint8Array(digestBuf).slice(0, 6))
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join("");
    const thumbprint = `DEV-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
    const publicKeySpki = Buffer.from(spkiBuf).toString("base64");

    const device = buildDeviceFromTelemetry({
      ipMasked: "127.0.0.x",
      userAgent: "Vitest/1.0",
      localHostname: "test-ecdsa",
      trustSource: "login",
      telemetry: {
        keyThumbprint: thumbprint,
        publicKeySpki,
        secureContext: true,
      },
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      sessionEpoch: 1,
      devices: [device],
    }));

    const challenge = createDeviceChallengeToken();
    expect(challenge).toBeTruthy();
    expect(verifyDeviceChallengeToken(challenge)).toBe(true);

    const sigBuf = await subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      new TextEncoder().encode(challenge!)
    );
    const signature = Buffer.from(sigBuf).toString("base64url");

    expect(
      verifyEcdsaDeviceSignature({
        publicKeySpkiBase64: publicKeySpki,
        challenge: challenge!,
        signatureBase64Url: signature,
      })
    ).toBe(true);

    // No cookies present before recovery
    cookieMap.clear();
    const res = await authPost(
      new Request("http://127.0.0.1:3000/api/admin/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.88",
        },
        body: JSON.stringify({
          action: "recover-device-trust",
          challenge,
          keyThumbprint: thumbprint,
          signature,
        }),
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      deviceRegistered: boolean;
      currentDeviceId: string;
    };
    expect(data.success).toBe(true);
    expect(data.deviceRegistered).toBe(true);
    expect(data.currentDeviceId).toBe(device.id);
    expect(cookieMap.get(REGISTERED_DEVICE_COOKIE)?.value).toBeTruthy();

    // Context now recognizes registered device cleanly without granting admin auth
    const recoveredCtx = await getSessionAndDeviceContext();
    expect(recoveredCtx.deviceRegistered).toBe(true);
    expect(recoveredCtx.authenticated).toBe(false);
    expect(recoveredCtx.currentDeviceId).toBe(device.id);
  });

  it("renews aging lou_registered_device cookies (>7d old) and restores missing device cookie from bound active session", async () => {
    const device = buildDeviceFromTelemetry({
      ipMasked: "127.0.0.x",
      userAgent: "Vitest/1.0",
      localHostname: "test-rolling",
      trustSource: "login",
      telemetry: {
        keyThumbprint: "DEV-ABCD-1234-5678",
        secureContext: true,
      },
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      sessionEpoch: 1,
      devices: [device],
    }));

    // 1. Device token issued 10 days ago triggers rolling renewal on GET /api/admin/auth
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const agingDeviceToken = createRegisteredDeviceToken({
      deviceId: device.id,
      keyThumbprint: device.keyThumbprint,
      epoch: 1,
      iat: tenDaysAgo,
    });
    cookieMap.clear();
    cookieMap.set(REGISTERED_DEVICE_COOKIE, {
      name: REGISTERED_DEVICE_COOKIE,
      value: agingDeviceToken,
    });

    const preCtx = await getSessionAndDeviceContext();
    expect(preCtx.deviceRegistered).toBe(true);
    expect(preCtx.deviceTokenNeedsRefresh).toBe(true);

    const getRes = await authGet(
      new Request("http://127.0.0.1:3000/api/admin/auth")
    );
    expect(getRes.status).toBe(200);
    const refreshedToken = cookieMap.get(REGISTERED_DEVICE_COOKIE)?.value;
    expect(refreshedToken).toBeTruthy();
    expect(refreshedToken).not.toBe(agingDeviceToken);

    const postCtx = await getSessionAndDeviceContext();
    expect(postCtx.deviceRegistered).toBe(true);
    expect(postCtx.deviceTokenNeedsRefresh).toBe(false);

    // 2. If lou_registered_device cookie is missing but active session is bound to an active device,
    // GET /api/admin/auth automatically re-issues lou_registered_device.
    cookieMap.clear();
    cookieMap.set(ADMIN_COOKIE_NAME, {
      name: ADMIN_COOKIE_NAME,
      value: createAdminToken({ epoch: 1, deviceId: device.id }),
    });

    const getBoundRes = await authGet(
      new Request("http://127.0.0.1:3000/api/admin/auth")
    );
    expect(getBoundRes.status).toBe(200);
    const boundBody = (await getBoundRes.json()) as {
      authenticated: boolean;
      deviceRegistered: boolean;
      currentDeviceId: string;
    };
    expect(boundBody.authenticated).toBe(true);
    expect(boundBody.deviceRegistered).toBe(true);
    expect(boundBody.currentDeviceId).toBe(device.id);
    expect(cookieMap.get(REGISTERED_DEVICE_COOKIE)?.value).toBeTruthy();
  });

  it("redirects non-canonical production hosts to canonical origin while leaving localhost and previews untouched", () => {
    const prodEnv = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://louvaldellon.vercel.app",
    };

    // Same canonical host -> null (no redirect)
    expect(
      resolveCanonicalRedirectUrl(
        "https://louvaldellon.vercel.app/admin?tab=settings",
        new Headers({ host: "louvaldellon.vercel.app" }),
        prodEnv
      )
    ).toBeNull();

    // Alias or www host in production -> redirects to canonical origin preserving path & query
    expect(
      resolveCanonicalRedirectUrl(
        "https://www.louvaldellon.vercel.app/admin?tab=settings",
        new Headers({ host: "www.louvaldellon.vercel.app" }),
        prodEnv
      )
    ).toBe("https://louvaldellon.vercel.app/admin?tab=settings");

    // Preview deployment (VERCEL_ENV !== "production") -> null
    expect(
      resolveCanonicalRedirectUrl(
        "https://louvaldellon-git-feat.vercel.app/admin",
        new Headers({ host: "louvaldellon-git-feat.vercel.app" }),
        { ...prodEnv, VERCEL_ENV: "preview" }
      )
    ).toBeNull();

    // Localhost / LAN IP -> null
    expect(
      resolveCanonicalRedirectUrl(
        "http://192.168.1.25:3000/admin",
        new Headers({ host: "192.168.1.25:3000" }),
        prodEnv
      )
    ).toBeNull();
  });

  it("enrolls a hardware WebAuthn passkey on louvaldellon.vercel.app, authenticates + links a second browser to the same physical device, and blocks counter replay", async () => {
    const origin = "https://louvaldellon.vercel.app";
    const rpId = "louvaldellon.vercel.app";

    const device = buildDeviceFromTelemetry({
      ipMasked: "198.51.100.*",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0",
      localHostname: null,
      trustSource: "login",
      customName: "Lou's Windows Laptop",
      telemetry: {
        platform: "Windows",
        osVersion: "11",
        browser: "Chrome",
        model: "Windows PC",
        deviceType: "desktop",
        secureContext: true,
      },
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      sessionEpoch: 1,
      devices: [device],
      passkeys: [],
    }));

    // Authenticate initial browser session in Chrome
    cookieMap.set(ADMIN_COOKIE_NAME, {
      name: ADMIN_COOKIE_NAME,
      value: createAdminToken({ epoch: 1, deviceId: device.id }),
    });

    // 1. Request passkey registration options
    const regOptRes = await passkeyPost(
      new Request(`${origin}/api/admin/devices/passkey`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin,
        },
        body: JSON.stringify({
          action: "register-options",
          deviceId: device.id,
        }),
      })
    );
    expect(regOptRes.status).toBe(200);
    const regOpt = (await regOptRes.json()) as {
      success: boolean;
      challenge: string;
      rpId: string;
    };
    expect(regOpt.success).toBe(true);
    expect(regOpt.rpId).toBe(rpId);

    // 2. Simulate Windows Hello TPM ES256 keypair & authenticatorData (UP=1, UV=1, AT=1, counter=1)
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const spkiDer = publicKey.export({ type: "spki", format: "der" });
    const credentialId = "cred_win_hello_lou_01";

    const rpIdHash = crypto.createHash("sha256").update(rpId).digest();
    const flags = Buffer.from([0x01 | 0x04 | 0x40]); // UP + UV + AT (Hardware-Bound: BS=0)
    const signCountBuf = Buffer.alloc(4);
    signCountBuf.writeUInt32BE(1, 0);
    // Windows Hello AAGUID: 08987058-cadc-4b81-b6e1-30de50dcbe96
    const winHelloAaguid = Buffer.from(
      "08987058cadc4b81b6e130de50dcbe96",
      "hex"
    );
    const regAuthData = Buffer.concat([
      rpIdHash,
      flags,
      signCountBuf,
      winHelloAaguid,
      Buffer.alloc(2),
    ]);

    const regClientData = Buffer.from(
      JSON.stringify({
        type: "webauthn.create",
        challenge: Buffer.from(regOpt.challenge, "utf-8").toString("base64url"),
        origin,
      }),
      "utf-8"
    );

    const regVerifyRes = await passkeyPost(
      new Request(`${origin}/api/admin/devices/passkey`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin,
        },
        body: JSON.stringify({
          action: "register-verify",
          credentialId,
          clientDataJSON: regClientData.toString("base64url"),
          authenticatorData: regAuthData.toString("base64url"),
          publicKeySpki: Buffer.from(spkiDer).toString("base64url"),
          algorithm: -7,
          transports: ["internal"],
          telemetry: {
            suggestedName: "Windows 11 · Chrome",
            model: "Windows PC",
            platform: "Windows",
            osVersion: "11",
            browser: "Chrome",
            deviceType: "desktop",
            secureContext: true,
          },
        }),
      })
    );
    expect(regVerifyRes.status).toBe(200);
    const regVerifyData = (await regVerifyRes.json()) as {
      success: boolean;
      currentDeviceId: string;
      passkey: { authenticatorLabel: string; backedUp: boolean };
    };
    expect(regVerifyData.success).toBe(true);
    expect(regVerifyData.currentDeviceId).toBe(device.id);
    expect(regVerifyData.passkey.authenticatorLabel).toBe("Windows Hello");
    expect(regVerifyData.passkey.backedUp).toBe(false);

    // 3. Clear ALL cookies to simulate opening Microsoft Edge (a brand-new browser) on the same laptop
    cookieMap.clear();
    const unauthCtx = await getSessionAndDeviceContext();
    expect(unauthCtx.authenticated).toBe(false);
    expect(unauthCtx.deviceRegistered).toBe(false);

    // 4. Request passkey auth options from Edge
    const authOptRes = await passkeyPost(
      new Request(`${origin}/api/admin/devices/passkey`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin,
        },
        body: JSON.stringify({ action: "auth-options" }),
      })
    );
    expect(authOptRes.status).toBe(200);
    const authOpt = (await authOptRes.json()) as {
      available: boolean;
      challenge: string;
      allowCredentialIds: string[];
    };
    expect(authOpt.available).toBe(true);
    expect(authOpt.allowCredentialIds).toContain(credentialId);

    // 5. Sign assertion with Windows Hello private key (counter = 2)
    const authCountBuf = Buffer.alloc(4);
    authCountBuf.writeUInt32BE(2, 0);
    const assertAuthData = Buffer.concat([
      rpIdHash,
      Buffer.from([0x01 | 0x04]), // UP + UV
      authCountBuf,
    ]);
    const assertClientData = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: Buffer.from(authOpt.challenge, "utf-8").toString(
          "base64url"
        ),
        origin,
      }),
      "utf-8"
    );
    const clientDataHash = crypto
      .createHash("sha256")
      .update(assertClientData)
      .digest();
    const derSignature = crypto.sign(
      "sha256",
      Buffer.concat([assertAuthData, clientDataHash]),
      privateKey
    );

    const authVerifyRes = await passkeyPost(
      new Request(`${origin}/api/admin/devices/passkey`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin,
        },
        body: JSON.stringify({
          action: "auth-verify",
          credentialId,
          clientDataJSON: assertClientData.toString("base64url"),
          authenticatorData: assertAuthData.toString("base64url"),
          signature: derSignature.toString("base64url"),
          telemetry: {
            suggestedName: "Windows 11 · Microsoft Edge",
            model: "Windows PC",
            platform: "Windows",
            osVersion: "11",
            browser: "Microsoft Edge",
            deviceType: "desktop",
            keyThumbprint: "DEV-EDGE-9999-0001",
            secureContext: true,
          },
        }),
      })
    );
    expect(authVerifyRes.status).toBe(200);
    const authVerifyData = (await authVerifyRes.json()) as {
      success: boolean;
      authenticated: boolean;
      deviceRegistered: boolean;
      currentDeviceId: string;
      authenticatorLabel: string;
    };
    expect(authVerifyData.success).toBe(true);
    expect(authVerifyData.authenticated).toBe(true);
    expect(authVerifyData.deviceRegistered).toBe(true);
    // Links Edge directly to the exact same physical TrustedDevice ID!
    expect(authVerifyData.currentDeviceId).toBe(device.id);
    expect(authVerifyData.authenticatorLabel).toBe("Windows Hello");

    // Verify both session and device cookies were issued for Edge
    const edgeCtx = await getSessionAndDeviceContext();
    expect(edgeCtx.authenticated).toBe(true);
    expect(edgeCtx.deviceRegistered).toBe(true);
    expect(edgeCtx.currentDeviceId).toBe(device.id);

    // 6. Replaying the same or lower signature counter (counter = 2) must be rejected
    const replayOptRes = await passkeyPost(
      new Request(`${origin}/api/admin/devices/passkey`, {
        method: "POST",
        headers: { "Content-Type": "application/json", origin },
        body: JSON.stringify({ action: "auth-options" }),
      })
    );
    const replayOpt = (await replayOptRes.json()) as { challenge: string };
    const replayClientData = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: Buffer.from(replayOpt.challenge, "utf-8").toString(
          "base64url"
        ),
        origin,
      }),
      "utf-8"
    );
    const replaySig = crypto.sign(
      "sha256",
      Buffer.concat([
        assertAuthData,
        crypto.createHash("sha256").update(replayClientData).digest(),
      ]),
      privateKey
    );
    const replayRes = await passkeyPost(
      new Request(`${origin}/api/admin/devices/passkey`, {
        method: "POST",
        headers: { "Content-Type": "application/json", origin },
        body: JSON.stringify({
          action: "auth-verify",
          credentialId,
          clientDataJSON: replayClientData.toString("base64url"),
          authenticatorData: assertAuthData.toString("base64url"),
          signature: replaySig.toString("base64url"),
        }),
      })
    );
    expect(replayRes.status).toBe(401);

    // 7. Deleting the passkey removes it from the security store
    const delRes = await passkeyDelete(
      new Request(
        `${origin}/api/admin/devices/passkey?credentialId=${encodeURIComponent(credentialId)}`,
        { method: "DELETE" }
      )
    );
    expect(delRes.status).toBe(200);
    const delData = (await delRes.json()) as {
      success: boolean;
      summary: { passkeys: unknown[] };
    };
    expect(delData.success).toBe(true);
    expect(delData.summary.passkeys).toHaveLength(0);
  });

  it("automatically recognizes a second browser (e.g. Chrome after registering Brave) on the same physical laptop & network via recognize-physical-device", async () => {
    const braveDevice = buildDeviceFromTelemetry({
      ipMasked: "198.51.100.*",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Brave/131.0",
      localHostname: null,
      trustSource: "login",
      customName: "Windows 11 · Brave",
      telemetry: {
        platform: "Windows",
        osVersion: "11",
        browser: "Brave",
        model: "Windows PC",
        deviceType: "desktop",
        screenMetrics: "1366×768",
        cpuCores: 8,
        timezone: "Asia/Manila",
        keyThumbprint: "DEV-536E-D1EF-0523",
        publicKeySpki: "brave-spki-placeholder",
        secureContext: true,
      },
    });

    await mutateAdminSecurityStore((store) => ({
      ...store,
      sessionEpoch: 1,
      stealthGateEnabled: true,
      devices: [braveDevice],
    }));

    // Simulate opening Chrome on the exact same laptop (empty cookie jar)
    cookieMap.clear();
    const challenge = createDeviceChallengeToken()!;

    // Generate Chrome's own WebCrypto ECDSA P-256 keypair
    const subtle = crypto.webcrypto.subtle;
    const chromeKeyPair = await subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"]
    );
    const spkiBuf = await subtle.exportKey("spki", chromeKeyPair.publicKey);
    const chromeSpkiBase64 = Buffer.from(spkiBuf).toString("base64");
    const sigBuf = await subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      chromeKeyPair.privateKey,
      new TextEncoder().encode(challenge)
    );
    const chromeSignature = Buffer.from(sigBuf).toString("base64url");

    const recogRes = await authPost(
      new Request("https://louvaldellon.vercel.app/api/admin/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.42",
        },
        body: JSON.stringify({
          action: "recognize-physical-device",
          challenge,
          signature: chromeSignature,
          telemetry: {
            suggestedName: "Windows 11 · Chrome",
            model: "Windows PC",
            platform: "Windows",
            osVersion: "11",
            browser: "Chrome",
            deviceType: "desktop",
            screenMetrics: "1366×768",
            cpuCores: 8,
            timezone: "Asia/Manila",
            keyThumbprint: "DEV-CHRM-7777-8888",
            publicKeySpki: chromeSpkiBase64,
            secureContext: true,
          },
        }),
      })
    );

    expect(recogRes.status).toBe(200);
    const recogData = (await recogRes.json()) as {
      success: boolean;
      deviceRegistered: boolean;
      currentDeviceId: string;
    };
    expect(recogData.success).toBe(true);
    expect(recogData.deviceRegistered).toBe(true);
    expect(recogData.currentDeviceId).toBe(braveDevice.id);
    expect(cookieMap.get(REGISTERED_DEVICE_COOKIE)?.value).toBeTruthy();

    // Chrome is now recognized as a registered device and passes the Stealth Gate!
    const chromeCtx = await getSessionAndDeviceContext();
    expect(chromeCtx.deviceRegistered).toBe(true);
    expect(chromeCtx.currentDeviceId).toBe(braveDevice.id);
  });
});
