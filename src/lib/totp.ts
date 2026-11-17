import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SEC = 30;
const TOTP_DIGITS = 6;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer | null {
  const clean = input.replace(/[\s=-]+/g, "").toUpperCase();
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) return null;

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function deriveTotpAesKey(sessionSecret: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(`lou-portfolio-totp-v1:${sessionSecret}`)
    .digest();
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function encryptTotpSecret(
  base32Secret: string,
  sessionSecret: string
): string {
  const key = deriveTotpAesKey(sessionSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(base32Secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptTotpSecret(
  encoded: string | null | undefined,
  sessionSecret: string
): string | null {
  if (!encoded) return null;
  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;

  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const key = deriveTotpAesKey(sessionSecret);
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function buildOtpAuthUri(options: {
  secret: string;
  accountName?: string;
  issuer?: string;
}): string {
  const issuer = (options.issuer || "Portfolio CMS").trim();
  const accountName = (options.accountName || "admin").trim();
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret: options.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function generateHotpAtStep(secretBuffer: Buffer, counterStep: number): string {
  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(counterStep / 0x100000000);
  const low = counterStep >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac("sha1", secretBuffer).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binaryCode % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Verifies a 6-digit RFC 6238 TOTP token with +-1 30s drift window and replay protection.
 */
export function verifyTotpToken(options: {
  secret: string;
  token: string;
  lastStepUsed?: number | null;
  window?: number;
  nowMs?: number;
}): { valid: boolean; matchedStep: number | null; replayed?: boolean } {
  const cleanCode = options.token.replace(/\D/g, "");
  if (cleanCode.length !== TOTP_DIGITS) {
    return { valid: false, matchedStep: null };
  }

  const secretBuffer = base32Decode(options.secret);
  if (!secretBuffer || secretBuffer.length < 10) {
    return { valid: false, matchedStep: null };
  }

  const currentStep = Math.floor((options.nowMs ?? Date.now()) / 1000 / TOTP_PERIOD_SEC);
  const drift = options.window ?? 1;
  const candidateBuf = Buffer.from(cleanCode, "utf8");

  for (let offset = -drift; offset <= drift; offset += 1) {
    const step = currentStep + offset;
    if (step < 0) continue;
    const expected = generateHotpAtStep(secretBuffer, step);
    const expectedBuf = Buffer.from(expected, "utf8");
    if (
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      if (
        typeof options.lastStepUsed === "number" &&
        step <= options.lastStepUsed
      ) {
        return { valid: false, matchedStep: step, replayed: true };
      }
      return { valid: true, matchedStep: step };
    }
  }

  return { valid: false, matchedStep: null };
}
