import { calculateAge, parseIsoDate } from "@/lib/date";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export const IMAGE_FILE_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.avif,.ico,image/png,image/jpeg,image/webp,image/avif,image/x-icon,image/vnd.microsoft.icon";
export const CURSOR_FILE_ACCEPT =
  ".png,.webp,.ico,.cur,.jpg,.jpeg,.avif,image/png,image/webp,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/avif";
export const AUDIO_FILE_ACCEPT =
  ".mp3,.wav,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/ogg";
export const PDF_FILE_ACCEPT = ".pdf,application/pdf";

export const ALLOWED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".ico",
] as const;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/avif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
] as const;

export const ALLOWED_CURSOR_EXTENSIONS = [
  ".png",
  ".webp",
  ".ico",
  ".cur",
] as const;

export const ALLOWED_CURSOR_MIME_TYPES = [
  "image/png",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "application/octet-stream",
] as const;

export const ALLOWED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg"] as const;

export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "application/ogg",
] as const;

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_CURSOR_UPLOAD_BYTES = 512 * 1024; // 512 KB
export const MAX_AUDIO_UPLOAD_BYTES = 2.5 * 1024 * 1024; // 2.5 MB
export const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export function validateImageFile(file: File): ValidationResult {
  const name = file.name.toLowerCase();
  const hasValidExt = ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
  const mime = (file.type || "").toLowerCase();
  const hasValidMime =
    mime === ""
      ? hasValidExt
      : (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);

  if (!hasValidExt || !hasValidMime) {
    return {
      valid: false,
      error: "Only raster image files (.png, .jpg, .webp, .avif, .ico) are permitted.",
    };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Selected image file is empty." };
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return {
      valid: false,
      error: "Image file size cannot exceed 5 MB.",
    };
  }

  return { valid: true };
}

export function validatePdfFile(file: File): ValidationResult {
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();
  const hasValidExt = name.endsWith(".pdf");
  const hasValidMime = mime === "" ? hasValidExt : mime === "application/pdf";

  if (!hasValidExt || !hasValidMime) {
    return {
      valid: false,
      error: "Only PDF (.pdf) documents are permitted for Resume/CV.",
    };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Selected PDF file is empty." };
  }

  if (file.size > MAX_PDF_UPLOAD_BYTES) {
    return {
      valid: false,
      error: "PDF file size cannot exceed 10 MB.",
    };
  }

  return { valid: true };
}

/**
 * Validates cursor asset uploads in the browser before canvas resize or upload.
 * Accepts direct cursor formats (.png, .webp, .ico, .cur) plus JPEG/AVIF sources
 * that are converted cleanly into transparent PNG cursor assets on the client.
 */
export function validateCursorFile(file: File): ValidationResult {
  const name = file.name.toLowerCase();
  const isSourceImage = ALLOWED_IMAGE_EXTENSIONS.some((ext) =>
    name.endsWith(ext)
  );
  const isNativeCur = name.endsWith(".cur");
  const mime = (file.type || "").toLowerCase();

  const validMime = isNativeCur
    ? mime === "" ||
      mime === "image/x-icon" ||
      mime === "image/vnd.microsoft.icon" ||
      mime === "application/octet-stream"
    : mime === ""
      ? isSourceImage
      : (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);

  if ((!isSourceImage && !isNativeCur) || !validMime) {
    return {
      valid: false,
      error: "Only cursor files (.png, .cur, .webp, .ico, .jpg, .avif) are permitted.",
    };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Selected cursor file is empty." };
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return {
      valid: false,
      error: "Source cursor file size cannot exceed 5 MB.",
    };
  }

  return { valid: true };
}

export function validateAudioFile(file: File): ValidationResult {
  const name = file.name.toLowerCase();
  const hasValidExt = ALLOWED_AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
  const mime = (file.type || "").toLowerCase();
  const hasValidMime =
    mime === ""
      ? hasValidExt
      : (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mime);

  if (!hasValidExt || !hasValidMime) {
    return {
      valid: false,
      error: "Only short audio files (.mp3, .wav, .ogg) are permitted.",
    };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Selected audio file is empty." };
  }

  if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
    return {
      valid: false,
      error: "Audio clip size cannot exceed 2.5 MB.",
    };
  }

  return { valid: true };
}

const UNSAFE_CSS_URL_CHARS = /["'()\\;<>\s\r\n]/;

/**
 * Sanitizes cursor asset URLs so CSS `cursor: url("...")` cannot be escaped or
 * injected with arbitrary styles, data URLs, or scripts.
 */
export function sanitizeCursorAssetUrl(raw?: string | null): string {
  const trimmed = (raw || "").trim();
  if (!trimmed || UNSAFE_CSS_URL_CHARS.test(trimmed)) {
    return "";
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && trimmed.length >= 2) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return "";
  }
  return "";
}

export function validateCursorAssetUrl(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true };
  }
  if (!sanitizeCursorAssetUrl(trimmed)) {
    return {
      valid: false,
      error:
        "Use an uploaded /uploads/ path, /assets/ path, or safe https:// URL without spaces or quotes.",
    };
  }
  return { valid: true };
}

/**
 * Real-time Input Sanitizers
 * Prevent invalid characters from ever entering the input state.
 */

export function sanitizeNameInput(
  raw: string,
  options?: { allowNumbers?: boolean; maxLength?: number }
): string {
  const maxLen = options?.maxLength ?? 80;
  // Strip control characters; allow letters (including accented), spaces, hyphens, apostrophes, periods, and optionally numbers/&/·
  const pattern = options?.allowNumbers
    ? /[^\p{L}\p{N}\s.'\-&/()·]/gu
    : /[^\p{L}\s.'\-]/gu;

  return raw
    .replace(pattern, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "")
    .slice(0, maxLen);
}

export function sanitizeEmailInput(raw: string, maxLength = 120): string {
  // Emails never contain spaces or angle brackets
  return raw
    .replace(/\s+/g, "")
    .replace(/[<>()[\]\\,;:"']/g, "")
    .toLowerCase()
    .slice(0, maxLength);
}

export function sanitizeUrlInput(raw: string, maxLength = 300): string {
  return raw.replace(/\s+/g, "").slice(0, maxLength);
}

export function sanitizeNumericInput(
  raw: string,
  options?: { allowDecimals?: boolean; allowNegative?: boolean; maxLength?: number }
): string {
  const maxLen = options?.maxLength ?? 16;
  let cleaned = raw;
  if (options?.allowDecimals) {
    cleaned = cleaned.replace(/[^0-9.-]/g, "");
    // Keep only first decimal point
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = `${parts[0]}.${parts.slice(1).join("")}`;
    }
  } else {
    cleaned = cleaned.replace(/[^0-9-]/g, "");
  }

  if (!options?.allowNegative) {
    cleaned = cleaned.replace(/-/g, "");
  } else {
    cleaned = cleaned.replace(/(?!^)-/g, "");
  }

  return cleaned.slice(0, maxLen);
}

export function sanitizeTextInput(
  raw: string,
  options?: { maxLength?: number; multiline?: boolean }
): string {
  const maxLen = options?.maxLength ?? 2000;
  let cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  if (!options?.multiline) {
    cleaned = cleaned.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ");
  } else {
    // Collapse more than 3 consecutive newlines into 2
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  }

  return cleaned.replace(/^\s+/, "").slice(0, maxLen);
}

export function sanitizePasswordInput(
  raw: string,
  options?: { allowSpaces?: boolean; maxLength?: number }
): string {
  const maxLen = options?.maxLength ?? 128;
  // Strip control characters and invisible formatting characters
  let cleaned = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  if (!options?.allowSpaces) {
    cleaned = cleaned.replace(/\s+/g, "");
  }
  return cleaned.slice(0, maxLen);
}

/**
 * Strict Field Validators
 * Provide deterministic, human-friendly feedback.
 */

export function validateName(
  value: string,
  options?: {
    label?: string;
    minLength?: number;
    maxLength?: number;
    required?: boolean;
    allowNumbers?: boolean;
  }
): ValidationResult {
  const label = options?.label ?? "Name";
  const minLen = options?.minLength ?? 2;
  const maxLen = options?.maxLength ?? 80;
  const required = options?.required ?? true;
  const trimmed = value.trim();

  if (!trimmed) {
    return required
      ? { valid: false, error: `${label} is required.` }
      : { valid: true };
  }

  if (trimmed.length < minLen) {
    return {
      valid: false,
      error: `${label} must be at least ${minLen} characters.`,
    };
  }

  if (trimmed.length > maxLen) {
    return {
      valid: false,
      error: `${label} cannot exceed ${maxLen} characters.`,
    };
  }

  const letterCount = (trimmed.match(/\p{L}/gu) || []).length;
  if (letterCount < 2) {
    return {
      valid: false,
      error: `${label} must contain at least 2 letters.`,
    };
  }

  if (!options?.allowNumbers && /\d/.test(trimmed)) {
    return {
      valid: false,
      error: `${label} cannot contain numbers.`,
    };
  }

  return { valid: true };
}

const STRICT_EMAIL_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,15}$/;

export function validateEmail(
  value: string,
  options?: { label?: string; required?: boolean }
): ValidationResult {
  const label = options?.label ?? "Email address";
  const required = options?.required ?? true;
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return required
      ? { valid: false, error: `${label} is required.` }
      : { valid: true };
  }

  if (trimmed.length > 254) {
    return {
      valid: false,
      error: `${label} cannot exceed 254 characters.`,
    };
  }

  if (trimmed.includes("..")) {
    return {
      valid: false,
      error: `${label} cannot contain consecutive dots (..).`,
    };
  }

  if (!STRICT_EMAIL_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `Please enter a valid email (e.g. name@company.com).`,
    };
  }

  return { valid: true };
}

export function validateSubject(
  value: string,
  options?: {
    label?: string;
    minLength?: number;
    maxLength?: number;
    required?: boolean;
  }
): ValidationResult {
  const label = options?.label ?? "Subject";
  const minLen = options?.minLength ?? 3;
  const maxLen = options?.maxLength ?? 120;
  const required = options?.required ?? true;
  const trimmed = value.trim();

  if (!trimmed) {
    return required
      ? { valid: false, error: `${label} is required.` }
      : { valid: true };
  }

  if (trimmed.length < minLen) {
    return {
      valid: false,
      error: `${label} must be at least ${minLen} characters.`,
    };
  }

  if (trimmed.length > maxLen) {
    return {
      valid: false,
      error: `${label} must be ${maxLen} characters or fewer.`,
    };
  }

  const alphaNumCount = (trimmed.match(/[\p{L}\p{N}]/gu) || []).length;
  if (alphaNumCount < 2) {
    return {
      valid: false,
      error: `${label} must include descriptive words.`,
    };
  }

  return { valid: true };
}

export function validateMessage(
  value: string,
  options?: {
    label?: string;
    minLength?: number;
    maxLength?: number;
    required?: boolean;
  }
): ValidationResult {
  const label = options?.label ?? "Message";
  const minLen = options?.minLength ?? 10;
  const maxLen = options?.maxLength ?? 2000;
  const required = options?.required ?? true;
  const trimmed = value.trim();

  if (!trimmed) {
    return required
      ? { valid: false, error: `${label} is required.` }
      : { valid: true };
  }

  if (trimmed.length < minLen) {
    return {
      valid: false,
      error: `${label} must be at least ${minLen} characters (${
        minLen - trimmed.length
      } more needed).`,
    };
  }

  if (trimmed.length > maxLen) {
    return {
      valid: false,
      error: `${label} cannot exceed ${maxLen} characters.`,
    };
  }

  const letterCount = (trimmed.match(/\p{L}/gu) || []).length;
  if (letterCount < 5) {
    return {
      valid: false,
      error: `Please provide a clear, descriptive ${label.toLowerCase()}.`,
    };
  }

  return { valid: true };
}

export function validateUrl(
  value: string,
  options?: {
    label?: string;
    required?: boolean;
    allowRelativePath?: boolean;
  }
): ValidationResult {
  const label = options?.label ?? "URL";
  const required = options?.required ?? false;
  const allowRelative = options?.allowRelativePath ?? true;
  const trimmed = value.trim();

  if (!trimmed) {
    return required
      ? { valid: false, error: `${label} is required.` }
      : { valid: true };
  }

  if (allowRelative && trimmed.startsWith("/")) {
    if (trimmed.startsWith("//") || trimmed.length < 2 || /\s/.test(trimmed)) {
      return {
        valid: false,
        error: `${label} path must be a valid relative path (e.g. /assets/...).`,
      };
    }
    return { valid: true };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        valid: false,
        error: `${label} must start with https:// or http://.`,
      };
    }
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: allowRelative
        ? `Enter a full URL (https://...) or a local path (/assets/...).`
        : `Enter a valid URL starting with https://.`,
    };
  }
}

export function validateNumber(
  value: number | string,
  options?: {
    label?: string;
    min?: number;
    max?: number;
    required?: boolean;
  }
): ValidationResult {
  const label = options?.label ?? "Value";
  const required = options?.required ?? true;
  const str = String(value).trim();

  if (!str) {
    return required
      ? { valid: false, error: `${label} is required.` }
      : { valid: true };
  }

  const num = Number(str);
  if (Number.isNaN(num)) {
    return { valid: false, error: `${label} must be a valid number.` };
  }

  if (options?.min !== undefined && num < options.min) {
    return {
      valid: false,
      error: `${label} must be at least ${options.min}.`,
    };
  }

  if (options?.max !== undefined && num > options.max) {
    return {
      valid: false,
      error: `${label} cannot exceed ${options.max}.`,
    };
  }

  return { valid: true };
}

export function validatePassword(
  value: string,
  options?: {
    label?: string;
    minLength?: number;
    maxLength?: number;
    required?: boolean;
    allowSpaces?: boolean;
  }
): ValidationResult {
  const label = options?.label ?? "Password";
  const minLen = options?.minLength ?? 6;
  const maxLen = options?.maxLength ?? 128;
  const required = options?.required ?? true;

  if (!value) {
    return required
      ? { valid: false, error: `${label} is required.` }
      : { valid: true };
  }

  if (!options?.allowSpaces && /\s/.test(value)) {
    return {
      valid: false,
      error: `${label} cannot contain spaces.`,
    };
  }

  if (value.length < minLen) {
    return {
      valid: false,
      error: `${label} must be at least ${minLen} characters (${
        minLen - value.length
      } more needed).`,
    };
  }

  if (value.length > maxLen) {
    return {
      valid: false,
      error: `${label} cannot exceed ${maxLen} characters.`,
    };
  }

  return { valid: true };
}

export interface PasswordStrengthReport {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Empty" | "Weak" | "Fair" | "Strong" | "Very Strong";
  checks: {
    minLength: boolean;
    hasUpperLower: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
    noSpaces: boolean;
  };
}

export function evaluatePasswordStrength(
  password: string
): PasswordStrengthReport {
  const checks = {
    minLength: password.length >= 8,
    hasUpperLower: /[a-z]/.test(password) && /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[^A-Za-z0-9\s]/.test(password),
    noSpaces: password.length > 0 && !/\s/.test(password),
  };

  if (!password) {
    return { score: 0, label: "Empty", checks };
  }

  let points = 0;
  if (checks.minLength) points += 1;
  if (checks.hasUpperLower) points += 1;
  if (checks.hasNumber) points += 1;
  if (checks.hasSymbol) points += 1;
  if (password.length >= 12) points += 1;

  if (!checks.minLength || !checks.noSpaces || points <= 1) {
    return { score: 1, label: "Weak", checks };
  }
  if (points === 2) {
    return { score: 2, label: "Fair", checks };
  }
  if (points === 3) {
    return { score: 3, label: "Strong", checks };
  }
  return { score: 4, label: "Very Strong", checks };
}

export function validateBirthDate(
  value: string,
  options?: {
    label?: string;
    minAge?: number;
    maxAge?: number;
    required?: boolean;
  }
): ValidationResult {
  const label = options?.label ?? "Birth Date";
  const minAge = options?.minAge ?? 15;
  const maxAge = options?.maxAge ?? 100;
  const required = options?.required ?? true;
  const trimmed = (value || "").trim();

  if (!trimmed) {
    return required
      ? { valid: false, error: `${label} is required.` }
      : { valid: true };
  }

  if (!parseIsoDate(trimmed)) {
    return {
      valid: false,
      error: `${label} must be a valid calendar date (YYYY-MM-DD).`,
    };
  }

  const age = calculateAge(trimmed);
  if (age === null) {
    return {
      valid: false,
      error: `${label} cannot be in the future.`,
    };
  }

  if (age < minAge) {
    return {
      valid: false,
      error: `Computed age (${age}) must be at least ${minAge} years.`,
    };
  }

  if (age > maxAge) {
    return {
      valid: false,
      error: `Computed age (${age}) cannot exceed ${maxAge} years.`,
    };
  }

  return { valid: true };
}
