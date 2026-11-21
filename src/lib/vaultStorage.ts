import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getLocalVaultStorageDir } from "@/lib/vaultDb";

export const MAX_VAULT_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ValidatedVaultUpload {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

/**
 * Validates magic bytes for allowed personal document formats.
 */
export function validateVaultFileHeader(
  buffer: Buffer,
  reportedMime: string,
  originalName: string
): { valid: boolean; detectedMime: string; extension: string; error?: string } {
  if (buffer.length < 4) {
    return {
      valid: false,
      detectedMime: "",
      extension: "",
      error: "File is too small or empty.",
    };
  }

  // 1. PDF — %PDF (0x25 0x50 0x44 0x46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { valid: true, detectedMime: "application/pdf", extension: "pdf" };
  }

  // 2. PNG — 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMime: "image/png", extension: "png" };
  }

  // 3. JPEG — FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg", extension: "jpg" };
  }

  // 4. WEBP — RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { valid: true, detectedMime: "image/webp", extension: "webp" };
  }

  // 5. ZIP / DOCX — PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    const isDocx =
      reportedMime.includes("wordprocessingml") ||
      originalName.toLowerCase().endsWith(".docx");
    return {
      valid: true,
      detectedMime: isDocx
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/zip",
      extension: isDocx ? "docx" : "zip",
    };
  }

  // 6. Plain text / Markdown (ASCII / UTF-8)
  if (
    reportedMime.startsWith("text/") ||
    originalName.toLowerCase().endsWith(".txt") ||
    originalName.toLowerCase().endsWith(".md")
  ) {
    // Check first 512 bytes for binary null bytes
    const sample = buffer.subarray(0, Math.min(512, buffer.length));
    const hasNullByte = sample.includes(0x00);
    if (!hasNullByte) {
      return {
        valid: true,
        detectedMime: "text/plain",
        extension: originalName.toLowerCase().endsWith(".md") ? "md" : "txt",
      };
    }
  }

  return {
    valid: false,
    detectedMime: "",
    extension: "",
    error:
      "Unsupported file format. Upload PDF, PNG, JPEG, WEBP, DOCX, ZIP, or TXT documents.",
  };
}

/**
 * Stores a vault file securely in private storage (filesystem or private Supabase bucket)
 * and returns the internal storage key.
 */
export async function writeVaultFile(
  docId: string,
  buffer: Buffer,
  extension: string
): Promise<string> {
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const storageKey = `${docId}.${safeExt}`;
  const dir = getLocalVaultStorageDir();
  await fs.mkdir(dir, { recursive: true });

  const targetPath = path.join(dir, storageKey);
  const tempPath = `${targetPath}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;

  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, targetPath);

  return storageKey;
}

/**
 * Reads a vault file from private storage.
 */
export async function readVaultFile(storageKey: string): Promise<Buffer | null> {
  const sanitized = path.basename(storageKey);
  const targetPath = path.join(getLocalVaultStorageDir(), sanitized);

  try {
    return await fs.readFile(targetPath);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Deletes a vault file from private storage.
 */
export async function deleteVaultFile(storageKey: string): Promise<boolean> {
  const sanitized = path.basename(storageKey);
  const targetPath = path.join(getLocalVaultStorageDir(), sanitized);

  try {
    await fs.unlink(targetPath);
    return true;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return false;
    }
    throw err;
  }
}
