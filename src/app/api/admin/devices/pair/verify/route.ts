import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  isSecureRequest,
  setDeviceCookie,
  setSessionCookie,
} from "@/lib/auth";
import { StorageReadError, StorageWriteError } from "@/lib/db";
import {
  appendSecurityAudit,
  buildDeviceFromTelemetry,
  checkSecurityRateLimit,
  clearSecurityRateBucket,
  constantTimeHashEqual,
  extractRequestNetworkInfo,
  mutateAdminSecurityStore,
  recordSecurityRateFailure,
  sha256Hex,
  upsertTrustedDevice,
} from "@/lib/security";
import {
  pairVerifySchema,
  sanitizeDeviceLabel,
} from "@/lib/validation";
import type { PairedDevicePreview } from "@/types/security";

export async function POST(request: Request) {
  const reqInfo = extractRequestNetworkInfo(request.headers);
  const pairRateKey = `pair:${reqInfo.ipRateKey}`;

  try {
    const body = await request.json();
    const parsed = pairVerifySchema.safeParse({
      ...body,
      deviceName: sanitizeDeviceLabel(body?.deviceName ?? "", 60),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            parsed.error.issues[0]?.message || "Invalid pairing details.",
        },
        { status: 400 }
      );
    }

    const { challengeId, code, deviceName, telemetry } = parsed.data;

    const postOutcomeBox: {
      current:
        | { kind: "rate_limited"; retryAfterSec: number }
        | { kind: "not_found" }
        | { kind: "expired" }
        | { kind: "inactive"; status: string }
        | { kind: "burned_limit" }
        | { kind: "wrong_code"; remaining: number }
        | { kind: "awaiting_approval"; claimToken: string }
        | {
            kind: "completed";
            savedId: string;
            savedThumbprint: string | null;
            epoch: number;
            grantAdminSession: boolean;
          };
    } = { current: { kind: "not_found" } };

    await mutateAdminSecurityStore((store) => {
      const ipRate = checkSecurityRateLimit(store, pairRateKey);
      if (!ipRate.allowed) {
        postOutcomeBox.current = {
          kind: "rate_limited",
          retryAfterSec: ipRate.retryAfterSec,
        };
        return store;
      }

      const challenge = store.pairings.find((p) => p.id === challengeId);
      if (!challenge) {
        postOutcomeBox.current = { kind: "not_found" };
        return store;
      }

      if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
        postOutcomeBox.current = { kind: "expired" };
        return {
          ...store,
          pairings: store.pairings.map((p) =>
            p.id === challengeId ? { ...p, status: "expired" as const } : p
          ),
        };
      }

      if (challenge.status !== "pending") {
        postOutcomeBox.current = { kind: "inactive", status: challenge.status };
        return store;
      }

      if (challenge.attempts >= challenge.maxAttempts) {
        postOutcomeBox.current = { kind: "burned_limit" };
        return {
          ...store,
          pairings: store.pairings.map((p) =>
            p.id === challengeId ? { ...p, status: "burned" as const } : p
          ),
        };
      }

      const matches = constantTimeHashEqual(sha256Hex(code), challenge.codeHash);

      if (!matches) {
        const nextAttempts = challenge.attempts + 1;
        const burned = nextAttempts >= challenge.maxAttempts;
        const remaining = Math.max(0, challenge.maxAttempts - nextAttempts);
        postOutcomeBox.current = { kind: "wrong_code", remaining };

        let nextStore = recordSecurityRateFailure(store, pairRateKey, {
          maxFailures: 10,
        });
        nextStore = {
          ...nextStore,
          pairings: nextStore.pairings.map((p) =>
            p.id === challengeId
              ? {
                  ...p,
                  attempts: nextAttempts,
                  status: burned ? ("burned" as const) : p.status,
                }
              : p
          ),
        };

        if (burned) {
          nextStore = appendSecurityAudit(nextStore, {
            action: "login_blocked",
            actorDeviceId: null,
            targetDeviceId: null,
            deviceLabel: deviceName,
            ipMasked: reqInfo.ipMasked,
            outcome: "blocked",
            detail:
              "Burned QR pairing challenge after 5 incorrect 6-digit code attempts.",
          });
        }
        return nextStore;
      }

      const preview: PairedDevicePreview = {
        name: deviceName,
        model: telemetry.model,
        platform: telemetry.platform,
        osVersion: telemetry.osVersion,
        browser: telemetry.browser,
        architecture: telemetry.architecture ?? null,
        cpuCores: telemetry.cpuCores ?? null,
        gpuRenderer: telemetry.gpuRenderer ?? null,
        screenMetrics: telemetry.screenMetrics ?? null,
        timezone: telemetry.timezone ?? null,
        deviceType: telemetry.deviceType,
        keyThumbprint: telemetry.keyThumbprint ?? null,
        publicKeySpki: telemetry.publicKeySpki ?? null,
        ipMasked: reqInfo.ipMasked,
        userAgent: reqInfo.userAgent,
        verifiedAt: new Date().toISOString(),
      };

      const clearedRateStore = clearSecurityRateBucket(store, pairRateKey);

      if (challenge.requireDesktopApproval) {
        const claimToken = crypto.randomBytes(24).toString("base64url");
        const claimTokenHash = sha256Hex(claimToken);
        postOutcomeBox.current = { kind: "awaiting_approval", claimToken };

        return {
          ...clearedRateStore,
          pairings: clearedRateStore.pairings.map((p) =>
            p.id === challengeId
              ? {
                  ...p,
                  status: "awaiting_approval" as const,
                  claimTokenHash,
                  pendingDevice: preview,
                }
              : p
          ),
        };
      }

      const built = buildDeviceFromTelemetry({
        telemetry,
        customName: preview.name,
        ipMasked: reqInfo.ipMasked,
        userAgent: reqInfo.userAgent,
        localHostname: reqInfo.localHostname,
        trustSource: "qr-pair",
      });
      const upserted = upsertTrustedDevice(clearedRateStore, built);

      const finalStore = appendSecurityAudit(
        {
          ...upserted.store,
          pairings: upserted.store.pairings.map((p) =>
            p.id === challengeId
              ? {
                  ...p,
                  status: "completed" as const,
                  claimTokenHash: null,
                  pendingDevice: preview,
                  pairedDeviceId: upserted.saved.id,
                }
              : p
          ),
        },
        {
          action: "device_qr_paired",
          actorDeviceId: challenge.createdByDeviceId,
          targetDeviceId: upserted.saved.id,
          deviceLabel: upserted.saved.name,
          ipMasked: reqInfo.ipMasked,
          outcome: "success",
          detail: `QR paired ${upserted.saved.model} (${upserted.saved.platform}) via 6-digit PIN.`,
        }
      );

      postOutcomeBox.current = {
        kind: "completed",
        savedId: upserted.saved.id,
        savedThumbprint: upserted.saved.keyThumbprint,
        epoch: finalStore.sessionEpoch,
        grantAdminSession: challenge.grantAdminSession,
      };
      return finalStore;
    });

    const outcome = postOutcomeBox.current;
    if (outcome.kind === "rate_limited") {
      return NextResponse.json(
        {
          success: false,
          error: `Too many pairing verification attempts. Retry in ${outcome.retryAfterSec}s.`,
        },
        { status: 429, headers: { "Retry-After": String(outcome.retryAfterSec) } }
      );
    }

    if (outcome.kind === "not_found") {
      return NextResponse.json(
        { success: false, error: "Pairing QR challenge was not found." },
        { status: 404 }
      );
    }

    if (outcome.kind === "expired") {
      return NextResponse.json(
        {
          success: false,
          error: "This QR pairing code has expired. Generate a new QR code on desktop.",
        },
        { status: 410 }
      );
    }

    if (outcome.kind === "inactive") {
      return NextResponse.json(
        {
          success: false,
          error: `This pairing challenge is no longer active (${outcome.status}).`,
        },
        { status: 409 }
      );
    }

    if (outcome.kind === "burned_limit") {
      return NextResponse.json(
        {
          success: false,
          error: "Maximum verification attempts reached. Challenge burned.",
          burned: true,
        },
        { status: 429 }
      );
    }

    if (outcome.kind === "wrong_code") {
      return NextResponse.json(
        {
          success: false,
          error:
            outcome.remaining > 0
              ? `Incorrect 6-digit code (${outcome.remaining} ${
                  outcome.remaining === 1 ? "try" : "tries"
                } remaining).`
              : "Too many incorrect attempts. Generate a fresh QR code.",
          attemptsRemaining: outcome.remaining,
          burned: outcome.remaining === 0,
        },
        { status: 401 }
      );
    }

    if (outcome.kind === "awaiting_approval") {
      return NextResponse.json({
        success: true,
        status: "awaiting_approval",
        claimToken: outcome.claimToken,
      });
    }

    const cookieStore = await cookies();
    const secureCookie = isSecureRequest(request);
    setDeviceCookie(cookieStore, {
      deviceId: outcome.savedId,
      keyThumbprint: outcome.savedThumbprint,
      epoch: outcome.epoch,
      secure: secureCookie,
    });

    if (outcome.grantAdminSession) {
      setSessionCookie(cookieStore, {
        epoch: outcome.epoch,
        deviceId: outcome.savedId,
        secure: secureCookie,
      });
    }

    return NextResponse.json({
      success: true,
      status: "completed",
      deviceId: outcome.savedId,
      deviceRegistered: true,
      authenticated: outcome.grantAdminSession,
    });
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { success: false, error: "Pairing verification failed." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const reqInfo = extractRequestNetworkInfo(request.headers);
  const pollRateKey = `pair-put:${reqInfo.ipRateKey}`;

  try {
    const body = (await request.json()) as {
      challengeId?: string;
      claimToken?: string;
    };

    if (!body.challengeId || !body.claimToken) {
      return NextResponse.json(
        { error: "Missing pairing claim credentials." },
        { status: 400 }
      );
    }

    const challengeId = body.challengeId;
    const claimTokenHash = sha256Hex(body.claimToken);

    const putOutcomeBox: {
      current:
        | { kind: "rate_limited"; retryAfterSec: number }
        | { kind: "not_found" }
        | { kind: "invalid_token" }
        | { kind: "terminal"; status: "cancelled" | "burned" | "expired"; error: string }
        | { kind: "waiting"; status: string }
        | { kind: "device_missing" }
        | {
            kind: "completed";
            deviceId: string;
            deviceName: string;
            keyThumbprint: string | null;
            epoch: number;
            grantAdminSession: boolean;
          };
    } = { current: { kind: "not_found" } };

    await mutateAdminSecurityStore((store) => {
      const ipRate = checkSecurityRateLimit(store, pollRateKey);
      if (!ipRate.allowed) {
        putOutcomeBox.current = {
          kind: "rate_limited",
          retryAfterSec: ipRate.retryAfterSec,
        };
        return store;
      }

      const challenge = store.pairings.find((p) => p.id === challengeId);
      if (!challenge) {
        putOutcomeBox.current = { kind: "not_found" };
        return store;
      }

      if (challenge.claimTokenHash) {
        const tokenValid = constantTimeHashEqual(
          claimTokenHash,
          challenge.claimTokenHash
        );
        if (!tokenValid) {
          putOutcomeBox.current = { kind: "invalid_token" };
          return recordSecurityRateFailure(store, pollRateKey, {
            maxFailures: 15,
          });
        }
      }

      const nowMs = Date.now();
      const isTimeExpired =
        (challenge.status === "pending" ||
          challenge.status === "awaiting_approval" ||
          challenge.status === "approved") &&
        new Date(challenge.expiresAt).getTime() <= nowMs;

      if (challenge.status === "cancelled" || challenge.status === "burned") {
        putOutcomeBox.current = {
          kind: "terminal",
          status: challenge.status,
          error: "Device request was declined or cancelled on desktop.",
        };
        if (challenge.claimTokenHash) {
          return {
            ...store,
            pairings: store.pairings.map((p) =>
              p.id === challengeId ? { ...p, claimTokenHash: null } : p
            ),
          };
        }
        return store;
      }

      if (challenge.status === "expired" || isTimeExpired) {
        putOutcomeBox.current = {
          kind: "terminal",
          status: "expired",
          error: "Pairing window expired before desktop confirmation.",
        };
        return {
          ...store,
          pairings: store.pairings.map((p) =>
            p.id === challengeId
              ? { ...p, status: "expired" as const, claimTokenHash: null }
              : p
          ),
        };
      }

      if (!challenge.claimTokenHash) {
        putOutcomeBox.current = { kind: "not_found" };
        return store;
      }

      if (challenge.status !== "approved" || !challenge.pairedDeviceId) {
        putOutcomeBox.current = { kind: "waiting", status: challenge.status };
        return store;
      }

      const device = store.devices.find(
        (d) => d.id === challenge.pairedDeviceId && d.status === "active"
      );
      if (!device) {
        putOutcomeBox.current = { kind: "device_missing" };
        return store;
      }

      putOutcomeBox.current = {
        kind: "completed",
        deviceId: device.id,
        deviceName: device.name,
        keyThumbprint: device.keyThumbprint,
        epoch: store.sessionEpoch,
        grantAdminSession: challenge.grantAdminSession,
      };

      return {
        ...store,
        pairings: store.pairings.map((p) =>
          p.id === challengeId
            ? { ...p, status: "completed" as const, claimTokenHash: null }
            : p
        ),
      };
    });

    const outcome = putOutcomeBox.current;
    if (outcome.kind === "rate_limited") {
      return NextResponse.json(
        { error: "Too many claim attempts." },
        { status: 429, headers: { "Retry-After": String(outcome.retryAfterSec) } }
      );
    }

    if (outcome.kind === "not_found") {
      return NextResponse.json(
        { error: "Pairing claim not found or already consumed." },
        { status: 404 }
      );
    }

    if (outcome.kind === "invalid_token") {
      return NextResponse.json(
        { error: "Invalid device pairing claim token." },
        { status: 403 }
      );
    }

    if (outcome.kind === "terminal") {
      return NextResponse.json({
        success: false,
        status: outcome.status,
        error: outcome.error,
      });
    }

    if (outcome.kind === "waiting") {
      return NextResponse.json({
        success: true,
        status: outcome.status,
      });
    }

    if (outcome.kind === "device_missing") {
      return NextResponse.json(
        { error: "Approved device record could not be verified." },
        { status: 404 }
      );
    }

    const cookieStore = await cookies();
    const secureCookie = isSecureRequest(request);
    setDeviceCookie(cookieStore, {
      deviceId: outcome.deviceId,
      keyThumbprint: outcome.keyThumbprint,
      epoch: outcome.epoch,
      secure: secureCookie,
    });

    if (outcome.grantAdminSession) {
      setSessionCookie(cookieStore, {
        epoch: outcome.epoch,
        deviceId: outcome.deviceId,
        secure: secureCookie,
      });
    }

    return NextResponse.json({
      success: true,
      status: "completed",
      deviceId: outcome.deviceId,
      deviceName: outcome.deviceName,
      deviceRegistered: true,
      authenticated: outcome.grantAdminSession,
    });
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to finalize paired mobile cookies." },
      { status: 500 }
    );
  }
}
