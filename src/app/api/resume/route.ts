import dns from "dns/promises";
import fs from "fs/promises";
import net from "net";
import path from "path";
import { NextResponse } from "next/server";
import { getPortfolioContent } from "@/lib/db";
import {
  checkMemoryRateLimit,
  createRateLimitResponse,
  extractNormalizedClientIp,
} from "@/lib/rateLimit";
import {
  buildSafeResumeFilename,
  parseByteRangeHeader,
} from "@/lib/resumeCache";

const RESUME_CSP =
  "default-src 'self'; object-src 'self'; frame-ancestors 'self'";

/** Hard upper bound (12 MB) matching the 10 MB PDF upload limit with headroom */
const MAX_RESUME_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECT_HOPS = 3;
const RESUME_MEMORY_CACHE_TTL_MS = 60_000;

let cachedResumeEntry: {
  url: string;
  bytes: Uint8Array;
  expiresAt: number;
} | null = null;

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 unspecified
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a >= 224) return true; // multicast & reserved
  return false;
}

function isPrivateOrReservedIp(rawIp: string): boolean {
  const stripped = rawIp.trim().replace(/^\[|\]$/g, "").toLowerCase();
  const ipVersion = net.isIP(stripped);
  if (ipVersion === 4) {
    return isPrivateOrReservedIpv4(stripped);
  }
  if (ipVersion === 6) {
    if (stripped === "::" || stripped === "::1") return true;
    // IPv4-mapped IPv6: ::ffff:127.0.0.1 or normalized hex ::ffff:7f00:1 / ::ffff:a9fe:a9fe
    const mappedV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(stripped);
    if (mappedV4) return isPrivateOrReservedIpv4(mappedV4[1]);
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(stripped);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateOrReservedIpv4(ipv4);
    }
    // Unique local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8)
    const firstHextet = parseInt(stripped.split(":")[0] || "0", 16);
    if ((firstHextet & 0xfe00) === 0xfc00) return true;
    if ((firstHextet & 0xffc0) === 0xfe80) return true;
    if ((firstHextet & 0xff00) === 0xff00) return true;
    return false;
  }
  return true;
}

function isAllowlistedRemoteHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower.endsWith(".supabase.co") || lower.endsWith(".supabase.in")) {
    return true;
  }
  const configuredSupabase = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (configuredSupabase) {
    try {
      if (new URL(configuredSupabase).hostname.toLowerCase() === lower) {
        return true;
      }
    } catch {
      // ignore invalid env URL
    }
  }
  const extraAllowlist = (process.env.RESUME_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (extraAllowlist.includes(lower)) {
    return true;
  }
  return false;
}

async function assertSafeRemoteUrl(candidate: URL): Promise<string | null> {
  if (candidate.protocol !== "https:") {
    return "Unsupported or unsafe resume URL protocol.";
  }
  if (candidate.username || candidate.password) {
    return "Resume URL must not include credentials.";
  }

  const hostname = candidate.hostname.toLowerCase();
  const cleanHost = hostname.replace(/^\[|\]$/g, "");

  if (
    cleanHost === "localhost" ||
    cleanHost.endsWith(".local") ||
    cleanHost.endsWith(".internal") ||
    net.isIP(cleanHost) !== 0
  ) {
    return "Unsupported or unsafe resume URL origin.";
  }

  if (!isAllowlistedRemoteHost(cleanHost)) {
    return "Resume host is not on the configured storage allowlist.";
  }

  // Resolve DNS before connecting to block DNS rebinding to private/loopback/metadata IPs
  try {
    const records = await dns.lookup(cleanHost, { all: true });
    if (records.length === 0) {
      return "Unable to resolve resume storage host.";
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return "Blocked resume host resolving to a private or reserved network.";
      }
    }
  } catch {
    return "Unable to resolve resume storage host.";
  }

  return null;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

async function readStreamWithLimit(
  response: Response,
  maxBytes: number
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; tooLarge: boolean }> {
  const declaredLen = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // ignore cancel errors
    }
    return { ok: false, tooLarge: true };
  }

  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      return { ok: false, tooLarge: true };
    }
    return { ok: true, bytes: buf };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: combined };
}

function buildPdfResponse(
  bytes: Uint8Array,
  filename: string,
  download: boolean,
  rangeHeader: string | null,
  headOnly: boolean,
  versioned: boolean
): NextResponse {
  const total = bytes.byteLength;
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    "Accept-Ranges": "bytes",
    "Content-Security-Policy": RESUME_CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Cache-Control": versioned
      ? "public, max-age=300, stale-while-revalidate=600"
      : "public, max-age=60, must-revalidate",
  };

  const parsedRange = parseByteRangeHeader(rangeHeader, total);
  if (parsedRange === "invalid") {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes */${total}`,
      },
    });
  }

  if (parsedRange !== "none") {
    const slice = bytes.subarray(parsedRange.start, parsedRange.end + 1);
    return new NextResponse(headOnly ? null : new Uint8Array(slice), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${parsedRange.start}-${parsedRange.end}/${total}`,
        "Content-Length": String(slice.byteLength),
      },
    });
  }

  return new NextResponse(headOnly ? null : new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(total),
    },
  });
}

async function resolveResumePdfBytes(
  resumeUrl: string
): Promise<{ bytes: Uint8Array } | { error: NextResponse }> {
  // 1. Local uploaded PDF stored under public/uploads/
  if (resumeUrl.startsWith("/uploads/")) {
    const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
    const rawRel = resumeUrl
      .replace(/^\/uploads\/+/, "")
      .split(/[?#]/)[0];
    let decodedRel: string;
    try {
      decodedRel = decodeURIComponent(rawRel);
    } catch {
      return {
        error: NextResponse.json(
          { error: "Invalid resume asset path encoding." },
          { status: 400 }
        ),
      };
    }

    const targetPath = path.resolve(uploadsRoot, decodedRel);

    if (
      !targetPath.startsWith(uploadsRoot + path.sep) ||
      !targetPath.toLowerCase().endsWith(".pdf")
    ) {
      return {
        error: NextResponse.json(
          { error: "Invalid resume asset path." },
          { status: 400 }
        ),
      };
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(targetPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        return {
          error: NextResponse.json(
            { error: "Configured resume PDF file was not found." },
            { status: 404 }
          ),
        };
      }
      throw err;
    }

    const bytes = new Uint8Array(fileBuffer);
    if (bytes.byteLength > MAX_RESUME_BYTES) {
      return {
        error: NextResponse.json(
          { error: "Configured resume PDF exceeds maximum allowed size." },
          { status: 413 }
        ),
      };
    }
    if (!hasPdfSignature(bytes)) {
      return {
        error: NextResponse.json(
          { error: "Configured resume file is not a valid PDF." },
          { status: 415 }
        ),
      };
    }

    return { bytes };
  }

  // Check short-lived in-memory cache for remote PDFs (avoids re-fetching 12 MB on every Range/HEAD)
  const now = Date.now();
  if (
    cachedResumeEntry &&
    cachedResumeEntry.url === resumeUrl &&
    cachedResumeEntry.expiresAt > now
  ) {
    return { bytes: cachedResumeEntry.bytes };
  }

  // 2. Remote HTTPS PDF (allowlisted CDN / Supabase Storage public asset)
  let currentUrl: URL;
  try {
    currentUrl = new URL(resumeUrl);
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid resume URL configured." },
        { status: 400 }
      ),
    };
  }

  let upstream: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const unsafeReason = await assertSafeRemoteUrl(currentUrl);
    if (unsafeReason) {
      return {
        error: NextResponse.json({ error: unsafeReason }, { status: 400 }),
      };
    }

    const res = await fetch(currentUrl.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop === MAX_REDIRECT_HOPS) {
        return {
          error: NextResponse.json(
            { error: "Too many or invalid redirects while loading resume." },
            { status: 502 }
          ),
        };
      }
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        return {
          error: NextResponse.json(
            { error: "Blocked malformed upstream redirect." },
            { status: 400 }
          ),
        };
      }
      continue;
    }

    upstream = res;
    break;
  }

  if (!upstream || !upstream.ok) {
    return {
      error: NextResponse.json(
        { error: "Unable to load resume document from storage." },
        { status: 502 }
      ),
    };
  }

  const readResult = await readStreamWithLimit(upstream, MAX_RESUME_BYTES);
  if (!readResult.ok) {
    return {
      error: NextResponse.json(
        { error: "Configured resume PDF exceeds maximum allowed size." },
        { status: 413 }
      ),
    };
  }

  if (!hasPdfSignature(readResult.bytes)) {
    return {
      error: NextResponse.json(
        { error: "Configured resume target is not a PDF document." },
        { status: 415 }
      ),
    };
  }

  cachedResumeEntry = {
    url: resumeUrl,
    bytes: readResult.bytes,
    expiresAt: Date.now() + RESUME_MEMORY_CACHE_TTL_MS,
  };

  return { bytes: readResult.bytes };
}

async function handleResumeRequest(request: Request, headOnly: boolean) {
  try {
    const ip = extractNormalizedClientIp(request.headers);
    const rate = checkMemoryRateLimit(`resume:${ip}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return createRateLimitResponse(
        rate.retryAfterSec,
        "Too many resume requests. Please wait a moment and retry."
      );
    }

    const { searchParams } = new URL(request.url);
    const isDownload = searchParams.get("download") === "1";
    const isVersioned = Boolean(searchParams.get("v"));

    const db = await getPortfolioContent();
    const resumeUrl = (db.profile.resumeUrl || "").trim();
    if (!resumeUrl) {
      return NextResponse.json(
        { error: "No resume document is configured." },
        { status: 404 }
      );
    }

    const resolved = await resolveResumePdfBytes(resumeUrl);
    if ("error" in resolved) {
      return resolved.error;
    }

    const filename = buildSafeResumeFilename(db.profile.fullName);
    const rangeHeader = request.headers.get("range");
    return buildPdfResponse(
      resolved.bytes,
      filename,
      isDownload,
      rangeHeader,
      headOnly,
      isVersioned
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve resume document." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleResumeRequest(request, false);
}

export async function HEAD(request: Request) {
  return handleResumeRequest(request, true);
}
