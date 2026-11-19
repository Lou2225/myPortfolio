/**
 * Resolves the canonical public origin URL for metadataBase, sitemap.xml,
 * robots.txt, and structured JSON-LD metadata across local and Vercel environments.
 */
function normalizeUrlCandidate(raw?: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const scheme = /^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(trimmed)
    ? "http://"
    : "https://";
  return `${scheme}${trimmed}`;
}

export function getSiteUrl(): URL {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUrlCandidate(candidate);
    if (!normalized) continue;
    try {
      return new URL(normalized);
    } catch {
      // Try next candidate
    }
  }

  return new URL("http://localhost:3000");
}

export function getSiteOrigin(): string {
  return getSiteUrl().origin;
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "[::1]" ||
    lower.endsWith(".local")
  ) {
    return true;
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Determines whether an incoming production request should redirect to the canonical
 * site host (e.g., `louvaldellon.vercel.app`) so cookies, IndexedDB ECDSA device keys,
 * and WebAuthn passkeys never fragment across `www.` or alias domains.
 */
export function resolveCanonicalRedirectUrl(
  requestUrl: string,
  headers: Headers,
  env: Record<string, string | undefined> = process.env
): string | null {
  if (env.NODE_ENV !== "production" || env.VERCEL_ENV !== "production") {
    return null;
  }

  const rawCanonical =
    env.NEXT_PUBLIC_SITE_URL || env.VERCEL_PROJECT_PRODUCTION_URL;
  const normalizedCanonical = normalizeUrlCandidate(rawCanonical);
  if (!normalizedCanonical) return null;

  let canonicalUrl: URL;
  let incomingUrl: URL;
  try {
    canonicalUrl = new URL(normalizedCanonical);
    incomingUrl = new URL(requestUrl);
  } catch {
    return null;
  }

  const canonicalHost = canonicalUrl.hostname.toLowerCase();
  if (!canonicalHost || isLocalOrPrivateHost(canonicalHost)) {
    return null;
  }

  const rawHeaderHost = (
    headers.get("x-forwarded-host") ||
    headers.get("host") ||
    incomingUrl.host
  )
    .split(",")[0]
    .trim();
  const requestHost = rawHeaderHost.replace(/:\d+$/, "").toLowerCase();

  if (
    !requestHost ||
    requestHost === canonicalHost ||
    isLocalOrPrivateHost(requestHost)
  ) {
    return null;
  }

  const destination = new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    canonicalUrl.origin
  );
  return destination.toString();
}


