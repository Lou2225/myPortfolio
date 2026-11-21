import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAdminAuthMeta,
  getSessionAndDeviceContext,
  isSecureRequest,
  isSessionSecretConfigured,
  setDeviceCookie,
  setSessionCookie,
} from "@/lib/auth";
import { getStorageMode, StorageReadError, StorageWriteError } from "@/lib/db";
import {
  createPasskeyChallengeToken,
  resolvePasskeyRelyingParty,
  verifyPasskeyAssertion,
  verifyPasskeyRegistration,
} from "@/lib/passkeyServer";
import {
  appendSecurityAudit,
  buildDeviceFromTelemetry,
  checkSecurityRateLimit,
  clearSecurityRateBucket,
  extractRequestNetworkInfo,
  mutateAdminSecurityStore,
  readAdminSecurityStore,
  recordSecurityRateFailure,
  toSafeSecuritySummary,
  upsertTrustedDevice,
} from "@/lib/security";
import { clientTelemetrySchema, sanitizeDeviceLabel } from "@/lib/validation";
import type { DevicePasskey } from "@/types/security";

export async function POST(request: Request) {
  const reqInfo = extractRequestNetworkInfo(request.headers);

  try {
    if (!isSessionSecretConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ADMIN_SESSION_SECRET is not configured in environment variables.",
        },
        { status: 503 }
      );
    }

    const rp = resolvePasskeyRelyingParty(request);
    if (!rp.supported) {
      return NextResponse.json(
        {
          success: false,
          error:
            rp.reason ||
            "WebAuthn passkeys are not supported on this origin.",
        },
        { status: 400 }
      );
    }

    let body: {
      action?:
        | "register-options"
        | "register-verify"
        | "auth-options"
        | "auth-verify";
      deviceId?: string;
      deviceName?: string;
      credentialId?: string;
      clientDataJSON?: string;
      authenticatorData?: string;
      publicKeySpki?: string;
      signature?: string;
      algorithm?: number;
      transports?: string[];
      telemetry?: unknown;
    };
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { success: false, error: "Invalid JSON request body." },
          { status: 400 }
        );
      }
      body = parsed as typeof body;
    } catch {
      return NextResponse.json(
        { success: false, error: "Malformed JSON request body." },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // 1. Passkey Registration Options (Requires Authenticated Admin Session)
    // -------------------------------------------------------------------------
    if (body.action === "register-options") {
      const ctx = await getSessionAndDeviceContext();
      if (!ctx.authenticated || !ctx.securityStore) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const store = ctx.securityStore;
      const targetDeviceId =
        typeof body.deviceId === "string" && body.deviceId.trim()
          ? body.deviceId.trim()
          : ctx.currentDeviceId;
      const challenge = createPasskeyChallengeToken({
        purpose: "register",
        rpId: rp.rpId,
        origin: rp.origin,
        deviceId: targetDeviceId,
      });

      const excludeCredentialIds = store.passkeys
        .filter((pk) => pk.rpId === rp.rpId)
        .map((pk) => pk.credentialId);

      return NextResponse.json(
        {
          success: true,
          challenge,
          rpId: rp.rpId,
          rpName: "Lou Diamond Valdellon — Portfolio CMS",
          user: {
            id: "lou-portfolio-admin-owner",
            name: "lou-admin",
            displayName: "Lou Diamond Valdellon (Admin)",
          },
          excludeCredentialIds,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // -------------------------------------------------------------------------
    // 2. Passkey Registration Verification (Requires Authenticated Admin Session)
    // -------------------------------------------------------------------------
    if (body.action === "register-verify") {
      const ctx = await getSessionAndDeviceContext();
      if (!ctx.authenticated) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const parsedTelemetry = clientTelemetrySchema.safeParse(
        body.telemetry ?? {}
      );
      const telemetry = parsedTelemetry.success ? parsedTelemetry.data : null;

      const verified = verifyPasskeyRegistration({
        credentialId:
          typeof body.credentialId === "string" ? body.credentialId : "",
        clientDataJSONBase64Url:
          typeof body.clientDataJSON === "string" ? body.clientDataJSON : "",
        authenticatorDataBase64Url:
          typeof body.authenticatorData === "string"
            ? body.authenticatorData
            : "",
        publicKeySpkiBase64Url:
          typeof body.publicKeySpki === "string" ? body.publicKeySpki : "",
        algorithm: body.algorithm,
        transports: body.transports,
        expectedRpId: rp.rpId,
        expectedOrigin: rp.origin,
        platformHint: telemetry?.platform ?? null,
      });

      if (!verified.ok) {
        return NextResponse.json(
          { success: false, error: verified.error },
          { status: 400 }
        );
      }

      const customName =
        typeof body.deviceName === "string" && body.deviceName.trim()
          ? sanitizeDeviceLabel(body.deviceName, 60)
          : undefined;

      const initialDeviceId =
        verified.challengePayload.deviceId || ctx.currentDeviceId || "";
      let boundDeviceId = initialDeviceId;
      let boundThumbprint: string | null = telemetry?.keyThumbprint ?? null;
      let savedPasskey: DevicePasskey | null = null;
      let nonceReplayed = false;

      const updatedStore = await mutateAdminSecurityStore((store) => {
        nonceReplayed = false;
        boundDeviceId = initialDeviceId;
        boundThumbprint = telemetry?.keyThumbprint ?? null;
        savedPasskey = null;

        if (store.usedPasskeyNonces[verified.challengePayload.nonce]) {
          nonceReplayed = true;
          return store;
        }

        // Ensure a physical TrustedDevice record exists and is active for this passkey
        const builtDevice = buildDeviceFromTelemetry({
          telemetry,
          customName,
          ipMasked: reqInfo.ipMasked,
          userAgent: reqInfo.userAgent,
          localHostname: reqInfo.localHostname,
          trustSource: "passkey",
          existingDeviceId: boundDeviceId || undefined,
        });

        const upserted = upsertTrustedDevice(store, builtDevice, {
          preserveExistingName: !customName,
        });

        boundDeviceId = upserted.saved.id;
        boundThumbprint = upserted.saved.keyThumbprint;

        const nowIso = new Date().toISOString();
        const passkeyRecord: DevicePasskey = {
          credentialId: verified.credentialId,
          publicKeySpki: verified.publicKeySpki,
          algorithm: verified.algorithm,
          counter: verified.counter,
          transports: verified.transports,
          aaguid: verified.aaguid,
          authenticatorLabel: verified.authenticatorLabel,
          backedUp: verified.backedUp,
          rpId: verified.rpId,
          deviceId: boundDeviceId,
          createdAt: nowIso,
          lastUsedAt: nowIso,
        };
        savedPasskey = passkeyRecord;

        // Enforce 1 active passkey per physical device per domain (rpId)
        const filteredPasskeys = upserted.store.passkeys.filter(
          (pk) =>
            pk.credentialId !== passkeyRecord.credentialId &&
            !(pk.deviceId === boundDeviceId && pk.rpId === passkeyRecord.rpId)
        );

        return appendSecurityAudit(
          {
            ...upserted.store,
            passkeys: [passkeyRecord, ...filteredPasskeys],
            usedPasskeyNonces: {
              ...upserted.store.usedPasskeyNonces,
              [verified.challengePayload.nonce]: verified.challengePayload.exp,
            },
          },
          {
            action: "passkey_registered",
            actorDeviceId: boundDeviceId,
            targetDeviceId: boundDeviceId,
            deviceLabel: upserted.saved.name,
            ipMasked: reqInfo.ipMasked,
            outcome: "success",
            detail: `Linked ${passkeyRecord.authenticatorLabel} passkey (${passkeyRecord.backedUp ? "Synced" : "Hardware-Bound"} · ${passkeyRecord.rpId}).`,
          }
        );
      });

      if (nonceReplayed) {
        return NextResponse.json(
          {
            success: false,
            error: "Passkey registration challenge was already used. Please retry.",
          },
          { status: 409 }
        );
      }

      const cookieStore = await cookies();
      const secureCookie = isSecureRequest(request);
      setDeviceCookie(cookieStore, {
        deviceId: boundDeviceId,
        keyThumbprint: boundThumbprint,
        epoch: updatedStore.sessionEpoch,
        secure: secureCookie,
      });
      setSessionCookie(cookieStore, {
        epoch: updatedStore.sessionEpoch,
        deviceId: boundDeviceId,
        secure: secureCookie,
      });

      return NextResponse.json(
        {
          success: true,
          passkey: savedPasskey,
          currentDeviceId: boundDeviceId,
          summary: toSafeSecuritySummary(updatedStore, boundDeviceId),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // -------------------------------------------------------------------------
    // 3. Passkey Authentication Options (Public, Rate-Limited, Stealth-Safe)
    // -------------------------------------------------------------------------
    if (body.action === "auth-options") {
      const rateKey = `passkey-auth:${reqInfo.ipRateKey}`;
      const ctx = await getSessionAndDeviceContext();
      if (ctx.storageUnavailable || !ctx.securityStore) {
        return NextResponse.json(
          { success: false, error: "Security registry is temporarily unavailable." },
          { status: 503 }
        );
      }
      const store = ctx.securityStore;
      const rate = checkSecurityRateLimit(store, rateKey);
      if (!rate.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `Too many passkey attempts. Retry in ${rate.retryAfterSec}s.`,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(rate.retryAfterSec),
              "Cache-Control": "no-store",
            },
          }
        );
      }

      const activeDeviceIds = new Set(
        store.devices.filter((d) => d.status === "active").map((d) => d.id)
      );
      const matchingPasskeys = store.passkeys.filter(
        (pk) => pk.rpId === rp.rpId && activeDeviceIds.has(pk.deviceId)
      );

      if (matchingPasskeys.length === 0) {
        return NextResponse.json(
          {
            success: true,
            available: false,
            rpId: rp.rpId,
            allowCredentialIds: [],
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      const stealthRestricted =
        store.stealthGateEnabled &&
        activeDeviceIds.size > 0 &&
        !ctx.authenticated &&
        !ctx.deviceRegistered;

      const challenge = createPasskeyChallengeToken({
        purpose: "auth",
        rpId: rp.rpId,
        origin: rp.origin,
      });

      return NextResponse.json(
        {
          success: true,
          available: true,
          challenge,
          rpId: rp.rpId,
          // Under Stealth Gate for unregistered browsers, use discoverable credentials (empty allowList)
          // so registered credential IDs are never enumerated by anonymous callers.
          allowCredentialIds: stealthRestricted
            ? []
            : matchingPasskeys.map((pk) => pk.credentialId),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // -------------------------------------------------------------------------
    // 4. Passkey Authentication Verification (1-Step Sign-In + Browser Link)
    // -------------------------------------------------------------------------
    if (body.action === "auth-verify") {
      const rateKey = `passkey-auth:${reqInfo.ipRateKey}`;
      const preStore = await readAdminSecurityStore();
      const rate = checkSecurityRateLimit(preStore, rateKey);
      if (!rate.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `Too many failed passkey attempts. Retry in ${rate.retryAfterSec}s.`,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(rate.retryAfterSec),
              "Cache-Control": "no-store",
            },
          }
        );
      }

      const credentialId =
        typeof body.credentialId === "string" ? body.credentialId.trim() : "";
      const clientDataJSONBase64Url =
        typeof body.clientDataJSON === "string" ? body.clientDataJSON : "";
      const authenticatorDataBase64Url =
        typeof body.authenticatorData === "string"
          ? body.authenticatorData
          : "";
      const signatureBase64Url =
        typeof body.signature === "string" ? body.signature : "";

      const parsedTelemetry = clientTelemetrySchema.safeParse(
        body.telemetry ?? {}
      );
      const telemetry = parsedTelemetry.success ? parsedTelemetry.data : null;

      type PasskeyVerifyOutcome =
        | {
            ok: true;
            deviceId: string;
            deviceName: string;
            authenticatorLabel: string;
            thumbprint: string | null;
          }
        | { ok: false; status: number; error: string };

      let verifyOutcome: PasskeyVerifyOutcome = {
        ok: false,
        status: 401,
        error: "Passkey is not recognized or its device was revoked.",
      };

      // Atomically validate passkey existence, active device, single-use nonce,
      // cryptographic signature, and monotonic counter inside the CAS transaction.
      const updatedStore = await mutateAdminSecurityStore((store) => {
        verifyOutcome = {
          ok: false,
          status: 401,
          error: "Passkey is not recognized or its device was revoked.",
        };

        const currentRate = checkSecurityRateLimit(store, rateKey);
        if (!currentRate.allowed) {
          verifyOutcome = {
            ok: false,
            status: 429,
            error: `Too many failed passkey attempts. Retry in ${currentRate.retryAfterSec}s.`,
          };
          return store;
        }

        const matchedPasskey = store.passkeys.find(
          (pk) => pk.credentialId === credentialId && pk.rpId === rp.rpId
        );
        const linkedDevice = matchedPasskey
          ? store.devices.find(
              (d) => d.id === matchedPasskey.deviceId && d.status === "active"
            )
          : null;

        if (!matchedPasskey || !linkedDevice) {
          return recordSecurityRateFailure(store, rateKey, { maxFailures: 6 });
        }

        const assertion = verifyPasskeyAssertion({
          clientDataJSONBase64Url,
          authenticatorDataBase64Url,
          signatureBase64Url,
          storedPublicKeySpkiBase64: matchedPasskey.publicKeySpki,
          storedCounter: matchedPasskey.counter,
          expectedRpId: rp.rpId,
          expectedOrigin: rp.origin,
        });

        if (!assertion.ok) {
          verifyOutcome = { ok: false, status: 401, error: assertion.error };
          const penalized = recordSecurityRateFailure(store, rateKey, {
            maxFailures: 6,
          });
          return appendSecurityAudit(penalized, {
            action: "login_failed",
            actorDeviceId: linkedDevice.id,
            targetDeviceId: linkedDevice.id,
            deviceLabel: linkedDevice.name,
            ipMasked: reqInfo.ipMasked,
            outcome: "blocked",
            detail: `Passkey assertion rejected (${assertion.error})`,
          });
        }

        // Single-use nonce enforcement defeats replay even when synced passkeys report signCount === 0
        if (store.usedPasskeyNonces[assertion.challengePayload.nonce]) {
          verifyOutcome = {
            ok: false,
            status: 401,
            error: "Passkey challenge was already consumed. Please retry.",
          };
          const penalized = recordSecurityRateFailure(store, rateKey, {
            maxFailures: 6,
          });
          return appendSecurityAudit(penalized, {
            action: "login_blocked",
            actorDeviceId: linkedDevice.id,
            targetDeviceId: linkedDevice.id,
            deviceLabel: linkedDevice.name,
            ipMasked: reqInfo.ipMasked,
            outcome: "blocked",
            detail: "Blocked replayed WebAuthn passkey challenge nonce.",
          });
        }

        let nextStore = clearSecurityRateBucket(store, rateKey);
        nextStore = clearSecurityRateBucket(nextStore, reqInfo.ipRateKey);

        const nowIso = new Date().toISOString();
        const nextPasskeys = nextStore.passkeys.map((pk) =>
          pk.credentialId === matchedPasskey.credentialId
            ? {
                ...pk,
                counter: assertion.newCounter,
                backedUp: assertion.backedUp,
                lastUsedAt: nowIso,
              }
            : pk
        );

        let updatedThumbprint: string | null =
          telemetry?.keyThumbprint || linkedDevice.keyThumbprint;

        const nextDevices = nextStore.devices.map((d) => {
          if (d.id !== linkedDevice.id) return d;
          const nextBrowserKeys: Record<string, string> = {
            ...(d.browserKeys || {}),
            ...(d.keyThumbprint && d.publicKeySpki
              ? { [d.keyThumbprint]: d.publicKeySpki }
              : {}),
            ...(telemetry?.keyThumbprint && telemetry?.publicKeySpki
              ? { [telemetry.keyThumbprint]: telemetry.publicKeySpki }
              : {}),
          };
          const nextBrowsers = Array.from(
            new Set(
              [...(d.browsers || [d.browser]), telemetry?.browser].filter(
                (entry): entry is string => Boolean(entry)
              )
            )
          );
          const nextKeyThumbprint =
            telemetry?.keyThumbprint || d.keyThumbprint || null;
          const nextPublicKeySpki =
            telemetry?.publicKeySpki || d.publicKeySpki || null;
          updatedThumbprint = nextKeyThumbprint;
          return {
            ...d,
            browser: telemetry?.browser || d.browser,
            browsers: nextBrowsers,
            browserKeys: nextBrowserKeys,
            osVersion: telemetry?.osVersion || d.osVersion,
            keyThumbprint: nextKeyThumbprint,
            publicKeySpki: nextPublicKeySpki,
            ipMasked: reqInfo.ipMasked,
            userAgent: reqInfo.userAgent,
            lastSeenAt: nowIso,
          };
        });

        verifyOutcome = {
          ok: true,
          deviceId: linkedDevice.id,
          deviceName: linkedDevice.name,
          authenticatorLabel: matchedPasskey.authenticatorLabel,
          thumbprint: updatedThumbprint,
        };

        return appendSecurityAudit(
          {
            ...nextStore,
            devices: nextDevices,
            passkeys: nextPasskeys,
            usedPasskeyNonces: {
              ...nextStore.usedPasskeyNonces,
              [assertion.challengePayload.nonce]: assertion.challengePayload.exp,
            },
          },
          {
            action: "passkey_login",
            actorDeviceId: linkedDevice.id,
            targetDeviceId: linkedDevice.id,
            deviceLabel: linkedDevice.name,
            ipMasked: reqInfo.ipMasked,
            outcome: "success",
            detail: `Authenticated & linked browser via ${matchedPasskey.authenticatorLabel} passkey (${telemetry?.browser || linkedDevice.browser}).`,
          }
        );
      });

      const outcome = verifyOutcome as unknown as PasskeyVerifyOutcome;
      if (!outcome.ok) {
        return NextResponse.json(
          { success: false, error: outcome.error },
          {
            status: outcome.status,
            headers: { "Cache-Control": "no-store" },
          }
        );
      }

      const cookieStore = await cookies();
      const secureCookie = isSecureRequest(request);
      setSessionCookie(cookieStore, {
        epoch: updatedStore.sessionEpoch,
        deviceId: outcome.deviceId,
        secure: secureCookie,
      });
      setDeviceCookie(cookieStore, {
        deviceId: outcome.deviceId,
        keyThumbprint: outcome.thumbprint,
        epoch: updatedStore.sessionEpoch,
        secure: secureCookie,
      });

      const authMeta = await getAdminAuthMeta();
      return NextResponse.json(
        {
          success: true,
          authenticated: true,
          deviceRegistered: true,
          currentDeviceId: outcome.deviceId,
          deviceName: outcome.deviceName,
          authenticatorLabel: outcome.authenticatorLabel,
          sessionEpoch: updatedStore.sessionEpoch,
          stealthGateEnabled: updatedStore.stealthGateEnabled,
          totpEnabled: updatedStore.totpEnabled,
          activeDeviceCount: updatedStore.devices.filter(
            (d) => d.status === "active"
          ).length,
          storageMode: getStorageMode(),
          ...authMeta,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { success: false, error: "Unsupported passkey action." },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Passkey ceremony failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const ctx = await getSessionAndDeviceContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reqInfo = extractRequestNetworkInfo(request.headers);
  const { searchParams } = new URL(request.url);
  const credentialId = searchParams.get("credentialId")?.trim();

  if (!credentialId) {
    return NextResponse.json(
      { error: "Passkey credentialId is required." },
      { status: 400 }
    );
  }

  try {
    const preStore = await readAdminSecurityStore();
    const target = preStore.passkeys.find(
      (pk) => pk.credentialId === credentialId
    );
    if (!target) {
      return NextResponse.json(
        { error: "Passkey not found." },
        { status: 404 }
      );
    }

    const ownerDevice = preStore.devices.find((d) => d.id === target.deviceId);
    const updatedStore = await mutateAdminSecurityStore((store) =>
      appendSecurityAudit(
        {
          ...store,
          passkeys: store.passkeys.filter(
            (pk) => pk.credentialId !== credentialId
          ),
        },
        {
          action: "passkey_revoked",
          actorDeviceId: ctx.currentDeviceId,
          targetDeviceId: target.deviceId,
          deviceLabel: ownerDevice?.name || target.authenticatorLabel,
          ipMasked: reqInfo.ipMasked,
          outcome: "info",
          detail: `Removed ${target.authenticatorLabel} passkey (${target.rpId}).`,
        }
      )
    );

    return NextResponse.json({
      success: true,
      summary: toSafeSecuritySummary(updatedStore, ctx.currentDeviceId),
    });
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to remove passkey." },
      { status: 500 }
    );
  }
}
