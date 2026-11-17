import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  REGISTERED_DEVICE_COOKIE,
  checkStealthGateAccess,
  getAdminAuthMeta,
  getSessionAndDeviceContext,
  hashAdminPassword,
  getExpectedAdminPassword,
  isSecureRequest,
  isSessionSecretConfigured,
  requireSessionSecret,
  setDeviceCookie,
  setSessionCookie,
  verifyAdminCredential,
} from "@/lib/auth";
import {
  clearAdminCredentialOverride,
  getStorageMode,
  StorageReadError,
  StorageWriteError,
  writeAdminCredentialOverride,
} from "@/lib/db";
import {
  appendSecurityAudit,
  buildDeviceFromTelemetry,
  checkLoginRateLimit,
  checkSecurityRateLimit,
  clearLoginFailureState,
  clearSecurityRateBucket,
  extractRequestNetworkInfo,
  mutateAdminSecurityStore,
  readAdminSecurityStore,
  recordLoginFailureState,
  recordSecurityRateFailure,
  toSafeSecuritySummary,
  touchDeviceActivity,
  upsertTrustedDevice,
} from "@/lib/security";
import { decryptTotpSecret, verifyTotpToken } from "@/lib/totp";
import {
  clientTelemetrySchema,
  passwordChangeSchema,
  sanitizeDeviceLabel,
} from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const reqInfo = extractRequestNetworkInfo(request.headers);
    const ctx = await getSessionAndDeviceContext();

    if (ctx.storageUnavailable) {
      return NextResponse.json(
        { error: "Security registry is temporarily unavailable." },
        { status: 503 }
      );
    }

    if (ctx.currentDeviceId && (ctx.authenticated || ctx.deviceRegistered)) {
      void touchDeviceActivity(ctx.currentDeviceId, reqInfo.ipMasked);
    }

    if (!ctx.authenticated) {
      return NextResponse.json({
        authenticated: false,
        deviceRegistered: ctx.deviceRegistered,
        storageMode: getStorageMode(),
      });
    }

    const [authMeta, securityStore] = await Promise.all([
      getAdminAuthMeta(),
      readAdminSecurityStore(),
    ]);

    const securitySummary = toSafeSecuritySummary(
      securityStore,
      ctx.currentDeviceId
    );

    return NextResponse.json({
      authenticated: true,
      deviceRegistered: ctx.deviceRegistered,
      currentDeviceId: ctx.currentDeviceId,
      sessionEpoch: securitySummary.sessionEpoch,
      stealthGateEnabled: securitySummary.stealthGateEnabled,
      stealthKeyConfigured: securitySummary.stealthKeyConfigured,
      totpEnabled: securitySummary.totpEnabled,
      activeDeviceCount: securitySummary.activeDeviceCount,
      storageMode: getStorageMode(),
      ...authMeta,
    });
  } catch (err) {
    if (err instanceof StorageReadError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to verify admin session status." },
      { status: 500 }
    );
  }
}

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

    const body = (await request.json()) as {
      password?: string;
      totpCode?: string;
      registerDevice?: boolean;
      deviceName?: string;
      telemetry?: unknown;
      portalKey?: string;
      stealthUnlockToken?: string;
    };

    // Enforce Stealth Gate consistently on auth endpoint too
    const stealthCheck = await checkStealthGateAccess({
      portalKey: body.portalKey,
      stealthUnlockToken: body.stealthUnlockToken,
    });
    if (stealthCheck.storageUnavailable) {
      return NextResponse.json(
        { success: false, error: "Security storage temporarily unavailable." },
        { status: 503 }
      );
    }
    if (!stealthCheck.allowed) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    if (!body.password) {
      return NextResponse.json(
        { success: false, error: "Administrator password is required." },
        { status: 400 }
      );
    }

    const currentStore = await readAdminSecurityStore();
    const rate = checkLoginRateLimit(currentStore, reqInfo.ipRateKey);
    if (!rate.allowed) {
      const mins = Math.floor(rate.retryAfterSec / 60);
      const secs = rate.retryAfterSec % 60;
      const waitLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed sign-in attempts. Locked for ${waitLabel}.`,
          retryAfterSec: rate.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSec) },
        }
      );
    }

    const check = await verifyAdminCredential(body.password);
    if (check.source === "unconfigured") {
      return NextResponse.json(
        {
          success: false,
          error:
            check.error ||
            "Administrator password is not configured. Set ADMIN_PASSWORD in environment variables.",
        },
        { status: 503 }
      );
    }

    if (!check.valid) {
      await mutateAdminSecurityStore((store) => {
        const penalized = recordLoginFailureState(store, reqInfo.ipRateKey);
        const nowBlocked =
          penalized.loginFailures[reqInfo.ipRateKey]?.blockedUntil != null;
        return appendSecurityAudit(penalized, {
          action: nowBlocked ? "login_blocked" : "login_failed",
          actorDeviceId: null,
          targetDeviceId: null,
          deviceLabel: reqInfo.userAgent.slice(0, 48),
          ipMasked: reqInfo.ipMasked,
          outcome: "blocked",
          detail: nowBlocked
            ? "Exceeded maximum failed login attempts (15m cooldown activated)."
            : "Incorrect administrator password submitted.",
        });
      });

      return NextResponse.json(
        { success: false, error: "Invalid administrator password." },
        { status: 401 }
      );
    }

    const shouldRegisterDevice = body.registerDevice !== false;
    const parsedTelemetry = clientTelemetrySchema.safeParse(
      body.telemetry ?? {}
    );
    const telemetry = parsedTelemetry.success ? parsedTelemetry.data : null;
    const customName = body.deviceName
      ? sanitizeDeviceLabel(body.deviceName, 60)
      : undefined;

    const existingCtx = await getSessionAndDeviceContext();
    let registeredDeviceId: string | undefined = existingCtx.currentDeviceId ?? undefined;
    let savedThumbprint: string | null = telemetry?.keyThumbprint ?? null;
    const totpOutcomeBox: {
      current:
        | { ok: true; usedTotp: boolean }
        | { ok: false; requiresTotp: true; error: string; status: number };
    } = {
      current: { ok: true, usedTotp: false },
    };

    const updatedStore = await mutateAdminSecurityStore((store) => {
      let nextStore = store;
      let usedTotp = false;

      if (store.totpEnabled && store.totpSecretEnc) {
        const rawCode = (body.totpCode || "").replace(/\D/g, "");
        if (!rawCode) {
          totpOutcomeBox.current = {
            ok: false,
            requiresTotp: true,
            error: "Enter the 6-digit verification code from your Authenticator app.",
            status: 401,
          };
          return store;
        }

        const secret = decryptTotpSecret(
          store.totpSecretEnc,
          requireSessionSecret()
        );
        const verified = secret
          ? verifyTotpToken({
              secret,
              token: rawCode,
              lastStepUsed: store.totpLastStepUsed,
            })
          : { valid: false, matchedStep: null, replayed: false };

        if (!verified.valid || verified.matchedStep === null) {
          const penalized = recordLoginFailureState(store, reqInfo.ipRateKey);
          const nowBlocked =
            penalized.loginFailures[reqInfo.ipRateKey]?.blockedUntil != null;
          totpOutcomeBox.current = {
            ok: false,
            requiresTotp: true,
            error: verified.replayed
              ? "That 6-digit code was already used. Wait for the next code."
              : "Invalid 6-digit Authenticator verification code.",
            status: nowBlocked ? 429 : 401,
          };
          return appendSecurityAudit(penalized, {
            action: nowBlocked ? "login_blocked" : "login_failed",
            actorDeviceId: null,
            targetDeviceId: null,
            deviceLabel: reqInfo.userAgent.slice(0, 48),
            ipMasked: reqInfo.ipMasked,
            outcome: "blocked",
            detail: "Invalid or replayed Authenticator TOTP code during login.",
          });
        }

        usedTotp = true;
        nextStore = {
          ...nextStore,
          totpLastStepUsed: verified.matchedStep,
        };
      }

      nextStore = clearLoginFailureState(nextStore, reqInfo.ipRateKey);
      totpOutcomeBox.current = { ok: true, usedTotp };

      if (shouldRegisterDevice) {
        const built = buildDeviceFromTelemetry({
          telemetry,
          customName,
          ipMasked: reqInfo.ipMasked,
          userAgent: reqInfo.userAgent,
          localHostname: reqInfo.localHostname,
          trustSource: stealthCheck.unlockedViaKey
            ? "stealth-unlock"
            : usedTotp
              ? "totp"
              : "login",
          existingDeviceId: existingCtx.currentDeviceId ?? undefined,
        });

        const upserted = upsertTrustedDevice(nextStore, built, {
          preserveExistingName: !customName,
        });
        nextStore = upserted.store;
        registeredDeviceId = upserted.saved.id;
        savedThumbprint = upserted.saved.keyThumbprint;

        if (stealthCheck.unlockedViaKey) {
          nextStore = appendSecurityAudit(nextStore, {
            action: "stealth_unlock",
            actorDeviceId: upserted.saved.id,
            targetDeviceId: upserted.saved.id,
            deviceLabel: upserted.saved.name,
            ipMasked: reqInfo.ipMasked,
            outcome: "info",
            detail: "Accessed /admin via stealth recovery key and registered device.",
          });
        } else {
          nextStore = appendSecurityAudit(nextStore, {
            action: "login_success",
            actorDeviceId: upserted.saved.id,
            targetDeviceId: upserted.saved.id,
            deviceLabel: upserted.saved.name,
            ipMasked: reqInfo.ipMasked,
            outcome: "success",
            detail: `Signed in${usedTotp ? " + TOTP 2FA" : ""} (${upserted.saved.platform} · ${upserted.saved.browser}).`,
          });
        }
      } else {
        nextStore = appendSecurityAudit(nextStore, {
          action: "login_success",
          actorDeviceId: registeredDeviceId ?? null,
          targetDeviceId: null,
          deviceLabel: telemetry?.suggestedName || "Temporary Browser Session",
          ipMasked: reqInfo.ipMasked,
          outcome: "success",
          detail: "Signed in cleanly without registering persistent portal trust.",
        });
      }

      return nextStore;
    });

    const totpOutcome = totpOutcomeBox.current;
    if (!totpOutcome.ok) {
      return NextResponse.json(
        {
          success: false,
          requiresTotp: totpOutcome.requiresTotp,
          error: totpOutcome.error,
        },
        { status: totpOutcome.status }
      );
    }

    const cookieStore = await cookies();
    const secureCookie = isSecureRequest(request);
    setSessionCookie(cookieStore, {
      epoch: updatedStore.sessionEpoch,
      deviceId: shouldRegisterDevice ? registeredDeviceId : undefined,
      secure: secureCookie,
    });

    if (shouldRegisterDevice && registeredDeviceId) {
      setDeviceCookie(cookieStore, {
        deviceId: registeredDeviceId,
        keyThumbprint: savedThumbprint,
        epoch: updatedStore.sessionEpoch,
        secure: secureCookie,
      });
    } else {
      cookieStore.delete(REGISTERED_DEVICE_COOKIE);
    }

    const authMeta = await getAdminAuthMeta();
    return NextResponse.json({
      success: true,
      deviceRegistered: shouldRegisterDevice,
      currentDeviceId: shouldRegisterDevice ? registeredDeviceId : null,
      sessionEpoch: updatedStore.sessionEpoch,
      stealthGateEnabled: updatedStore.stealthGateEnabled,
      totpEnabled: updatedStore.totpEnabled,
      activeDeviceCount: updatedStore.devices.filter(
        (d) => d.status === "active"
      ).length,
      storageMode: getStorageMode(),
      ...authMeta,
    });
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Authentication failed." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const ctx = await getSessionAndDeviceContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reqInfo = extractRequestNetworkInfo(request.headers);

  try {
    const body = (await request.json()) as {
      action?: "change-password" | "revert-env";
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    if (body.action === "revert-env") {
      if (!getExpectedAdminPassword()) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Cannot revert because ADMIN_PASSWORD is not configured in environment variables.",
          },
          { status: 400 }
        );
      }

      await clearAdminCredentialOverride();

      const updatedStore = await mutateAdminSecurityStore((store) => {
        const nextEpoch = store.sessionEpoch + 1;
        return appendSecurityAudit(
          { ...store, sessionEpoch: nextEpoch },
          {
            action: "password_changed",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: null,
            deviceLabel: "All Sessions Rotated",
            ipMasked: reqInfo.ipMasked,
            outcome: "info",
            detail:
              "Reverted password to ADMIN_PASSWORD env fallback; prior sessions invalidated.",
          }
        );
      });

      const cookieStore = await cookies();
      setSessionCookie(cookieStore, {
        epoch: updatedStore.sessionEpoch,
        deviceId: ctx.currentDeviceId ?? undefined,
        secure: isSecureRequest(request),
      });

      const authMeta = await getAdminAuthMeta();
      return NextResponse.json({
        success: true,
        sessionEpoch: updatedStore.sessionEpoch,
        ...authMeta,
      });
    }

    const parsed = passwordChangeSchema.safeParse({
      currentPassword: body.currentPassword ?? "",
      newPassword: body.newPassword ?? "",
      confirmPassword: body.confirmPassword ?? "",
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: firstIssue?.message || "Invalid password update payload.",
        },
        { status: 400 }
      );
    }

    const pwdRateKey = `pwd:${reqInfo.ipRateKey}`;
    const currentStore = await readAdminSecurityStore();
    const pwdRate = checkSecurityRateLimit(currentStore, pwdRateKey);
    if (!pwdRate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many incorrect password checks. Retry in ${pwdRate.retryAfterSec}s.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(pwdRate.retryAfterSec) },
        }
      );
    }

    const currentCheck = await verifyAdminCredential(parsed.data.currentPassword);
    if (!currentCheck.valid) {
      await mutateAdminSecurityStore((store) =>
        recordSecurityRateFailure(store, pwdRateKey)
      );
      return NextResponse.json(
        { success: false, error: "Current password is incorrect." },
        { status: 401 }
      );
    }

    if (parsed.data.newPassword === parsed.data.currentPassword) {
      return NextResponse.json(
        {
          success: false,
          error: "New password must differ from your current password.",
        },
        { status: 400 }
      );
    }

    const updatedAt = new Date().toISOString();
    const passwordHash = hashAdminPassword(parsed.data.newPassword);
    await writeAdminCredentialOverride({
      passwordHash,
      updatedAt,
    });

    const updatedStore = await mutateAdminSecurityStore((store) => {
      const nextEpoch = store.sessionEpoch + 1;
      const cleared = clearSecurityRateBucket(store, pwdRateKey);
      return appendSecurityAudit(
        { ...cleared, sessionEpoch: nextEpoch },
        {
          action: "password_changed",
          actorDeviceId: ctx.currentDeviceId,
          targetDeviceId: null,
          deviceLabel: `Epoch #${nextEpoch}`,
          ipMasked: reqInfo.ipMasked,
          outcome: "success",
          detail:
            "Updated administrator scrypt password hash and rotated global session epoch.",
        }
      );
    });

    const cookieStore = await cookies();
    setSessionCookie(cookieStore, {
      epoch: updatedStore.sessionEpoch,
      deviceId: ctx.currentDeviceId ?? undefined,
      secure: isSecureRequest(request),
    });

    const authMeta = await getAdminAuthMeta();
    return NextResponse.json({
      success: true,
      sessionEpoch: updatedStore.sessionEpoch,
      ...authMeta,
    });
  } catch (err) {
    if (err instanceof StorageWriteError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to update administrator password." },
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
      registered?: boolean;
      name?: string;
      telemetry?: unknown;
    };

    const cookieStore = await cookies();

    if (body.registered) {
      const parsedTelemetry = clientTelemetrySchema.safeParse(
        body.telemetry ?? {}
      );
      const telemetry = parsedTelemetry.success ? parsedTelemetry.data : null;

      let savedId = ctx.currentDeviceId ?? undefined;
      let savedThumbprint = telemetry?.keyThumbprint ?? null;

      const updatedStore = await mutateAdminSecurityStore((store) => {
        const built = buildDeviceFromTelemetry({
          telemetry,
          customName: body.name
            ? sanitizeDeviceLabel(body.name, 60)
            : undefined,
          ipMasked: reqInfo.ipMasked,
          userAgent: reqInfo.userAgent,
          localHostname: reqInfo.localHostname,
          trustSource: "manual",
          existingDeviceId: ctx.currentDeviceId ?? undefined,
        });
        const upserted = upsertTrustedDevice(store, built, {
          preserveExistingName: !body.name?.trim(),
        });
        savedId = upserted.saved.id;
        savedThumbprint = upserted.saved.keyThumbprint;
        return appendSecurityAudit(upserted.store, {
          action: "device_registered",
          actorDeviceId: upserted.saved.id,
          targetDeviceId: upserted.saved.id,
          deviceLabel: upserted.saved.name,
          ipMasked: reqInfo.ipMasked,
          outcome: "success",
          detail: `Registered ${upserted.saved.model} (${upserted.saved.platform}).`,
        });
      });

      if (savedId) {
        const secureCookie = isSecureRequest(request);
        setDeviceCookie(cookieStore, {
          deviceId: savedId,
          keyThumbprint: savedThumbprint,
          epoch: updatedStore.sessionEpoch,
          secure: secureCookie,
        });
        setSessionCookie(cookieStore, {
          epoch: updatedStore.sessionEpoch,
          deviceId: savedId,
          secure: secureCookie,
        });
      }

      return NextResponse.json({
        success: true,
        deviceRegistered: true,
        currentDeviceId: savedId ?? null,
      });
    } else {
      let nextEpoch = ctx.sessionEpoch;
      if (ctx.currentDeviceId) {
        const targetId = ctx.currentDeviceId;
        const updated = await mutateAdminSecurityStore((store) => {
          const target = store.devices.find((d) => d.id === targetId);
          const nextDevices = store.devices.map((d) =>
            d.id === targetId
              ? {
                  ...d,
                  status: "revoked" as const,
                  revokedAt: new Date().toISOString(),
                }
              : d
          );
          return appendSecurityAudit(
            { ...store, devices: nextDevices },
            {
              action: "device_revoked",
              actorDeviceId: targetId,
              targetDeviceId: targetId,
              deviceLabel: target?.name || "Current Browser",
              ipMasked: reqInfo.ipMasked,
              outcome: "info",
              detail: "Unregistered this device from trusted Brand Portal access.",
            }
          );
        });
        nextEpoch = updated.sessionEpoch;
      }

      cookieStore.delete(REGISTERED_DEVICE_COOKIE);
      setSessionCookie(cookieStore, {
        epoch: nextEpoch,
        secure: isSecureRequest(request),
      });

      return NextResponse.json({
        success: true,
        deviceRegistered: false,
        currentDeviceId: null,
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to update device registration." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const unregisterDevice = searchParams.get("unregisterDevice") === "true";

  const ctx = await getSessionAndDeviceContext();
  const reqInfo = extractRequestNetworkInfo(request.headers);

  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);

  if (unregisterDevice) {
    if (ctx.currentDeviceId) {
      const targetId = ctx.currentDeviceId;
      await mutateAdminSecurityStore((store) => {
        const target = store.devices.find((d) => d.id === targetId);
        return appendSecurityAudit(
          {
            ...store,
            devices: store.devices.map((d) =>
              d.id === targetId
                ? {
                    ...d,
                    status: "revoked" as const,
                    revokedAt: new Date().toISOString(),
                  }
                : d
            ),
          },
          {
            action: "device_revoked",
            actorDeviceId: targetId,
            targetDeviceId: targetId,
            deviceLabel: target?.name || "Current Browser",
            ipMasked: reqInfo.ipMasked,
            outcome: "info",
            detail: "Signed out and unregistered device from trusted portal list.",
          }
        );
      });
    }
    cookieStore.delete(REGISTERED_DEVICE_COOKIE);
  }

  return NextResponse.json({
    success: true,
    deviceRegistered: !unregisterDevice && ctx.deviceRegistered,
  });
}
