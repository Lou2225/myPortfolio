import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpToken,
} from "@/lib/totp";
import { verifyUploadMagicBytes } from "@/lib/uploadSecurity";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32ForTest(secret: string): Buffer {
  const clean = secret.replace(/[\s=-]+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid Base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function computeRfc6238Code(base32Secret: string, nowMs: number): string {
  const key = decodeBase32ForTest(base32Secret);
  const step = Math.floor(nowMs / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const hmac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

describe("TOTP & AES-256-GCM Secret Storage", () => {
  it("encrypts and decrypts secrets and rejects wrong keys or tampered payloads", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    const sessionSecret = "super-strong-session-secret-for-tests-2026";
    const encrypted = encryptTotpSecret(secret, sessionSecret);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(decryptTotpSecret(encrypted, sessionSecret)).toBe(secret);

    expect(decryptTotpSecret(encrypted, "wrong-session-secret")).toBeNull();

    const parts = encrypted.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3].slice(0, -2)}AA`;
    expect(decryptTotpSecret(tampered, sessionSecret)).toBeNull();
  });

  it("builds valid otpauth:// URIs and enforces drift window and replay protection", () => {
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const uri = buildOtpAuthUri({
      secret,
      accountName: "lou@example.com",
      issuer: "Lou Portfolio",
    });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");

    const nowMs = 1_700_000_010_000;
    const code = computeRfc6238Code(secret, nowMs);

    const first = verifyTotpToken({ secret, token: code, nowMs });
    expect(first.valid).toBe(true);
    expect(typeof first.matchedStep).toBe("number");

    // Replaying the same step or older step must be rejected.
    const replay = verifyTotpToken({
      secret,
      token: code,
      nowMs,
      lastStepUsed: first.matchedStep,
    });
    expect(replay.valid).toBe(false);
    expect(replay.replayed).toBe(true);

    // Adjacent 30s drift window is accepted when not yet consumed.
    const nextWindowCode = computeRfc6238Code(secret, nowMs + 30_000);
    const driftOk = verifyTotpToken({
      secret,
      token: nextWindowCode,
      nowMs,
      lastStepUsed: first.matchedStep,
    });
    expect(driftOk.valid).toBe(true);

    // Code 2 minutes away is outside +-1 step window.
    const farCode = computeRfc6238Code(secret, nowMs + 120_000);
    const tooFar = verifyTotpToken({ secret, token: farCode, nowMs });
    expect(tooFar.valid).toBe(false);
  });
});

describe("Upload Magic-Byte Verification", () => {
  it("accepts valid PNG, JPEG, PDF, WebP, AVIF, and ICO headers", () => {
    expect(
      verifyUploadMagicBytes(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
        ".png"
      ).valid
    ).toBe(true);

    expect(
      verifyUploadMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), ".jpg")
        .valid
    ).toBe(true);

    expect(
      verifyUploadMagicBytes(Buffer.from("%PDF-1.7\n1 0 obj", "ascii"), ".pdf")
        .valid
    ).toBe(true);

    const webpBuf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(verifyUploadMagicBytes(webpBuf, ".webp").valid).toBe(true);

    const avifBuf = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x1c]),
      Buffer.from("ftypavif", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
    ]);
    expect(verifyUploadMagicBytes(avifBuf, ".avif").valid).toBe(true);

    expect(
      verifyUploadMagicBytes(Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01]), ".ico")
        .valid
    ).toBe(true);
  });

  it("rejects SVGs, scripts, executables, and mismatched magic bytes", () => {
    expect(
      verifyUploadMagicBytes(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script /></svg>'),
        ".svg"
      ).valid
    ).toBe(false);

    expect(
      verifyUploadMagicBytes(Buffer.from("MZ\x90\x00\x03\x00\x00\x00"), ".png")
        .valid
    ).toBe(false);

    expect(
      verifyUploadMagicBytes(
        Buffer.from("%PDF-1.7\nspoofed-pdf", "ascii"),
        ".jpg"
      ).valid
    ).toBe(false);
  });
});
