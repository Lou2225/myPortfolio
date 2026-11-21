export interface MagicByteCheckResult {
  valid: boolean;
  error?: string;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

/**
 * Validates binary magic signatures so renamed executables or scripts cannot pass extension checks.
 */
export function verifyUploadMagicBytes(
  buffer: Buffer,
  ext: string
): MagicByteCheckResult {
  const lowerExt = ext.toLowerCase();

  if (lowerExt === ".pdf") {
    if (buffer.length < 5 || !buffer.subarray(0, 5).equals(PDF_MAGIC)) {
      return { valid: false, error: "File header does not match a valid PDF document." };
    }
    return { valid: true };
  }

  if (lowerExt === ".png") {
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
      return { valid: false, error: "File header does not match a valid PNG image." };
    }
    return { valid: true };
  }

  if (lowerExt === ".jpg" || lowerExt === ".jpeg") {
    if (
      buffer.length < 3 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[2] !== 0xff
    ) {
      return { valid: false, error: "File header does not match a valid JPEG image." };
    }
    return { valid: true };
  }

  if (lowerExt === ".webp") {
    const riff = buffer.length >= 12 ? buffer.subarray(0, 4).toString("ascii") : "";
    const webp = buffer.length >= 12 ? buffer.subarray(8, 12).toString("ascii") : "";
    if (riff !== "RIFF" || webp !== "WEBP") {
      return { valid: false, error: "File header does not match a valid WebP image." };
    }
    return { valid: true };
  }

  if (lowerExt === ".avif") {
    if (buffer.length < 12 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
      return { valid: false, error: "File header does not match a valid AVIF container." };
    }
    const brandSlice = buffer.subarray(8, Math.min(buffer.length, 32)).toString("ascii");
    if (!/(avif|avis|mif1|msf1)/.test(brandSlice)) {
      return { valid: false, error: "Unsupported AVIF brand header." };
    }
    return { valid: true };
  }

  if (lowerExt === ".ico") {
    if (buffer.length < 4) {
      return { valid: false, error: "Invalid ICO file header." };
    }
    const reservedOk = buffer[0] === 0x00 && buffer[1] === 0x00;
    const typeOk =
      (buffer[2] === 0x01 || buffer[2] === 0x02) && buffer[3] === 0x00;
    if (!reservedOk || !typeOk) {
      return { valid: false, error: "File header does not match a valid ICO icon." };
    }
    if (buffer.length >= 6) {
      const entryCount = buffer.readUInt16LE(4);
      if (entryCount < 1) {
        return { valid: false, error: "ICO file contains no image entries." };
      }
    }
    return { valid: true };
  }

  if (lowerExt === ".cur") {
    if (buffer.length < 4) {
      return { valid: false, error: "Invalid CUR cursor file header." };
    }
    const reservedOk = buffer[0] === 0x00 && buffer[1] === 0x00;
    const typeOk = buffer[2] === 0x02 && buffer[3] === 0x00;
    if (!reservedOk || !typeOk) {
      return { valid: false, error: "File header does not match a valid Windows .cur cursor." };
    }
    if (buffer.length >= 6) {
      const entryCount = buffer.readUInt16LE(4);
      if (entryCount < 1) {
        return { valid: false, error: "CUR file contains no cursor entries." };
      }
    }
    return { valid: true };
  }

  if (lowerExt === ".mp3") {
    const hasId3AtStart =
      buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3";
    const hasMpegSyncAtStart =
      buffer.length >= 2 &&
      buffer[0] === 0xff &&
      (buffer[1] & 0xe0) === 0xe0;
    if (!hasId3AtStart && !hasMpegSyncAtStart) {
      return { valid: false, error: "File header does not match a valid MP3 audio clip." };
    }
    return { valid: true };
  }

  if (lowerExt === ".wav") {
    const riff = buffer.length >= 12 ? buffer.subarray(0, 4).toString("ascii") : "";
    const wave = buffer.length >= 12 ? buffer.subarray(8, 12).toString("ascii") : "";
    if (riff !== "RIFF" || wave !== "WAVE") {
      return { valid: false, error: "File header does not match a valid WAV audio clip." };
    }
    return { valid: true };
  }

  if (lowerExt === ".ogg") {
    const ogg = buffer.length >= 4 ? buffer.subarray(0, 4).toString("ascii") : "";
    if (ogg !== "OggS") {
      return { valid: false, error: "File header does not match a valid Ogg audio clip." };
    }
    return { valid: true };
  }

  return {
    valid: false,
    error: "Unsupported file format for upload.",
  };
}
