/**
 * Shared Resume PDF target resolver, HTTP byte-range parser, and in-memory
 * prewarm cache so hovering the Hero Resume CTA eliminates double fetches
 * while handing PDF.js a fresh non-detached copy on every open.
 */

export interface ResolvedResumeTargets {
  isGoogleDrive: boolean;
  /** Same-origin proxied PDF byte endpoint (or Drive preview for Google Drive URLs) */
  apiSrc: string;
  /** Native iframe fallback URL */
  iframeSrc: string;
  /** Direct attachment download URL */
  downloadHref: string;
  /** Direct inline open-in-new-tab URL */
  openTabHref: string;
}

export function resolveResumeTargets(rawUrl: string): ResolvedResumeTargets {
  const trimmed = (rawUrl || "").trim();
  const driveMatch =
    /^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i.exec(trimmed) ||
    /^https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i.exec(trimmed);

  if (driveMatch?.[1]) {
    const fileId = driveMatch[1];
    const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    return {
      isGoogleDrive: true,
      apiSrc: previewUrl,
      iframeSrc: previewUrl,
      downloadHref: `https://drive.google.com/uc?export=download&id=${fileId}`,
      openTabHref: `https://drive.google.com/file/d/${fileId}/view`,
    };
  }

  const versionTag = encodeURIComponent(trimmed);
  const apiSrc = `/api/resume?v=${versionTag}`;
  return {
    isGoogleDrive: false,
    apiSrc,
    iframeSrc: `${apiSrc}#toolbar=1&navpanes=0&view=FitH`,
    downloadHref: `/api/resume?download=1&v=${versionTag}`,
    openTabHref: apiSrc,
  };
}

export function buildSafeResumeFilename(fullName?: string): string {
  const slug = (fullName || "Portfolio")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "Portfolio"}-Resume.pdf`;
}

export interface ParsedByteRange {
  start: number;
  end: number;
}

/**
 * Parses a single-range RFC 7233 `Range: bytes=start-end` header against `totalLength`.
 * Returns `"none"` if no Range header was provided, `"invalid"` if unsatisfiable/malformed,
 * or `{ start, end }` (inclusive) when valid.
 */
export function parseByteRangeHeader(
  rangeHeader: string | null,
  totalLength: number
): ParsedByteRange | "none" | "invalid" {
  if (!rangeHeader || !rangeHeader.trim()) return "none";
  if (totalLength <= 0) return "invalid";

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return "invalid";

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return "invalid";

  if (!rawStart && rawEnd) {
    // Suffix byte range: last N bytes (e.g. bytes=-500)
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return "invalid";
    const start = Math.max(0, totalLength - suffixLength);
    return { start, end: totalLength - 1 };
  }

  const start = Number.parseInt(rawStart, 10);
  const end = rawEnd
    ? Math.min(totalLength - 1, Number.parseInt(rawEnd, 10))
    : totalLength - 1;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= totalLength ||
    end < start
  ) {
    return "invalid";
  }

  return { start, end };
}

const MAX_CACHED_RESUMES = 2;
const resumeBufferCache = new Map<string, Promise<ArrayBuffer>>();

function trimCache() {
  while (resumeBufferCache.size > MAX_CACHED_RESUMES) {
    const oldestKey = resumeBufferCache.keys().next().value;
    if (oldestKey !== undefined) {
      resumeBufferCache.delete(oldestKey);
    } else {
      break;
    }
  }
}

/**
 * Fetches `/api/resume?v=...` once and caches the raw `ArrayBuffer` in memory.
 * Callers receive a cloned `Uint8Array` so PDF.js worker buffer transfers never
 * detach the cached bytes across modal reopen cycles.
 */
export async function fetchResumePdfBytes(apiSrc: string): Promise<Uint8Array> {
  let pending = resumeBufferCache.get(apiSrc);
  if (!pending) {
    pending = fetch(apiSrc, { credentials: "same-origin" }).then(async (res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch resume PDF (HTTP ${res.status})`);
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 5) {
        throw new Error("Resume PDF response is empty or truncated");
      }
      return buf;
    });
    resumeBufferCache.set(apiSrc, pending);
    trimCache();
  }

  try {
    const buffer = await pending;
    return new Uint8Array(buffer.slice(0));
  } catch (err) {
    resumeBufferCache.delete(apiSrc);
    throw err;
  }
}

export function prewarmResumePdf(rawResumeUrl?: string): void {
  const trimmed = (rawResumeUrl || "").trim();
  if (!trimmed) return;
  const targets = resolveResumeTargets(trimmed);
  if (targets.isGoogleDrive) return;
  if (resumeBufferCache.has(targets.apiSrc)) return;
  void fetchResumePdfBytes(targets.apiSrc).catch(() => {
    // Silently ignore prewarm network errors; modal will retry on open
  });
}

export function clearResumePdfCache(): void {
  resumeBufferCache.clear();
}
