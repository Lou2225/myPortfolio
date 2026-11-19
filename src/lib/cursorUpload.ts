import { validateCursorFile } from "@/lib/inputValidation";

export interface PreparedCursorUpload {
  file: File;
  sourceWidth?: number;
  detectedHotspot?: { x: number; y: number };
}

const MAX_RASTER_CURSOR_DIM = 128;

export function extractCurMetadata(buffer: ArrayBuffer): {
  width: number;
  height: number;
  hotspotX: number;
  hotspotY: number;
} | null {
  if (buffer.byteLength < 22) return null;
  const view = new DataView(buffer);
  const reserved = view.getUint16(0, true);
  const type = view.getUint16(2, true);
  const count = view.getUint16(4, true);

  if (reserved !== 0 || type !== 2 || count < 1) {
    return null;
  }

  const rawWidth = view.getUint8(6);
  const rawHeight = view.getUint8(7);
  const hotspotX = Math.max(0, Math.min(128, view.getUint16(10, true)));
  const hotspotY = Math.max(0, Math.min(128, view.getUint16(12, true)));

  return {
    width: rawWidth === 0 ? 256 : rawWidth,
    height: rawHeight === 0 ? 256 : rawHeight,
    hotspotX,
    hotspotY,
  };
}

function loadBrowserImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode cursor image."));
    img.src = url;
  });
}

/**
 * Prepares a single crisp master cursor file on initial upload without premature downscaling.
 * - Native `.cur` / `.ico` keep their binary bytes untouched (auto-extracting `.cur` hotspot).
 * - `.png` / `.webp` at `<= 128x128` keep their exact crisp pixels untouched.
 * - Oversized (> 128px) or `.jpg`/`.avif` sources are encoded once to a 128x128 transparent PNG
 *   so switching 32px/48px/64px/96px in CSS `image-set(...)` stays sharp with zero extra uploads.
 */
export async function prepareCursorMasterUpload(
  file: File
): Promise<PreparedCursorUpload> {
  const check = validateCursorFile(file);
  if (!check.valid) {
    throw new Error(check.error || "Invalid cursor file.");
  }

  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".cur")) {
    const buffer = await file.arrayBuffer();
    const meta = extractCurMetadata(buffer);
    if (!meta) {
      throw new Error("File does not have a valid Windows .cur cursor header.");
    }
    const typedFile = file.type
      ? file
      : new File([buffer], file.name, { type: "image/x-icon" });
    return {
      file: typedFile,
      sourceWidth: meta.width,
      detectedHotspot: { x: meta.hotspotX, y: meta.hotspotY },
    };
  }

  if (lowerName.endsWith(".ico")) {
    const typedFile = file.type
      ? file
      : new File([await file.arrayBuffer()], file.name, {
          type: "image/x-icon",
        });
    return { file: typedFile };
  }

  if (typeof document === "undefined" || typeof URL === "undefined") {
    return { file };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadBrowserImage(objectUrl);
    const srcW = Math.max(1, img.naturalWidth || MAX_RASTER_CURSOR_DIM);
    const srcH = Math.max(1, img.naturalHeight || MAX_RASTER_CURSOR_DIM);
    const maxSide = Math.max(srcW, srcH);

    // Keep native <= 128px PNG/WebP master pixels completely untouched
    if (
      (lowerName.endsWith(".png") || lowerName.endsWith(".webp")) &&
      maxSide <= MAX_RASTER_CURSOR_DIM
    ) {
      return { file, sourceWidth: maxSide };
    }

    const masterSize = Math.min(MAX_RASTER_CURSOR_DIM, maxSide);
    const scale = Math.min(masterSize / srcW, masterSize / srcH);
    const drawW = Math.max(1, Math.round(srcW * scale));
    const drawH = Math.max(1, Math.round(srcH * scale));
    const offsetX = Math.floor((masterSize - drawW) / 2);
    const offsetY = Math.floor((masterSize - drawH) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = masterSize;
    canvas.height = masterSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { file, sourceWidth: maxSide };
    }

    ctx.clearRect(0, 0, masterSize, masterSize);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) {
      return { file, sourceWidth: maxSide };
    }

    const cleanBase =
      file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-") ||
      "cursor";
    return {
      file: new File([blob], `${cleanBase}.png`, { type: "image/png" }),
      sourceWidth: masterSize,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
