import crypto from "crypto";
import { requireSessionSecret } from "@/lib/auth";
import { constantTimeHashEqual } from "@/lib/security";
import { getSiteUrl } from "@/lib/siteUrl";

const SUPPORTED_COSE_ALGORITHMS = new Set<number>([-7, -257]);

export interface PasskeyChallengePayload {
  kind: "webauthn_passkey_challenge";
  purpose: "register" | "auth";
  rpId: string;
  origin: string;
  deviceId?: string | null;
  nonce: string;
  exp: number;
}

export interface ParsedAuthenticatorData {
  rpIdHash: Buffer;
  userPresent: boolean;
  userVerified: boolean;
  backupEligible: boolean;
  backedUp: boolean;
  attestedCredentialDataIncluded: boolean;
  counter: number;
  aaguid: string | null;
  attestedCredentialId: string | null;
}

const KNOWN_AAGUID_LABELS: Record<string, string> = {
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Apple Touch ID / Face ID",
  "bada5566-a7aa-401f-bd96-45619a55120d": "Apple Passkey",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "b5397666-4885-aa6b-cebf-e52262a439a2": "Chromium Passkey",
};

function getAllowedPasskeyHostnames(incomingUrl: URL): Set<string> {
  const allowed = new Set<string>(["localhost"]);
  const addHost = (raw?: string | null) => {
    const trimmed = (raw || "").trim();
    if (!trimmed) return;
    try {
      const parsed = /^https?:\/\//i.test(trimmed)
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`);
      if (parsed.hostname) {
        allowed.add(parsed.hostname.toLowerCase());
      }
    } catch {
      // ignore malformed host env value
    }
  };

  addHost(incomingUrl.hostname);
  addHost(getSiteUrl().hostname);
  addHost(process.env.NEXT_PUBLIC_SITE_URL);
  addHost(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  addHost(process.env.VERCEL_URL);
  return allowed;
}

/**
 * Resolves the active WebAuthn Relying Party ID (`rpId`) and expected `origin`
 * from an incoming HTTP request while strictly allowlisting canonical/deployment hosts.
 */
export function resolvePasskeyRelyingParty(request: Request): {
  rpId: string;
  origin: string;
  supported: boolean;
  reason?: string;
} {
  let incoming: URL;
  try {
    incoming = new URL(request.url);
  } catch {
    return {
      rpId: "localhost",
      origin: "http://localhost:3000",
      supported: false,
      reason: "Unable to parse request URL for WebAuthn passkey.",
    };
  }

  const allowedHosts = getAllowedPasskeyHostnames(incoming);
  const headerOrigin = request.headers.get("origin")?.trim();
  let url: URL;
  try {
    if (headerOrigin) {
      url = new URL(headerOrigin);
      if (url.username || url.password) {
        throw new Error("Origin must not include credentials.");
      }
    } else {
      const forwardedProto = request.headers
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim();
      const forwardedHost = request.headers
        .get("x-forwarded-host")
        ?.split(",")[0]
        ?.trim();
      const proto = forwardedProto
        ? `${forwardedProto.replace(/:$/, "")}:`
        : incoming.protocol;
      const host = forwardedHost || request.headers.get("host") || incoming.host;
      url = new URL(`${proto}//${host}`);
      if (
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        throw new Error("Host header contains unexpected URL components.");
      }
    }
  } catch {
    return {
      rpId: "localhost",
      origin: "http://localhost:3000",
      supported: false,
      reason: "Unable to parse request origin for WebAuthn passkey.",
    };
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname.endsWith(".localhost");
  if (!isLocalhost && !allowedHosts.has(hostname)) {
    return {
      rpId: hostname,
      origin: url.origin,
      supported: false,
      reason: `Untrusted WebAuthn origin host (${hostname}).`,
    };
  }

  const isIpAddress =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");

  if (isIpAddress) {
    return {
      rpId: hostname,
      origin: url.origin,
      supported: false,
      reason:
        "WebAuthn passkeys require a domain name (such as louvaldellon.vercel.app or localhost) rather than a raw IP address.",
    };
  }

  if (url.protocol !== "https:" && !isLocalhost) {
    return {
      rpId: hostname,
      origin: url.origin,
      supported: false,
      reason: "WebAuthn passkeys require HTTPS (or http://localhost in development).",
    };
  }

  return {
    rpId: hostname,
    origin: url.origin,
    supported: true,
  };
}

export function createPasskeyChallengeToken(params: {
  purpose: "register" | "auth";
  rpId: string;
  origin: string;
  deviceId?: string | null;
}): string {
  const secret = requireSessionSecret();
  const payload: PasskeyChallengePayload = {
    kind: "webauthn_passkey_challenge",
    purpose: params.purpose,
    rpId: params.rpId.toLowerCase(),
    origin: params.origin,
    deviceId: params.deviceId ?? null,
    nonce: crypto.randomBytes(16).toString("base64url"),
    exp: Date.now() + 1000 * 60 * 3, // 3 minutes
  };

  const encoded = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyPasskeyChallengeToken(
  token: string,
  expected: {
    purpose: "register" | "auth";
    rpId: string;
    origin: string;
  }
): PasskeyChallengePayload | null {
  if (!token || !token.includes(".")) return null;
  let secret: string;
  try {
    secret = requireSessionSecret();
  } catch {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  if (!constantTimeHashEqual(sig, expectedSig)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8")
    ) as PasskeyChallengePayload;

    if (
      payload.kind !== "webauthn_passkey_challenge" ||
      payload.purpose !== expected.purpose ||
      payload.rpId !== expected.rpId.toLowerCase() ||
      payload.origin !== expected.origin ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length < 16 ||
      typeof payload.exp !== "number" ||
      Date.now() > payload.exp
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function formatAaguid(bytes: Buffer): string | null {
  if (bytes.length !== 16) return null;
  const hex = bytes.toString("hex").toLowerCase();
  if (/^0+$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function resolveAuthenticatorLabel(params: {
  aaguid: string | null;
  platform?: string | null;
  backedUp: boolean;
}): string {
  if (params.aaguid && KNOWN_AAGUID_LABELS[params.aaguid]) {
    return KNOWN_AAGUID_LABELS[params.aaguid];
  }
  const plat = (params.platform || "").toLowerCase();
  if (plat.includes("windows")) return "Windows Hello";
  if (plat.includes("ios") || plat.includes("ipad") || plat.includes("mac")) {
    return params.backedUp ? "iCloud Keychain" : "Apple Touch ID / Face ID";
  }
  if (plat.includes("android")) {
    return params.backedUp ? "Google Password Manager" : "Android Biometrics";
  }
  return params.backedUp ? "Synced Passkey" : "Hardware Passkey";
}

export function parseAuthenticatorData(
  authDataBuf: Buffer
): ParsedAuthenticatorData | null {
  if (!Buffer.isBuffer(authDataBuf) || authDataBuf.length < 37) {
    return null;
  }

  const rpIdHash = authDataBuf.subarray(0, 32);
  const flags = authDataBuf[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const backupEligible = (flags & 0x08) !== 0;
  const backedUp = (flags & 0x10) !== 0;
  const attestedCredentialDataIncluded = (flags & 0x40) !== 0;
  const counter = authDataBuf.readUInt32BE(33);

  let aaguid: string | null = null;
  let attestedCredentialId: string | null = null;
  if (attestedCredentialDataIncluded && authDataBuf.length >= 55) {
    aaguid = formatAaguid(authDataBuf.subarray(37, 53));
    const credIdLen = authDataBuf.readUInt16BE(53);
    if (credIdLen > 0 && authDataBuf.length >= 55 + credIdLen) {
      attestedCredentialId = authDataBuf
        .subarray(55, 55 + credIdLen)
        .toString("base64url");
    }
  }

  return {
    rpIdHash,
    userPresent,
    userVerified,
    backupEligible,
    backedUp,
    attestedCredentialDataIncluded,
    counter,
    aaguid,
    attestedCredentialId,
  };
}

function parseAndVerifyClientData(params: {
  clientDataJSONBase64Url: string;
  expectedType: "webauthn.create" | "webauthn.get";
  expectedPurpose: "register" | "auth";
  expectedRpId: string;
  expectedOrigin: string;
}):
  | {
      ok: true;
      clientDataBuf: Buffer;
      challengePayload: PasskeyChallengePayload;
    }
  | { ok: false; error: string } {
  let clientDataBuf: Buffer;
  let parsed: { type?: string; challenge?: string; origin?: string };
  try {
    clientDataBuf = Buffer.from(params.clientDataJSONBase64Url, "base64url");
    parsed = JSON.parse(clientDataBuf.toString("utf-8")) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
  } catch {
    return { ok: false, error: "Malformed WebAuthn clientDataJSON." };
  }

  if (parsed.type !== params.expectedType) {
    return { ok: false, error: "Unexpected WebAuthn ceremony type." };
  }

  if (parsed.origin !== params.expectedOrigin) {
    return {
      ok: false,
      error: `WebAuthn origin mismatch (${parsed.origin || "unknown"}).`,
    };
  }

  if (typeof parsed.challenge !== "string" || !parsed.challenge) {
    return { ok: false, error: "Missing WebAuthn challenge in clientDataJSON." };
  }

  let challengeToken: string;
  try {
    challengeToken = Buffer.from(parsed.challenge, "base64url").toString(
      "utf-8"
    );
  } catch {
    return { ok: false, error: "Invalid WebAuthn challenge encoding." };
  }

  const challengePayload = verifyPasskeyChallengeToken(challengeToken, {
    purpose: params.expectedPurpose,
    rpId: params.expectedRpId,
    origin: params.expectedOrigin,
  });
  if (!challengePayload) {
    return {
      ok: false,
      error: "Passkey challenge expired or invalid. Please try again.",
    };
  }

  return { ok: true, clientDataBuf, challengePayload };
}

export function verifyPasskeyRegistration(params: {
  credentialId: string;
  clientDataJSONBase64Url: string;
  authenticatorDataBase64Url: string;
  publicKeySpkiBase64Url: string;
  algorithm?: number;
  transports?: string[];
  expectedRpId: string;
  expectedOrigin: string;
  platformHint?: string | null;
}):
  | {
      ok: true;
      credentialId: string;
      publicKeySpki: string;
      algorithm: number;
      counter: number;
      transports: string[];
      aaguid: string | null;
      authenticatorLabel: string;
      backedUp: boolean;
      rpId: string;
      challengePayload: PasskeyChallengePayload;
    }
  | { ok: false; error: string } {
  const credentialId = params.credentialId.trim();
  if (!credentialId || credentialId.length > 512) {
    return { ok: false, error: "Invalid passkey credential ID." };
  }

  const clientCheck = parseAndVerifyClientData({
    clientDataJSONBase64Url: params.clientDataJSONBase64Url,
    expectedType: "webauthn.create",
    expectedPurpose: "register",
    expectedRpId: params.expectedRpId,
    expectedOrigin: params.expectedOrigin,
  });
  if (!clientCheck.ok) return clientCheck;

  let authDataBuf: Buffer;
  try {
    authDataBuf = Buffer.from(params.authenticatorDataBase64Url, "base64url");
  } catch {
    return { ok: false, error: "Malformed authenticatorData buffer." };
  }

  const authData = parseAuthenticatorData(authDataBuf);
  if (!authData) {
    return { ok: false, error: "Invalid WebAuthn authenticatorData structure." };
  }

  const expectedRpIdHash = crypto
    .createHash("sha256")
    .update(params.expectedRpId.toLowerCase())
    .digest();
  if (!crypto.timingSafeEqual(authData.rpIdHash, expectedRpIdHash)) {
    return { ok: false, error: "Passkey RP ID hash does not match this domain." };
  }

  if (!authData.userPresent || !authData.userVerified) {
    return {
      ok: false,
      error:
        "Authenticator user presence (UP) and biometric/PIN verification (UV) are required to link an admin passkey.",
    };
  }

  if (
    !authData.attestedCredentialDataIncluded ||
    !authData.attestedCredentialId ||
    !constantTimeHashEqual(authData.attestedCredentialId, credentialId)
  ) {
    return {
      ok: false,
      error:
        "Attested credential ID in authenticatorData does not match registered credential.",
    };
  }

  const algorithm =
    typeof params.algorithm === "number" ? params.algorithm : -7;
  if (!SUPPORTED_COSE_ALGORITHMS.has(algorithm)) {
    return {
      ok: false,
      error: `Unsupported WebAuthn public key algorithm (${algorithm}).`,
    };
  }

  // Validate SPKI DER public key using Node crypto
  let spkiBuffer: Buffer;
  try {
    spkiBuffer = Buffer.from(params.publicKeySpkiBase64Url, "base64url");
    const pubKey = crypto.createPublicKey({
      key: spkiBuffer,
      format: "der",
      type: "spki",
    });
    if (
      (algorithm === -7 && pubKey.asymmetricKeyType !== "ec") ||
      (algorithm === -257 && pubKey.asymmetricKeyType !== "rsa")
    ) {
      return {
        ok: false,
        error: "Passkey public key type does not match declared COSE algorithm.",
      };
    }
  } catch {
    return {
      ok: false,
      error: "Invalid or unsupported passkey public key format.",
    };
  }

  const transports = Array.isArray(params.transports)
    ? params.transports
        .filter((t): t is string => typeof t === "string" && t.length <= 32)
        .slice(0, 6)
    : [];

  return {
    ok: true,
    credentialId,
    publicKeySpki: spkiBuffer.toString("base64"),
    algorithm,
    counter: authData.counter,
    transports,
    aaguid: authData.aaguid,
    authenticatorLabel: resolveAuthenticatorLabel({
      aaguid: authData.aaguid,
      platform: params.platformHint,
      backedUp: authData.backedUp,
    }),
    backedUp: authData.backedUp,
    rpId: params.expectedRpId.toLowerCase(),
    challengePayload: clientCheck.challengePayload,
  };
}

export function verifyPasskeyAssertion(params: {
  clientDataJSONBase64Url: string;
  authenticatorDataBase64Url: string;
  signatureBase64Url: string;
  storedPublicKeySpkiBase64: string;
  storedCounter: number;
  expectedRpId: string;
  expectedOrigin: string;
}):
  | {
      ok: true;
      newCounter: number;
      backedUp: boolean;
      challengePayload: PasskeyChallengePayload;
    }
  | { ok: false; error: string } {
  const clientCheck = parseAndVerifyClientData({
    clientDataJSONBase64Url: params.clientDataJSONBase64Url,
    expectedType: "webauthn.get",
    expectedPurpose: "auth",
    expectedRpId: params.expectedRpId,
    expectedOrigin: params.expectedOrigin,
  });
  if (!clientCheck.ok) return clientCheck;

  let authDataBuf: Buffer;
  let sigBuf: Buffer;
  try {
    authDataBuf = Buffer.from(params.authenticatorDataBase64Url, "base64url");
    sigBuf = Buffer.from(params.signatureBase64Url, "base64url");
  } catch {
    return { ok: false, error: "Malformed passkey assertion buffers." };
  }

  const authData = parseAuthenticatorData(authDataBuf);
  if (!authData) {
    return { ok: false, error: "Invalid WebAuthn authenticatorData." };
  }

  const expectedRpIdHash = crypto
    .createHash("sha256")
    .update(params.expectedRpId.toLowerCase())
    .digest();
  if (!crypto.timingSafeEqual(authData.rpIdHash, expectedRpIdHash)) {
    return { ok: false, error: "Passkey RP ID hash mismatch." };
  }

  if (!authData.userPresent || !authData.userVerified) {
    return {
      ok: false,
      error:
        "Authenticator user presence (UP) and biometric/PIN verification (UV) are required.",
    };
  }

  const clientDataHash = crypto
    .createHash("sha256")
    .update(clientCheck.clientDataBuf)
    .digest();
  const signedData = Buffer.concat([authDataBuf, clientDataHash]);

  let signatureValid = false;
  try {
    const keyObject = crypto.createPublicKey({
      key: Buffer.from(params.storedPublicKeySpkiBase64, "base64"),
      format: "der",
      type: "spki",
    });

    // Standard WebAuthn ECDSA / RSA signatures are ASN.1 DER / PKCS#1 v1.5
    signatureValid = crypto.verify("sha256", signedData, keyObject, sigBuf);
    if (!signatureValid && sigBuf.length === 64) {
      // Fallback for IEEE P1363 raw 64-byte P-256 signatures
      signatureValid = crypto.verify(
        "sha256",
        signedData,
        { key: keyObject, dsaEncoding: "ieee-p1363" },
        sigBuf
      );
    }
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return { ok: false, error: "Passkey cryptographic signature invalid." };
  }

  if (
    (params.storedCounter > 0 || authData.counter > 0) &&
    authData.counter <= params.storedCounter
  ) {
    return {
      ok: false,
      error:
        "Passkey signature counter replay detected. Re-link this passkey if your authenticator was restored.",
    };
  }

  return {
    ok: true,
    newCounter: authData.counter,
    backedUp: authData.backedUp,
    challengePayload: clientCheck.challengePayload,
  };
}
