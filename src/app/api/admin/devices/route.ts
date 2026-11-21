import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  REGISTERED_DEVICE_COOKIE,
  getSessionAndDeviceContext,
  isSecureRequest,
  setDeviceCookie,
  setSessionCookie,
} from "@/lib/auth";
import { StorageReadError, StorageWriteError } from "@/lib/db";
import {
  appendSecurityAudit,
  buildDeviceFromTelemetry,
  extractRequestNetworkInfo,
  mutateAdminSecurityStore,
  readAdminSecurityStore,
  sha256Hex,
  toSafeSecuritySummary,
  upsertTrustedDevice,
} from "@/lib/security";
import {
  clientTelemetrySchema,
  deviceMetadataSchema,
  sanitizeDeviceLabel,
} from "@/lib/validation";

function generateReadableRecoveryKey(): string {
  const bytes = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `LOU-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}`;
}

export async function GET() {
  try {
    const ctx = await getSessionAndDeviceContext();
    if (ctx.storageUnavailable || !ctx.securityStore) {
      return NextResponse.json(
        { error: "Security registry is temporarily unavailable." },
        { status: 503 }
      );
    }
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      toSafeSecuritySummary(ctx.securityStore, ctx.currentDeviceId),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof StorageReadError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to load security registry." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const ctx = await getSessionAndDeviceContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reqInfo = extractRequestNetworkInfo(request.headers);

  try {
    const body = (await request.json()) as {
      name?: string;
      telemetry?: unknown;
    };

    const metaParsed = deviceMetadataSchema.safeParse({
      name: sanitizeDeviceLabel(body.name ?? "", 60),
    });

    if (!metaParsed.success) {
      return NextResponse.json(
        {
          error:
            metaParsed.error.issues[0]?.message ||
            "Invalid device metadata provided.",
        },
        { status: 400 }
      );
    }

    const telemetryParsed = clientTelemetrySchema.safeParse(
      body.telemetry ?? {}
    );
    const telemetry = telemetryParsed.success ? telemetryParsed.data : null;

    let savedDeviceId = ctx.currentDeviceId ?? "";
    let savedThumbprint: string | null = telemetry?.keyThumbprint ?? null;

    const updatedStore = await mutateAdminSecurityStore((store) => {
      const built = buildDeviceFromTelemetry({
        telemetry,
        customName: metaParsed.data.name,
        ipMasked: reqInfo.ipMasked,
        userAgent: reqInfo.userAgent,
        localHostname: reqInfo.localHostname,
        trustSource: "manual",
        existingDeviceId: ctx.currentDeviceId ?? undefined,
      });
      const upserted = upsertTrustedDevice(store, built);
      savedDeviceId = upserted.saved.id;
      savedThumbprint = upserted.saved.keyThumbprint;

      return appendSecurityAudit(upserted.store, {
        action: ctx.currentDeviceId ? "device_updated" : "device_registered",
        actorDeviceId: upserted.saved.id,
        targetDeviceId: upserted.saved.id,
        deviceLabel: upserted.saved.name,
        ipMasked: reqInfo.ipMasked,
        outcome: "success",
        detail: `${ctx.currentDeviceId ? "Updated" : "Registered"} ${upserted.saved.model} (${upserted.saved.platform}).`,
      });
    });

    const cookieStore = await cookies();
    const secureCookie = isSecureRequest(request);
    setDeviceCookie(cookieStore, {
      deviceId: savedDeviceId,
      keyThumbprint: savedThumbprint,
      epoch: updatedStore.sessionEpoch,
      secure: secureCookie,
    });
    setSessionCookie(cookieStore, {
      epoch: updatedStore.sessionEpoch,
      deviceId: savedDeviceId,
      secure: secureCookie,
    });

    return NextResponse.json({
      success: true,
      summary: toSafeSecuritySummary(updatedStore, savedDeviceId),
    });
  } catch (err) {
    if (err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to save device registration." },
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
      action:
        | "update-device"
        | "revoke-device"
        | "remove-device"
        | "revoke-other-sessions"
        | "toggle-stealth"
        | "regenerate-stealth-key";
      deviceId?: string;
      name?: string;
      stealthGateEnabled?: boolean;
    };

    const cookieStore = await cookies();
    let generatedStealthKey: string | null = null;
    let revokedCurrentDevice = false;

    if (body.action === "update-device") {
      const targetId = body.deviceId || ctx.currentDeviceId;
      if (!targetId) {
        return NextResponse.json(
          { error: "Target device ID is required." },
          { status: 400 }
        );
      }

      const parsed = deviceMetadataSchema.safeParse({
        name: sanitizeDeviceLabel(body.name ?? "", 60),
      });

      if (!parsed.success) {
        return NextResponse.json(
          {
            error:
              parsed.error.issues[0]?.message ||
              "Invalid device name provided.",
          },
          { status: 400 }
        );
      }

      let foundDevice = false;
      const updated = await mutateAdminSecurityStore((store) => {
        foundDevice = false;
        const exists = store.devices.find((d) => d.id === targetId);
        if (!exists) return store;
        foundDevice = true;
        const nextDevices = store.devices.map((d) =>
          d.id === targetId
            ? {
                ...d,
                name: parsed.data.name,
              }
            : d
        );
        return appendSecurityAudit(
          { ...store, devices: nextDevices },
          {
            action: "device_updated",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: targetId,
            deviceLabel: parsed.data.name,
            ipMasked: reqInfo.ipMasked,
            outcome: "success",
            detail: "Updated trusted device label.",
          }
        );
      });

      if (!foundDevice) {
        return NextResponse.json(
          { error: "Trusted device not found." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          summary: toSafeSecuritySummary(updated, ctx.currentDeviceId),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (body.action === "revoke-device") {
      const targetId = body.deviceId || ctx.currentDeviceId;
      if (!targetId) {
        return NextResponse.json(
          { error: "Device ID is required for revocation." },
          { status: 400 }
        );
      }

      let foundTarget = false;
      const updated = await mutateAdminSecurityStore((store) => {
        foundTarget = false;
        revokedCurrentDevice = targetId === ctx.currentDeviceId;
        const target = store.devices.find((d) => d.id === targetId);
        if (!target) return store;
        foundTarget = true;

        const revokedIds = new Set<string>([targetId]);
        const nowIso = new Date().toISOString();
        const nextDevices = store.devices.map((d) => {
          const matchesTarget =
            d.id === targetId ||
            (Boolean(target.keyThumbprint) &&
              d.keyThumbprint === target.keyThumbprint &&
              d.status === "active");
          if (matchesTarget) {
            revokedIds.add(d.id);
            return {
              ...d,
              status: "revoked" as const,
              revokedAt: nowIso,
            };
          }
          return d;
        });

        if (ctx.currentDeviceId && revokedIds.has(ctx.currentDeviceId)) {
          revokedCurrentDevice = true;
        }

        return appendSecurityAudit(
          {
            ...store,
            devices: nextDevices,
            passkeys: store.passkeys.filter(
              (pk) => !revokedIds.has(pk.deviceId)
            ),
          },
          {
            action: "device_revoked",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: targetId,
            deviceLabel: target.name,
            ipMasked: reqInfo.ipMasked,
            outcome: "info",
            detail: revokedCurrentDevice
              ? "Revoked active trusted browser."
              : `Remotely revoked access for ${target.model} (${target.platform}).`,
          }
        );
      });

      if (!foundTarget) {
        return NextResponse.json(
          { error: "Trusted device not found." },
          { status: 404 }
        );
      }

      if (revokedCurrentDevice) {
        cookieStore.delete(REGISTERED_DEVICE_COOKIE);
        setSessionCookie(cookieStore, {
          epoch: updated.sessionEpoch,
          secure: isSecureRequest(request),
        });
      }

      return NextResponse.json({
        success: true,
        revokedCurrentDevice,
        summary: toSafeSecuritySummary(
          updated,
          revokedCurrentDevice ? null : ctx.currentDeviceId
        ),
      });
    }

    if (body.action === "remove-device") {
      const targetId = body.deviceId;
      if (!targetId) {
        return NextResponse.json(
          { error: "Device ID is required." },
          { status: 400 }
        );
      }

      const preStore = await readAdminSecurityStore();
      const targetDevice = preStore.devices.find((d) => d.id === targetId);
      if (!targetDevice) {
        return NextResponse.json(
          { error: "Trusted device not found." },
          { status: 404 }
        );
      }

      const removingCurrentDevice = targetId === ctx.currentDeviceId;

      const updated = await mutateAdminSecurityStore((store) =>
        appendSecurityAudit(
          {
            ...store,
            devices: store.devices.filter((d) => d.id !== targetId),
            passkeys: store.passkeys.filter((pk) => pk.deviceId !== targetId),
          },
          {
            action: "device_revoked",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: targetId,
            deviceLabel: targetDevice.name,
            ipMasked: reqInfo.ipMasked,
            outcome: "info",
            detail: removingCurrentDevice
              ? "Removed active browser from trusted device registry."
              : `Removed "${targetDevice.name}" (${targetDevice.model}) from trusted device registry.`,
          }
        )
      );

      if (removingCurrentDevice) {
        cookieStore.delete(REGISTERED_DEVICE_COOKIE);
        setSessionCookie(cookieStore, {
          epoch: updated.sessionEpoch,
          secure: isSecureRequest(request),
        });
      }

      return NextResponse.json({
        success: true,
        removedCurrentDevice: removingCurrentDevice,
        summary: toSafeSecuritySummary(
          updated,
          removingCurrentDevice ? null : ctx.currentDeviceId
        ),
      });
    }

    if (body.action === "revoke-other-sessions") {
      const updated = await mutateAdminSecurityStore((store) => {
        const nextEpoch = store.sessionEpoch + 1;
        const nowIso = new Date().toISOString();
        const revokedOtherIds = new Set<string>();
        const nextDevices = store.devices.map((d) => {
          if (d.id !== ctx.currentDeviceId && d.status === "active") {
            revokedOtherIds.add(d.id);
            return {
              ...d,
              status: "revoked" as const,
              revokedAt: nowIso,
            };
          }
          return d;
        });

        const revokedCount = revokedOtherIds.size;
        return appendSecurityAudit(
          {
            ...store,
            sessionEpoch: nextEpoch,
            devices: nextDevices,
            passkeys: store.passkeys.filter(
              (pk) => !revokedOtherIds.has(pk.deviceId)
            ),
          },
          {
            action: "sessions_revoked",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: null,
            deviceLabel: `Global Epoch #${nextEpoch}`,
            ipMasked: reqInfo.ipMasked,
            outcome: "info",
            detail:
              revokedCount > 0
                ? `Rotated global session epoch and revoked ${revokedCount} other trusted device${revokedCount === 1 ? "" : "s"}.`
                : "Rotated global session epoch; signed out every other browser session.",
          }
        );
      });

      const secureCookie = isSecureRequest(request);
      setSessionCookie(cookieStore, {
        epoch: updated.sessionEpoch,
        deviceId: ctx.currentDeviceId ?? undefined,
        secure: secureCookie,
      });
      if (ctx.currentDeviceId) {
        setDeviceCookie(cookieStore, {
          deviceId: ctx.currentDeviceId,
          keyThumbprint: ctx.currentDeviceThumbprint ?? null,
          epoch: updated.sessionEpoch,
          secure: secureCookie,
        });
      }

      return NextResponse.json({
        success: true,
        summary: toSafeSecuritySummary(updated, ctx.currentDeviceId),
      });
    }

    if (
      body.action === "toggle-stealth" ||
      body.action === "regenerate-stealth-key"
    ) {
      const updated = await mutateAdminSecurityStore((store) => {
        generatedStealthKey = null;
        const nextEnabled =
          body.action === "regenerate-stealth-key"
            ? store.stealthGateEnabled
            : Boolean(body.stealthGateEnabled);

        let nextKeyHash = store.stealthKeyHash;
        if (
          body.action === "regenerate-stealth-key" ||
          (nextEnabled && !nextKeyHash && !process.env.ADMIN_STEALTH_KEY)
        ) {
          generatedStealthKey = generateReadableRecoveryKey();
          nextKeyHash = sha256Hex(generatedStealthKey);
        }

        return appendSecurityAudit(
          {
            ...store,
            stealthGateEnabled: nextEnabled,
            stealthKeyHash: nextKeyHash,
          },
          {
            action: "stealth_toggled",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: null,
            deviceLabel: nextEnabled ? "Stealth Gate ON" : "Stealth Gate OFF",
            ipMasked: reqInfo.ipMasked,
            outcome: "info",
            detail:
              body.action === "regenerate-stealth-key"
                ? "Generated a new secret ?portal= emergency stealth recovery key."
                : nextEnabled
                  ? "Enabled 404 stealth gate for unregistered /admin visitors."
                  : "Disabled stealth gate on /admin route.",
          }
        );
      });

      return NextResponse.json({
        success: true,
        generatedStealthKey,
        summary: toSafeSecuritySummary(updated, ctx.currentDeviceId),
      });
    }

    return NextResponse.json(
      { error: "Unsupported security action." },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to process security operation." },
      { status: 500 }
    );
  }
}

