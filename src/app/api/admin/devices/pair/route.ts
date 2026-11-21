import crypto from "crypto";
import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { getSessionAndDeviceContext } from "@/lib/auth";
import { StorageReadError, StorageWriteError } from "@/lib/db";
import { getSiteOrigin } from "@/lib/siteUrl";
import {
  appendSecurityAudit,
  buildDeviceFromTelemetry,
  extractRequestNetworkInfo,
  mutateAdminSecurityStore,
  sha256Hex,
  upsertTrustedDevice,
} from "@/lib/security";
import type { PairingChallenge } from "@/types/security";

const PAIRING_TTL_MS = 3 * 60 * 1000; // 3 minutes

function getAllowedCanonicalHosts(requestUrl: URL): Set<string> {
  const allowed = new Set<string>([requestUrl.hostname.toLowerCase()]);
  try {
    allowed.add(new URL(getSiteOrigin()).hostname.toLowerCase());
  } catch {
    // ignore malformed canonical site URL
  }
  for (const envHost of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]) {
    const trimmed = (envHost || "").trim();
    if (!trimmed) continue;
    try {
      const normalized = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      allowed.add(new URL(normalized).hostname.toLowerCase());
    } catch {
      // ignore invalid env host
    }
  }
  return allowed;
}

function resolveRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const allowedHosts = getAllowedCanonicalHosts(requestUrl);

  const forwardedHostRaw = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProtoRaw = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  if (forwardedHostRaw) {
    const fallbackProto = requestUrl.protocol.replace(":", "") || "https";
    const proto =
      forwardedProtoRaw === "http" || forwardedProtoRaw === "https"
        ? forwardedProtoRaw
        : fallbackProto;
    try {
      const candidate = new URL(`${proto}://${forwardedHostRaw}`);
      if (
        !candidate.username &&
        !candidate.password &&
        candidate.pathname === "/" &&
        !candidate.search &&
        !candidate.hash &&
        allowedHosts.has(candidate.hostname.toLowerCase())
      ) {
        return candidate.origin;
      }
    } catch {
      // Ignore malformed forwarded host header
    }
  }

  return requestUrl.origin;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const challengeId = searchParams.get("challenge")?.trim();
    if (!challengeId) {
      return NextResponse.json(
        { error: "Challenge ID is required." },
        { status: 400 }
      );
    }

    const ctx = await getSessionAndDeviceContext();
    if (ctx.storageUnavailable || !ctx.securityStore) {
      return NextResponse.json(
        { error: "Security storage temporarily unavailable." },
        { status: 503 }
      );
    }
    const store = ctx.securityStore;

    const challenge = store.pairings.find((p) => p.id === challengeId);
    if (!challenge) {
      return NextResponse.json(
        { error: "Pairing challenge not found or expired." },
        { status: 404 }
      );
    }

    const now = Date.now();
    const isExpired =
      (challenge.status === "pending" ||
        challenge.status === "awaiting_approval") &&
      new Date(challenge.expiresAt).getTime() <= now;

    const effectiveStatus = isExpired ? "expired" : challenge.status;
    const remainingSec = Math.max(
      0,
      Math.ceil((new Date(challenge.expiresAt).getTime() - now) / 1000)
    );

    // Authenticated desktop polls receive incoming device details for visual inspection
    if (ctx.authenticated) {
      return NextResponse.json({
        id: challenge.id,
        status: effectiveStatus,
        expiresAt: challenge.expiresAt,
        remainingSec,
        attempts: challenge.attempts,
        maxAttempts: challenge.maxAttempts,
        grantAdminSession: challenge.grantAdminSession,
        requireDesktopApproval: challenge.requireDesktopApproval,
        pendingDevice: challenge.pendingDevice,
        pairedDeviceId: challenge.pairedDeviceId,
      });
    }

    // Mobile / unauthenticated check sees ONLY minimal non-sensitive state
    return NextResponse.json({
      id: challenge.id,
      status: effectiveStatus,
      expiresAt: challenge.expiresAt,
      remainingSec,
      attemptsRemaining: Math.max(0, challenge.maxAttempts - challenge.attempts),
      requireDesktopApproval: challenge.requireDesktopApproval,
      grantAdminSession: challenge.grantAdminSession,
    });
  } catch (err) {
    if (err instanceof StorageReadError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to check pairing status." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const ctx = await getSessionAndDeviceContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      grantAdminSession?: boolean;
      requireDesktopApproval?: boolean;
    };

    const baseOrigin = resolveRequestOrigin(request);

    const challengeId = crypto.randomBytes(16).toString("base64url");
    const numericCode = String(crypto.randomInt(100000, 1000000));
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();

    const grantAdminSession = Boolean(body.grantAdminSession);
    const requireDesktopApproval = body.requireDesktopApproval !== false;

    const newChallenge: PairingChallenge = {
      id: challengeId,
      codeHash: sha256Hex(numericCode),
      claimTokenHash: null,
      createdAt,
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
      grantAdminSession,
      requireDesktopApproval,
      status: "pending",
      createdByDeviceId: ctx.currentDeviceId,
      pendingDevice: null,
      pairedDeviceId: null,
    };

    await mutateAdminSecurityStore((store) => ({
      ...store,
      pairings: [
        newChallenge,
        ...store.pairings.map((p) =>
          p.status === "pending" ? { ...p, status: "cancelled" as const } : p
        ),
      ].slice(0, 20),
    }));

    const pairUrl = `${baseOrigin}/admin/pair?challenge=${encodeURIComponent(
      challengeId
    )}`;

    const qrSvg = await QRCode.toString(pairUrl, {
      type: "svg",
      margin: 1,
      width: 240,
      errorCorrectionLevel: "M",
      color: {
        dark: "#111114",
        light: "#ffffff",
      },
    });

    return NextResponse.json({
      challengeId,
      code: numericCode,
      pairUrl,
      qrSvg,
      baseOrigin,
      expiresAt,
      grantAdminSession,
      requireDesktopApproval,
    });
  } catch (err) {
    if (err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to initialize QR pairing challenge." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const ctx = await getSessionAndDeviceContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reqInfo = extractRequestNetworkInfo(request.headers);

  try {
    let body: {
      challengeId?: string;
      action?: "approve" | "reject";
    };
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "Invalid JSON request body." },
          { status: 400 }
        );
      }
      body = parsed as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON request body." },
        { status: 400 }
      );
    }

    const challengeId =
      typeof body.challengeId === "string" ? body.challengeId.trim() : "";
    if (!challengeId) {
      return NextResponse.json(
        { error: "Challenge ID is required." },
        { status: 400 }
      );
    }

    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json(
        { error: "Action must explicitly be 'approve' or 'reject'." },
        { status: 400 }
      );
    }

    let outcome: { ok: true } | { ok: false; status: number; error: string } = {
      ok: false,
      status: 404,
      error: "Pairing challenge not found.",
    };

    const updatedStore = await mutateAdminSecurityStore((store) => {
      outcome = {
        ok: false,
        status: 404,
        error: "Pairing challenge not found.",
      };
      const challenge = store.pairings.find((p) => p.id === challengeId);
      if (!challenge) {
        return store;
      }
      if (challenge.status !== "awaiting_approval") {
        outcome = {
          ok: false,
          status: 409,
          error: `Pairing challenge is not awaiting approval (status: ${challenge.status}).`,
        };
        return store;
      }

      if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
        outcome = {
          ok: false,
          status: 410,
          error: "Pairing challenge has expired.",
        };
        return {
          ...store,
          pairings: store.pairings.map((p) =>
            p.id === challengeId ? { ...p, status: "expired" as const } : p
          ),
        };
      }

      if (body.action === "reject") {
        outcome = { ok: true };
        // Keep claimTokenHash temporarily so mobile PUT polls verify claimToken and exit cleanly
        return appendSecurityAudit(
          {
            ...store,
            pairings: store.pairings.map((p) =>
              p.id === challengeId
                ? {
                    ...p,
                    status: "cancelled",
                  }
                : p
            ),
          },
          {
            action: "login_blocked",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: null,
            deviceLabel:
              challenge.pendingDevice?.name || "Unverified QR Applicant",
            ipMasked: challenge.pendingDevice?.ipMasked || reqInfo.ipMasked,
            outcome: "blocked",
            detail:
              "Administrator rejected incoming mobile QR device approval request.",
          }
        );
      }

      // Approve incoming mobile device and finalize registry record
      const preview = challenge.pendingDevice;
      if (!preview) {
        outcome = {
          ok: false,
          status: 409,
          error: "Pending device metadata is missing.",
        };
        return store;
      }

      outcome = { ok: true };
      const built = buildDeviceFromTelemetry({
        telemetry: {
          suggestedName: preview.name,
          model: preview.model,
          platform: preview.platform,
          osVersion: preview.osVersion,
          browser: preview.browser,
          architecture: preview.architecture,
          cpuCores: preview.cpuCores,
          gpuRenderer: preview.gpuRenderer,
          screenMetrics: preview.screenMetrics,
          timezone: preview.timezone,
          deviceType: preview.deviceType,
          keyThumbprint: preview.keyThumbprint,
          publicKeySpki: preview.publicKeySpki,
          secureContext: Boolean(preview.publicKeySpki),
        },
        customName: preview.name,
        ipMasked: preview.ipMasked,
        userAgent: preview.userAgent,
        localHostname: null,
        trustSource: "qr-pair",
      });

      const upserted = upsertTrustedDevice(store, built);
      const nextPairings = upserted.store.pairings.map((p) =>
        p.id === challengeId
          ? {
              ...p,
              status: "approved" as const,
              pairedDeviceId: upserted.saved.id,
            }
          : p
      );

      return appendSecurityAudit(
        { ...upserted.store, pairings: nextPairings },
        {
          action: "device_qr_paired",
          actorDeviceId: ctx.currentDeviceId,
          targetDeviceId: upserted.saved.id,
          deviceLabel: upserted.saved.name,
          ipMasked: preview.ipMasked,
          outcome: "success",
          detail: `Approved QR + 6-digit pairing for ${upserted.saved.model} (${upserted.saved.platform}).`,
        }
      );
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    const resultingChallenge = updatedStore.pairings.find(
      (p) => p.id === challengeId
    );
    return NextResponse.json(
      {
        success: true,
        status: resultingChallenge?.status ?? "cancelled",
        pairedDeviceId: resultingChallenge?.pairedDeviceId ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to process device pairing confirmation." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getSessionAndDeviceContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const challengeId = searchParams.get("challenge")?.trim();
    if (!challengeId) {
      return NextResponse.json({ success: true });
    }

    await mutateAdminSecurityStore((store) => ({
      ...store,
      pairings: store.pairings.map((p) =>
        p.id === challengeId &&
        (p.status === "pending" || p.status === "awaiting_approval")
          ? { ...p, status: "cancelled" }
          : p
      ),
    }));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to cancel pairing challenge." },
      { status: 500 }
    );
  }
}

