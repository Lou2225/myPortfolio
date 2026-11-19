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

    const body = (await request.json()) as {
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

    // -------------------------------------------------------------------------
    // 1. Passkey Registration Options (Requires Authenticated Admin Session)
    // -------------------------------------------------------------------------
    if (body.action === "register-options") {
      const ctx = await getSessionAndDeviceContext();
      if (!ctx.authenticated) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const store = await readAdminSecurityStore();
      const targetDeviceId = body.deviceId?.trim() || ctx.currentDeviceId;
      const challenge = createPasskeyChallengeToken({
        purpose: "register",
        rpId: rp.rpId,
        origin: rp.origin,
        deviceId: targetDeviceId,
      });

      const excludeCredentialIds = store.passkeys
        .filter((pk) => pk.rpId === rp.rpId)
        .map((pk) => pk.credentialId);

      return NextResponse.json({
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
      });
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

      const customName = body.deviceName
        ? sanitizeDeviceLabel(body.deviceName, 60)
        : undefined;

      let boundDeviceId =
        verified.challengePayload.deviceId || ctx.currentDeviceId || "";
      let boundThumbprint: string | null = telemetry?.keyThumbprint ?? null;
      let savedPasskey: DevicePasskey | null = null;

      const updatedStore = await mutateAdminSecurityStore((store) => {
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

      return NextResponse.json({
        success: true,
        passkey: savedPasskey,
        currentDeviceId: boundDeviceId,
        summary: toSafeSecuritySummary(updatedStore, boundDeviceId),
      });
    }

    // -------------------------------------------------------------------------
    // 3. Passkey Authentication Options (Public, Rate-Limited, Stealth-Safe)
    // -------------------------------------------------------------------------
    if (body.action === "auth-options") {
      const rateKey = `passkey-auth:${reqInfo.ipRateKey}`;
      const store = await readAdminSecurityStore();
      const rate = checkSecurityRateLimit(store, rateKey);
      if (!rate.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `Too many passkey attempts. Retry in ${rate.retryAfterSec}s.`,
          },
          {
            status: 429,
            headers: { "Retry-After": String(rate.retryAfterSec) },
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
        return NextResponse.json({
          success: true,
          available: false,
          rpId: rp.rpId,
          allowCredentialIds: [],
        });
      }

      const challenge = createPasskeyChallengeToken({
        purpose: "auth",
        rpId: rp.rpId,
        origin: rp.origin,
      });

      return NextResponse.json({
        success: true,
        available: true,
        challenge,
        rpId: rp.rpId,
        allowCredentialIds: matchingPasskeys.map((pk) => pk.credentialId),
      });
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
            headers: { "Retry-After": String(rate.retryAfterSec) },
          }
        );
      }

      const credentialId =
        typeof body.credentialId === "string" ? body.credentialId.trim() : "";
      const matchedPasskey = preStore.passkeys.find(
        (pk) => pk.credentialId === credentialId && pk.rpId === rp.rpId
      );
      const linkedDevice = matchedPasskey
        ? preStore.devices.find(
            (d) => d.id === matchedPasskey.deviceId && d.status === "active"
          )
        : null;

      if (!matchedPasskey || !linkedDevice) {
        await mutateAdminSecurityStore((store) =>
          recordSecurityRateFailure(store, rateKey, { maxFailures: 6 })
        );
        return NextResponse.json(
          {
            success: false,
            error: "Passkey is not recognized or its device was revoked.",
          },
          { status: 401 }
        );
      }

      const assertion = verifyPasskeyAssertion({
        clientDataJSONBase64Url:
          typeof body.clientDataJSON === "string" ? body.clientDataJSON : "",
        authenticatorDataBase64Url:
          typeof body.authenticatorData === "string"
            ? body.authenticatorData
            : "",
        signatureBase64Url:
          typeof body.signature === "string" ? body.signature : "",
        storedPublicKeySpkiBase64: matchedPasskey.publicKeySpki,
        storedCounter: matchedPasskey.counter,
        expectedRpId: rp.rpId,
        expectedOrigin: rp.origin,
      });

      if (!assertion.ok) {
        await mutateAdminSecurityStore((store) => {
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
        });
        return NextResponse.json(
          { success: false, error: assertion.error },
          { status: 401 }
        );
      }

      const parsedTelemetry = clientTelemetrySchema.safeParse(
        body.telemetry ?? {}
      );
      const telemetry = parsedTelemetry.success ? parsedTelemetry.data : null;

      let updatedThumbprint: string | null =
        telemetry?.keyThumbprint || linkedDevice.keyThumbprint;

      const updatedStore = await mutateAdminSecurityStore((store) => {
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

        const nextDevices = nextStore.devices.map((d) => {
          if (d.id !== linkedDevice.id) return d;
          const nextKeyThumbprint =
            telemetry?.keyThumbprint || d.keyThumbprint || null;
          const nextPublicKeySpki =
            telemetry?.publicKeySpki || d.publicKeySpki || null;
          updatedThumbprint = nextKeyThumbprint;
          return {
            ...d,
            browser: telemetry?.browser || d.browser,
            osVersion: telemetry?.osVersion || d.osVersion,
            keyThumbprint: nextKeyThumbprint,
            publicKeySpki: nextPublicKeySpki,
            ipMasked: reqInfo.ipMasked,
            userAgent: reqInfo.userAgent,
            lastSeenAt: nowIso,
          };
        });

        return appendSecurityAudit(
          {
            ...nextStore,
            devices: nextDevices,
            passkeys: nextPasskeys,
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

      const cookieStore = await cookies();
      const secureCookie = isSecureRequest(request);
      setSessionCookie(cookieStore, {
        epoch: updatedStore.sessionEpoch,
        deviceId: linkedDevice.id,
        secure: secureCookie,
      });
      setDeviceCookie(cookieStore, {
        deviceId: linkedDevice.id,
        keyThumbprint: updatedThumbprint,
        epoch: updatedStore.sessionEpoch,
        secure: secureCookie,
      });

      const authMeta = await getAdminAuthMeta();
      return NextResponse.json({
        success: true,
        authenticated: true,
        deviceRegistered: true,
        currentDeviceId: linkedDevice.id,
        deviceName: linkedDevice.name,
        authenticatorLabel: matchedPasskey.authenticatorLabel,
        sessionEpoch: updatedStore.sessionEpoch,
        stealthGateEnabled: updatedStore.stealthGateEnabled,
        totpEnabled: updatedStore.totpEnabled,
        activeDeviceCount: updatedStore.devices.filter(
          (d) => d.status === "active"
        ).length,
        storageMode: getStorageMode(),
        ...authMeta,
      });
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
