import { NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  getSessionAndDeviceContext,
  requireSessionSecret,
  verifyAdminCredential,
} from "@/lib/auth";
import { StorageReadError, StorageWriteError } from "@/lib/db";
import {
  appendSecurityAudit,
  checkSecurityRateLimit,
  clearSecurityRateBucket,
  extractRequestNetworkInfo,
  mutateAdminSecurityStore,
  readAdminSecurityStore,
  recordSecurityRateFailure,
} from "@/lib/security";
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpToken,
} from "@/lib/totp";

export async function POST(request: Request) {
  const ctx = await getSessionAndDeviceContext();
  if (ctx.storageUnavailable) {
    return NextResponse.json(
      { error: "Security registry is temporarily unavailable." },
      { status: 503 }
    );
  }
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reqInfo = extractRequestNetworkInfo(request.headers);

  try {
    const body = (await request.json()) as {
      action?: "begin-setup" | "confirm-setup" | "disable";
      code?: string;
      currentPassword?: string;
    };

    const sessionSecret = requireSessionSecret();

    if (body.action === "begin-setup") {
      const secret = generateTotpSecret();
      const pendingEnc = encryptTotpSecret(secret, sessionSecret);

      await mutateAdminSecurityStore((store) => ({
        ...store,
        totpPendingSecretEnc: pendingEnc,
      }));

      const otpAuthUri = buildOtpAuthUri({
        secret,
        accountName: "Portfolio Admin",
        issuer: "Lou Diamond CMS",
      });
      const qrSvg = await QRCode.toString(otpAuthUri, {
        type: "svg",
        margin: 1,
        width: 220,
        errorCorrectionLevel: "M",
        color: {
          dark: "#111114",
          light: "#ffffff",
        },
      });

      return NextResponse.json({
        success: true,
        qrSvg,
        manualSecret: secret,
        otpAuthUri,
      });
    }

    if (body.action === "confirm-setup") {
      const setupRateKey = `totp-setup:${reqInfo.ipRateKey}`;
      const preStore = await readAdminSecurityStore();
      const setupRate = checkSecurityRateLimit(preStore, setupRateKey);
      if (!setupRate.allowed) {
        return NextResponse.json(
          {
            error: `Too many invalid verification attempts. Retry in ${setupRate.retryAfterSec}s.`,
          },
          {
            status: 429,
            headers: { "Retry-After": String(setupRate.retryAfterSec) },
          }
        );
      }

      const cleanCode = (body.code || "").replace(/\D/g, "");
      if (cleanCode.length !== 6) {
        return NextResponse.json(
          { error: "Enter a valid 6-digit Authenticator verification code." },
          { status: 400 }
        );
      }

      let outcome:
        | { ok: true }
        | { ok: false; status: number; error: string } = {
        ok: false,
        status: 400,
        error: "No pending Authenticator setup found.",
      };

      const updated = await mutateAdminSecurityStore((store) => {
        const pendingSecret = decryptTotpSecret(
          store.totpPendingSecretEnc,
          sessionSecret
        );
        if (!pendingSecret) {
          outcome = {
            ok: false,
            status: 400,
            error: "Authenticator setup expired. Generate a fresh secret QR.",
          };
          return store;
        }

        const verified = verifyTotpToken({
          secret: pendingSecret,
          token: cleanCode,
        });
        if (!verified.valid || verified.matchedStep === null) {
          const penalized = recordSecurityRateFailure(store, setupRateKey, {
            maxFailures: 6,
          });
          const blocked =
            penalized.loginFailures[setupRateKey]?.blockedUntil != null;
          outcome = {
            ok: false,
            status: blocked ? 429 : 400,
            error: blocked
              ? "Too many incorrect 2FA codes. Wait 15 minutes and retry."
              : "6-digit Authenticator code did not match. Check device clock and retry.",
          };
          return penalized;
        }

        outcome = { ok: true };
        const clearedStore = clearSecurityRateBucket(store, setupRateKey);
        return appendSecurityAudit(
          {
            ...clearedStore,
            totpEnabled: true,
            totpSecretEnc: store.totpPendingSecretEnc,
            totpPendingSecretEnc: null,
            totpLastStepUsed: verified.matchedStep,
          },
          {
            action: "totp_updated",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: null,
            deviceLabel: "Authenticator App (TOTP)",
            ipMasked: reqInfo.ipMasked,
            outcome: "success",
            detail: "Enabled Authenticator app 2FA for remote /admin sign-ins.",
          }
        );
      });

      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      }

      return NextResponse.json({
        success: true,
        totpEnabled: updated.totpEnabled,
      });
    }

    if (body.action === "disable") {
      const disableRateKey = `totp-disable:${reqInfo.ipRateKey}`;
      const preStore = await readAdminSecurityStore();
      const disableRate = checkSecurityRateLimit(preStore, disableRateKey);
      if (!disableRate.allowed) {
        return NextResponse.json(
          {
            error: `Too many incorrect password checks. Retry in ${disableRate.retryAfterSec}s.`,
          },
          {
            status: 429,
            headers: { "Retry-After": String(disableRate.retryAfterSec) },
          }
        );
      }

      if (!body.currentPassword) {
        return NextResponse.json(
          { error: "Enter your administrator password to disable Authenticator 2FA." },
          { status: 400 }
        );
      }

      const pwdCheck = await verifyAdminCredential(body.currentPassword);
      if (!pwdCheck.valid) {
        let nowBlocked = false;
        await mutateAdminSecurityStore((store) => {
          const penalized = recordSecurityRateFailure(store, disableRateKey, {
            maxFailures: 5,
          });
          nowBlocked =
            penalized.loginFailures[disableRateKey]?.blockedUntil != null;
          return appendSecurityAudit(penalized, {
            action: nowBlocked ? "login_blocked" : "login_failed",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: null,
            deviceLabel: "Authenticator App (TOTP)",
            ipMasked: reqInfo.ipMasked,
            outcome: "blocked",
            detail: nowBlocked
              ? "Blocked repeated wrong password attempts while trying to disable 2FA."
              : "Incorrect password submitted while trying to disable Authenticator 2FA.",
          });
        });

        return NextResponse.json(
          {
            error: nowBlocked
              ? "Too many incorrect password attempts. Cooldown active for 15 minutes."
              : "Administrator password is incorrect.",
          },
          { status: nowBlocked ? 429 : 401 }
        );
      }

      const updated = await mutateAdminSecurityStore((store) => {
        const cleared = clearSecurityRateBucket(store, disableRateKey);
        return appendSecurityAudit(
          {
            ...cleared,
            totpEnabled: false,
            totpSecretEnc: null,
            totpPendingSecretEnc: null,
            totpLastStepUsed: null,
          },
          {
            action: "totp_updated",
            actorDeviceId: ctx.currentDeviceId,
            targetDeviceId: null,
            deviceLabel: "Authenticator App (TOTP)",
            ipMasked: reqInfo.ipMasked,
            outcome: "info",
            detail: "Disabled Authenticator app 2FA enforcement.",
          }
        );
      });

      return NextResponse.json({
        success: true,
        totpEnabled: updated.totpEnabled,
      });
    }

    return NextResponse.json({ error: "Unknown TOTP action." }, { status: 400 });
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to configure Authenticator 2FA." },
      { status: 500 }
    );
  }
}
