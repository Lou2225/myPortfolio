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
  readAdminSecurityStore,
  sha256Hex,
  upsertTrustedDevice,
} from "@/lib/security";
import type { PairingChallenge } from "@/types/security";

const PAIRING_TTL_MS = 3 * 60 * 1000; // 3 minutes

function isPrivateLanOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower.endsWith(".local")
  ) {
    return true;
  }

  // Allow private RFC1918 LAN IPv4 addresses for local dev phone-to-PC pairing
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(lower);
  if (match172) {
    const secondOctet = Number(match172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }
  return false;
}

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

function resolveRequestOrigin(
  request: Request,
  overrideOrigin?: string | null
): { origin: string | null; error?: string } {
  const requestUrl = new URL(request.url);
  const allowedHosts = getAllowedCanonicalHosts(requestUrl);
  const isVercel = process.env.VERCEL === "1";

  if (overrideOrigin && overrideOrigin.trim()) {
    try {
      const parsed = new URL(overrideOrigin.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { origin: null, error: "QR origin must use http or https." };
      }
      const targetHost = parsed.hostname.toLowerCase();
      const hostAllowed =
        allowedHosts.has(targetHost) ||
        (!isVercel && isPrivateLanOrLocalHostname(targetHost));
      if (!hostAllowed) {
        return {
          origin: null,
          error:
            "Origin override is not an allowlisted site domain or local LAN host.",
        };
      }
      return { origin: parsed.origin };
    } catch {
      return { origin: null, error: "Malformed QR origin override URL." };
    }
  }

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
    const forwardedHostname = forwardedHostRaw.split(":")[0]?.toLowerCase() || "";
    const hostTrusted =
      allowedHosts.has(forwardedHostname) ||
      (!isVercel && isPrivateLanOrLocalHostname(forwardedHostname));
    const proto =
      forwardedProtoRaw === "http" || forwardedProtoRaw === "https"
        ? forwardedProtoRaw
        : isPrivateLanOrLocalHostname(forwardedHostname) && !isVercel
          ? "http"
          : "https";
    if (hostTrusted) {
      return { origin: `${proto}://${forwardedHostRaw}` };
    }
  }

  return { origin: requestUrl.origin };
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

    const [ctx, store] = await Promise.all([
      getSessionAndDeviceContext(),
      readAdminSecurityStore(),
    ]);

    if (ctx.storageUnavailable) {
      return NextResponse.json(
        { error: "Security storage temporarily unavailable." },
        { status: 503 }
      );
    }

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
      originOverride?: string;
      grantAdminSession?: boolean;
      requireDesktopApproval?: boolean;
    };

    const resolvedOrigin = resolveRequestOrigin(request, body.originOverride);
    if (!resolvedOrigin.origin) {
      return NextResponse.json(
        { error: resolvedOrigin.error || "Invalid QR base origin." },
        { status: 400 }
      );
    }

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

    const baseOrigin = resolvedOrigin.origin;
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
    const body = (await request.json()) as {
      challengeId: string;
      action: "approve" | "reject";
    };

    if (!body.challengeId) {
      return NextResponse.json(
        { error: "Challenge ID is required." },
        { status: 400 }
      );
    }

    const updatedStore = await mutateAdminSecurityStore((store) => {
      const challenge = store.pairings.find((p) => p.id === body.challengeId);
      if (!challenge || challenge.status !== "awaiting_approval") {
        return store;
      }

      if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
        return {
          ...store,
          pairings: store.pairings.map((p) =>
            p.id === body.challengeId ? { ...p, status: "expired" as const } : p
          ),
        };
      }

      if (body.action === "reject") {
        // Keep claimTokenHash temporarily so mobile PUT polls verify claimToken and exit cleanly
        return appendSecurityAudit(
          {
            ...store,
            pairings: store.pairings.map((p) =>
              p.id === body.challengeId
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
      if (!preview) return store;

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
        p.id === body.challengeId
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

    const resultingChallenge = updatedStore.pairings.find(
      (p) => p.id === body.challengeId
    );
    return NextResponse.json({
      success: true,
      status: resultingChallenge?.status ?? "cancelled",
      pairedDeviceId: resultingChallenge?.pairedDeviceId ?? null,
    });
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

