import { ImageAspectPreset, ImageTransform } from "@/types/portfolio";

export type ImageEditorShape = "circle" | "squircle" | "landscape";

export function defaultFitForShape(
  shape: ImageEditorShape
): "cover" | "contain" {
  return shape === "squircle" ? "contain" : "cover";
}

export function defaultAspectForShape(
  shape: ImageEditorShape
): ImageAspectPreset {
  if (shape === "circle") return "1:1";
  if (shape === "landscape") return "16:9";
  return "original";
}

export function createDefaultImageTransform(
  shape: ImageEditorShape = "squircle"
): ImageTransform {
  return {
    zoom: 1,
    offsetXPercent: 0,
    offsetYPercent: 0,
    rotation: 0,
    fit: defaultFitForShape(shape),
    aspect: defaultAspectForShape(shape),
    clipCircle: shape === "circle",
  };
}

const VALID_ASPECTS = new Set<ImageAspectPreset>([
  "1:1",
  "3:4",
  "4:3",
  "16:9",
  "original",
]);

export function sanitizeImageTransform(
  raw: Partial<ImageTransform> | null | undefined,
  defaultShape: ImageEditorShape = "squircle"
): ImageTransform {
  const fallback = createDefaultImageTransform(defaultShape);
  if (!raw || typeof raw !== "object") return fallback;

  const zoom =
    typeof raw.zoom === "number" && Number.isFinite(raw.zoom)
      ? Number(Math.min(3, Math.max(0.4, raw.zoom)).toFixed(2))
      : fallback.zoom;

  const offsetXPercent =
    typeof raw.offsetXPercent === "number" &&
    Number.isFinite(raw.offsetXPercent)
      ? Number(Math.min(120, Math.max(-120, raw.offsetXPercent)).toFixed(2))
      : 0;

  const offsetYPercent =
    typeof raw.offsetYPercent === "number" &&
    Number.isFinite(raw.offsetYPercent)
      ? Number(Math.min(120, Math.max(-120, raw.offsetYPercent)).toFixed(2))
      : 0;

  const rawRot =
    typeof raw.rotation === "number" && Number.isFinite(raw.rotation)
      ? Math.round(raw.rotation / 90) * 90
      : 0;
  const rotation = ((rawRot % 360) + 360) % 360;

  const fit =
    raw.fit === "cover" || raw.fit === "contain" ? raw.fit : fallback.fit;

  const aspect =
    raw.aspect && VALID_ASPECTS.has(raw.aspect) ? raw.aspect : fallback.aspect;

  const clipCircle =
    typeof raw.clipCircle === "boolean"
      ? aspect === "1:1" && raw.clipCircle
      : fallback.clipCircle;

  return {
    zoom,
    offsetXPercent,
    offsetYPercent,
    rotation,
    fit,
    aspect,
    clipCircle,
  };
}

export function isIdentityImageTransform(
  transform: ImageTransform | null | undefined,
  defaultShape: ImageEditorShape = "squircle"
): boolean {
  if (!transform) return true;
  const def = createDefaultImageTransform(defaultShape);
  return (
    Math.abs(transform.zoom - def.zoom) < 0.001 &&
    Math.abs(transform.offsetXPercent) < 0.01 &&
    Math.abs(transform.offsetYPercent) < 0.01 &&
    ((transform.rotation % 360) + 360) % 360 === 0 &&
    transform.fit === def.fit &&
    transform.clipCircle === def.clipCircle
  );
}

export function computeImageStageMatrix({
  containerWidth,
  containerHeight,
  naturalWidth,
  naturalHeight,
  transform,
}: {
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  transform?: Partial<ImageTransform> | null;
}): {
  scale: number;
  translateX: number;
  translateY: number;
  rotationDeg: number;
} {
  const rotationDeg = ((transform?.rotation ?? 0) % 360 + 360) % 360;
  const effW = rotationDeg % 180 === 0 ? naturalWidth : naturalHeight;
  const effH = rotationDeg % 180 === 0 ? naturalHeight : naturalWidth;
  const fit = transform?.fit === "contain" ? "contain" : "cover";

  const baseScale =
    effW > 0 && effH > 0 && containerWidth > 0 && containerHeight > 0
      ? fit === "contain"
        ? Math.min(containerWidth / effW, containerHeight / effH)
        : Math.max(containerWidth / effW, containerHeight / effH)
      : 1;

  const zoom = transform?.zoom ?? 1;
  const scale = baseScale * zoom;
  const translateX = ((transform?.offsetXPercent ?? 0) / 100) * containerWidth;
  const translateY = ((transform?.offsetYPercent ?? 0) / 100) * containerHeight;

  return {
    scale,
    translateX,
    translateY,
    rotationDeg,
  };
}

