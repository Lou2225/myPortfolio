import { collectClientDeviceTelemetry } from "@/lib/deviceTelemetry";
import {
  DEVICE_STORAGE_KEY,
  DEVICE_SYNC_EVENT,
} from "@/lib/brandPortalStatus";
import type { DevicePasskey, SafeSecuritySummary } from "@/types/security";

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function stringToUint8Array(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

// Standard 26-byte ASN.1 DER SubjectPublicKeyInfo prefix for uncompressed P-256 (secp256r1) points
const P256_SPKI_PREFIX = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
  0x04,
]);

/**
 * Fallback extractor for `authData` and P-256 SPKI public key from `attestationObject`
 * when an environment does not expose `response.getAuthenticatorData()` or `response.getPublicKey()`.
 */
function extractFromAttestationObjectFallback(
  attestationObject: ArrayBuffer
): {
  authData: ArrayBuffer | null;
  publicKeySpki: ArrayBuffer | null;
} {
  const bytes = new Uint8Array(attestationObject);
  // Locate ASCII "authData" (0x68 61 75 74 68 44 61 74 61)
  const needle = [0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61];
  let authDataStart = -1;
  let authDataLen = 0;

  for (let i = 0; i <= bytes.length - needle.length - 3; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      const hdrOffset = i + needle.length;
      const majorByte = bytes[hdrOffset];
      if (majorByte === 0x58) {
        authDataLen = bytes[hdrOffset + 1];
        authDataStart = hdrOffset + 2;
      } else if (majorByte === 0x59) {
        authDataLen = (bytes[hdrOffset + 1] << 8) | bytes[hdrOffset + 2];
        authDataStart = hdrOffset + 3;
      } else if (majorByte >= 0x40 && majorByte <= 0x57) {
        authDataLen = majorByte - 0x40;
        authDataStart = hdrOffset + 1;
      }
      break;
    }
  }

  if (
    authDataStart < 0 ||
    authDataLen < 55 ||
    authDataStart + authDataLen > bytes.length
  ) {
    return { authData: null, publicKeySpki: null };
  }

  const authDataSlice = bytes.slice(authDataStart, authDataStart + authDataLen);
  const credIdLen = (authDataSlice[53] << 8) | authDataSlice[54];
  const coseOffset = 55 + credIdLen;
  if (coseOffset >= authDataSlice.length) {
    return { authData: authDataSlice.buffer, publicKeySpki: null };
  }

  const coseBytes = authDataSlice.slice(coseOffset);
  let xCoord: Uint8Array | null = null;
  let yCoord: Uint8Array | null = null;

  for (let i = 0; i <= coseBytes.length - 35; i++) {
    if (
      coseBytes[i] === 0x21 &&
      coseBytes[i + 1] === 0x58 &&
      coseBytes[i + 2] === 0x20
    ) {
      xCoord = coseBytes.slice(i + 3, i + 35);
    } else if (
      coseBytes[i] === 0x22 &&
      coseBytes[i + 1] === 0x58 &&
      coseBytes[i + 2] === 0x20
    ) {
      yCoord = coseBytes.slice(i + 3, i + 35);
    }
  }

  if (!xCoord || !yCoord) {
    return { authData: authDataSlice.buffer, publicKeySpki: null };
  }

  const spki = new Uint8Array(P256_SPKI_PREFIX.length + 64);
  spki.set(P256_SPKI_PREFIX, 0);
  spki.set(xCoord, P256_SPKI_PREFIX.length);
  spki.set(yCoord, P256_SPKI_PREFIX.length + 32);

  return {
    authData: authDataSlice.buffer,
    publicKeySpki: spki.buffer,
  };
}

/**
 * Checks whether the current browser and origin support platform WebAuthn passkeys
 * (Windows Hello, Apple Touch ID / Face ID, iCloud Keychain, Android Biometrics).
 */
export async function checkPlatformPasskeySupport(): Promise<{
  supported: boolean;
  platformAuthenticatorAvailable: boolean;
  reason?: string;
}> {
  if (typeof window === "undefined") {
    return {
      supported: false,
      platformAuthenticatorAvailable: false,
      reason: "Server environment",
    };
  }

  if (!window.isSecureContext) {
    return {
      supported: false,
      platformAuthenticatorAvailable: false,
      reason: "Passkeys require HTTPS or localhost.",
    };
  }

  const hostname = window.location.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return {
      supported: false,
      platformAuthenticatorAvailable: false,
      reason:
        "Passkeys require a domain name (louvaldellon.vercel.app or localhost) rather than an IP address.",
    };
  }

  if (
    typeof window.PublicKeyCredential === "undefined" ||
    !navigator.credentials?.create ||
    !navigator.credentials?.get
  ) {
    return {
      supported: false,
      platformAuthenticatorAvailable: false,
      reason: "This browser does not support WebAuthn passkeys.",
    };
  }

  let platformAvailable = true;
  try {
    if (
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
      "function"
    ) {
      platformAvailable =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    platformAvailable = false;
  }

  return {
    supported: true,
    platformAuthenticatorAvailable: platformAvailable,
  };
}

/**
 * Enrolls a new OS/hardware WebAuthn passkey for the currently authenticated admin device.
 */
export async function registerDevicePasskey(options?: {
  deviceId?: string;
  deviceName?: string;
}): Promise<
  | {
      ok: true;
      passkey: DevicePasskey;
      currentDeviceId: string;
      summary: SafeSecuritySummary;
    }
  | { ok: false; cancelled?: boolean; error: string }
> {
  try {
    const support = await checkPlatformPasskeySupport();
    if (!support.supported) {
      return {
        ok: false,
        error:
          support.reason || "WebAuthn passkeys are not supported on this origin.",
      };
    }

    const optRes = await fetch("/api/admin/devices/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register-options",
        deviceId: options?.deviceId,
      }),
    });
    const optData = (await optRes.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      challenge?: string;
      rpId?: string;
      rpName?: string;
      user?: { id: string; name: string; displayName: string };
      excludeCredentialIds?: string[];
    };

    if (!optRes.ok || !optData.challenge || !optData.rpId || !optData.user) {
      return {
        ok: false,
        error:
          optData.error || "Failed to initialize passkey registration options.",
      };
    }

    const challengeBytes = stringToUint8Array(optData.challenge);
    const userIdBytes = stringToUint8Array(optData.user.id);
    const excludeCredentials: PublicKeyCredentialDescriptor[] = (
      optData.excludeCredentialIds || []
    ).map((id) => ({
      id: base64UrlToUint8Array(id) as BufferSource,
      type: "public-key",
    }));

    const created = (await navigator.credentials.create({
      publicKey: {
        rp: {
          id: optData.rpId,
          name: optData.rpName || "Lou Diamond Valdellon — Portfolio CMS",
        },
        user: {
          id: userIdBytes as BufferSource,
          name: optData.user.name,
          displayName: optData.user.displayName,
        },
        challenge: challengeBytes as BufferSource,
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256 (ECDSA P-256)
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
        attestation: "none",
        excludeCredentials,
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!created) {
      return {
        ok: false,
        cancelled: true,
        error: "Passkey creation was cancelled.",
      };
    }

    const attResponse = created.response as AuthenticatorAttestationResponse & {
      getAuthenticatorData?: () => ArrayBuffer;
      getPublicKey?: () => ArrayBuffer | null;
      getPublicKeyAlgorithm?: () => number;
      getTransports?: () => string[];
    };

    let authDataBuf =
      typeof attResponse.getAuthenticatorData === "function"
        ? attResponse.getAuthenticatorData()
        : null;
    let spkiBuf =
      typeof attResponse.getPublicKey === "function"
        ? attResponse.getPublicKey()
        : null;

    if (!authDataBuf || !spkiBuf) {
      const fallback = extractFromAttestationObjectFallback(
        attResponse.attestationObject
      );
      authDataBuf = authDataBuf || fallback.authData;
      spkiBuf = spkiBuf || fallback.publicKeySpki;
    }

    if (!authDataBuf || !spkiBuf) {
      return {
        ok: false,
        error:
          "Browser did not return a standard SPKI public key from the passkey authenticator.",
      };
    }

    const algorithm =
      typeof attResponse.getPublicKeyAlgorithm === "function"
        ? attResponse.getPublicKeyAlgorithm()
        : -7;
    const transports =
      typeof attResponse.getTransports === "function"
        ? attResponse.getTransports()
        : ["internal"];

    const telemetry = await collectClientDeviceTelemetry();
    const credentialId = arrayBufferToBase64Url(created.rawId);

    const verifyRes = await fetch("/api/admin/devices/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register-verify",
        credentialId,
        clientDataJSON: arrayBufferToBase64Url(attResponse.clientDataJSON),
        authenticatorData: arrayBufferToBase64Url(authDataBuf),
        publicKeySpki: arrayBufferToBase64Url(spkiBuf),
        algorithm,
        transports,
        deviceName: options?.deviceName,
        telemetry,
      }),
    });

    const verifyData = (await verifyRes.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      passkey?: DevicePasskey;
      currentDeviceId?: string;
      summary?: SafeSecuritySummary;
    };

    if (
      !verifyRes.ok ||
      !verifyData.success ||
      !verifyData.passkey ||
      !verifyData.currentDeviceId ||
      !verifyData.summary
    ) {
      return {
        ok: false,
        error: verifyData.error || "Passkey verification failed.",
      };
    }

    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, "true");
      window.dispatchEvent(
        new CustomEvent(DEVICE_SYNC_EVENT, { detail: true })
      );
    } catch {
      // Ignore storage error
    }

    return {
      ok: true,
      passkey: verifyData.passkey,
      currentDeviceId: verifyData.currentDeviceId,
      summary: verifyData.summary,
    };
  } catch (err) {
    const domErr = err as { name?: string; message?: string };
    if (
      domErr?.name === "NotAllowedError" ||
      domErr?.name === "AbortError"
    ) {
      return {
        ok: false,
        cancelled: true,
        error: "Passkey prompt was dismissed or timed out.",
      };
    }
    if (domErr?.name === "InvalidStateError") {
      return {
        ok: false,
        error: "A passkey for this authenticator is already linked to this domain.",
      };
    }
    return {
      ok: false,
      error:
        domErr?.message || "Unable to complete hardware passkey registration.",
    };
  }
}

/**
 * Authenticates the admin and links the current browser to its physical TrustedDevice
 * in one step using an enrolled OS/hardware WebAuthn passkey.
 */
export async function authenticateWithPasskey(): Promise<
  | {
      ok: true;
      currentDeviceId: string;
      deviceName: string;
      authenticatorLabel: string;
    }
  | {
      ok: false;
      cancelled?: boolean;
      notConfigured?: boolean;
      error: string;
    }
> {
  try {
    const support = await checkPlatformPasskeySupport();
    if (!support.supported) {
      return {
        ok: false,
        error:
          support.reason || "WebAuthn passkeys are not supported on this origin.",
      };
    }

    const optRes = await fetch("/api/admin/devices/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auth-options" }),
    });
    const optData = (await optRes.json().catch(() => ({}))) as {
      success?: boolean;
      available?: boolean;
      error?: string;
      challenge?: string;
      rpId?: string;
      allowCredentialIds?: string[];
    };

    if (!optRes.ok) {
      return {
        ok: false,
        error: optData.error || "Failed to request passkey challenge.",
      };
    }

    if (!optData.available || !optData.challenge || !optData.rpId) {
      return {
        ok: false,
        notConfigured: true,
        error:
          "No passkey is linked for this domain yet. Sign in once with your password and click 'Link Passkey' in Security & Access.",
      };
    }

    const challengeBytes = stringToUint8Array(optData.challenge);
    const allowCredentials: PublicKeyCredentialDescriptor[] = (
      optData.allowCredentialIds || []
    ).map((id) => ({
      id: base64UrlToUint8Array(id) as BufferSource,
      type: "public-key",
    }));

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: challengeBytes as BufferSource,
        rpId: optData.rpId,
        allowCredentials,
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      return {
        ok: false,
        cancelled: true,
        error: "Passkey sign-in was cancelled.",
      };
    }

    const authResponse = assertion.response as AuthenticatorAssertionResponse;
    const telemetry = await collectClientDeviceTelemetry();
    const credentialId = arrayBufferToBase64Url(assertion.rawId);

    const verifyRes = await fetch("/api/admin/devices/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "auth-verify",
        credentialId,
        clientDataJSON: arrayBufferToBase64Url(authResponse.clientDataJSON),
        authenticatorData: arrayBufferToBase64Url(
          authResponse.authenticatorData
        ),
        signature: arrayBufferToBase64Url(authResponse.signature),
        telemetry,
      }),
    });

    const verifyData = (await verifyRes.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      currentDeviceId?: string;
      deviceName?: string;
      authenticatorLabel?: string;
    };

    if (!verifyRes.ok || !verifyData.success || !verifyData.currentDeviceId) {
      return {
        ok: false,
        error: verifyData.error || "Passkey verification failed.",
      };
    }

    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, "true");
      window.dispatchEvent(
        new CustomEvent(DEVICE_SYNC_EVENT, { detail: true })
      );
    } catch {
      // Ignore storage error
    }

    return {
      ok: true,
      currentDeviceId: verifyData.currentDeviceId,
      deviceName: verifyData.deviceName || "Trusted Device",
      authenticatorLabel: verifyData.authenticatorLabel || "Passkey",
    };
  } catch (err) {
    const domErr = err as { name?: string; message?: string };
    if (
      domErr?.name === "NotAllowedError" ||
      domErr?.name === "AbortError"
    ) {
      return {
        ok: false,
        cancelled: true,
        error: "Passkey prompt was dismissed or timed out.",
      };
    }
    return {
      ok: false,
      error: domErr?.message || "Unable to verify hardware passkey.",
    };
  }
}
