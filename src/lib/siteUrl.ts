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

