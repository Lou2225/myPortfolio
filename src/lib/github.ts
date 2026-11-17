export interface GitHubLanguageShare {
  name: string;
  count: number;
  pct: number;
}

export interface GitHubRepoSummary {
  name: string;
  url: string;
  language: string | null;
  stars: number;
  updatedAt: string;
}

export interface GitHubSnapshot {
  configured: boolean;
  username: string | null;
  profileUrl: string | null;
  publicRepos: number;
  followers: number;
  totalStars: number;
  topLanguages: GitHubLanguageShare[];
  recentRepos: GitHubRepoSummary[];
  fetchedAt: string;
  reason?: string;
}

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_USERNAME_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const RESERVED_GITHUB_PATHS = new Set([
  "features",
  "explore",
  "topics",
  "orgs",
  "settings",
  "pricing",
  "login",
  "signup",
  "marketplace",
  "sponsors",
  "collections",
  "trending",
]);

const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000;
const snapshotCache = new Map<
  string,
  { expiresAt: number; payload: GitHubSnapshot }
>();

export function clearGitHubSnapshotCache(): void {
  snapshotCache.clear();
}

/**
 * Extracts a valid GitHub handle either from a plain username string or a `https://github.com/<user>` URL.
 */
export function extractGitHubUsername(raw?: string | null): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  if (GITHUB_USERNAME_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    const candidate = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "github.com") return null;

    const firstSegment = url.pathname.split("/").filter(Boolean)[0] || "";
    if (
      !firstSegment ||
      RESERVED_GITHUB_PATHS.has(firstSegment.toLowerCase()) ||
      !GITHUB_USERNAME_REGEX.test(firstSegment)
    ) {
      return null;
    }
    return firstSegment;
  } catch {
    return null;
  }
}

/**
 * Resolves active GitHub username cleanly: explicit `GITHUB_USERNAME` env var takes precedence
 * over `profile.contact.github` URL configured in CMS.
 */
export function resolveConfiguredGitHubUsername(
  profileGithubUrl?: string | null
): string | null {
  return (
    extractGitHubUsername(process.env.GITHUB_USERNAME) ||
    extractGitHubUsername(profileGithubUrl)
  );
}

interface RawGitHubUser {
  login?: string;
  html_url?: string;
  public_repos?: number;
  followers?: number;
}

interface RawGitHubRepo {
  name?: string;
  html_url?: string;
  language?: string | null;
  stargazers_count?: number;
  fork?: boolean;
  private?: boolean;
  pushed_at?: string;
  updated_at?: string;
}

function unconfiguredSnapshot(reason: string): GitHubSnapshot {
  return {
    configured: false,
    username: null,
    profileUrl: null,
    publicRepos: 0,
    followers: 0,
    totalStars: 0,
    topLanguages: [],
    recentRepos: [],
    fetchedAt: new Date().toISOString(),
    reason,
  };
}

/**
 * Fetches public GitHub engineering metrics & top languages with ISR revalidation,
 * memory caching, and strict non-throwing fallback behavior.
 */
export async function fetchGitHubSnapshot(params?: {
  profileGithubUrl?: string | null;
  bypassCache?: boolean;
}): Promise<GitHubSnapshot> {
  const username = resolveConfiguredGitHubUsername(params?.profileGithubUrl);
  if (!username) {
    return unconfiguredSnapshot("github_username_unconfigured");
  }

  const cacheKey = username.toLowerCase();
  const now = Date.now();
  if (!params?.bypassCache) {
    const cached = snapshotCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }
  }

  const token = (process.env.GITHUB_TOKEN || "").trim();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "lou-portfolio-app",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`${GITHUB_API_BASE}/users/${encodeURIComponent(username)}`, {
        headers,
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(6000),
      }),
      fetch(
        `${GITHUB_API_BASE}/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed&per_page=100`,
        {
          headers,
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(6000),
        }
      ),
    ]);

    if (!userRes.ok) {
      return {
        ...unconfiguredSnapshot(`github_upstream_http_${userRes.status}`),
        username,
        profileUrl: `https://github.com/${username}`,
      };
    }

    const userJson = (await userRes.json()) as RawGitHubUser;
    const rawRepos = reposRes.ok
      ? ((await reposRes.json()) as RawGitHubRepo[])
      : [];

    const ownPublicRepos = Array.isArray(rawRepos)
      ? rawRepos.filter((r) => !r.private && !r.fork)
      : [];

    let totalStars = 0;
    const langCounts = new Map<string, number>();

    for (const repo of ownPublicRepos) {
      totalStars += Number(repo.stargazers_count || 0);
      const lang = (repo.language || "").trim();
      if (lang) {
        langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
      }
    }

    const totalTagged = Array.from(langCounts.values()).reduce(
      (sum, c) => sum + c,
      0
    );
    const topLanguages: GitHubLanguageShare[] = Array.from(
      langCounts.entries()
    )
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([name, count]) => ({
        name,
        count,
        pct: totalTagged > 0 ? Math.round((count / totalTagged) * 100) : 0,
      }));

    const recentRepos: GitHubRepoSummary[] = ownPublicRepos
      .slice(0, 4)
      .map((repo) => ({
        name: repo.name || "repository",
        url: repo.html_url || `https://github.com/${username}`,
        language: repo.language || null,
        stars: Number(repo.stargazers_count || 0),
        updatedAt: repo.pushed_at || repo.updated_at || new Date().toISOString(),
      }));

    const snapshot: GitHubSnapshot = {
      configured: true,
      username: userJson.login || username,
      profileUrl: userJson.html_url || `https://github.com/${username}`,
      publicRepos: Number(userJson.public_repos ?? ownPublicRepos.length),
      followers: Number(userJson.followers ?? 0),
      totalStars,
      topLanguages,
      recentRepos,
      fetchedAt: new Date().toISOString(),
    };

    snapshotCache.set(cacheKey, {
      expiresAt: now + MEMORY_CACHE_TTL_MS,
      payload: snapshot,
    });
    return snapshot;
  } catch {
    return {
      ...unconfiguredSnapshot("github_network_unavailable"),
      username,
      profileUrl: `https://github.com/${username}`,
    };
  }
}
