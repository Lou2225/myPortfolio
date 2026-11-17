import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGitHubSnapshotCache,
  extractGitHubUsername,
  fetchGitHubSnapshot,
  resolveConfiguredGitHubUsername,
} from "@/lib/github";

const ORIGINAL_ENV = {
  GITHUB_USERNAME: process.env.GITHUB_USERNAME,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
};

describe("GitHub Engineering Proof Adapter (/api/github)", () => {
  beforeEach(() => {
    clearGitHubSnapshotCache();
    delete process.env.GITHUB_USERNAME;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_ENV.GITHUB_USERNAME === undefined) {
      delete process.env.GITHUB_USERNAME;
    } else {
      process.env.GITHUB_USERNAME = ORIGINAL_ENV.GITHUB_USERNAME;
    }
    if (ORIGINAL_ENV.GITHUB_TOKEN === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = ORIGINAL_ENV.GITHUB_TOKEN;
    }
  });

  it("extracts valid GitHub handles and rejects bare or non-GitHub hosts", () => {
    expect(extractGitHubUsername("lou-valdellon")).toBe("lou-valdellon");
    expect(extractGitHubUsername("https://github.com/lou-valdellon/")).toBe(
      "lou-valdellon"
    );
    expect(extractGitHubUsername("https://www.github.com/lou123?tab=repos")).toBe(
      "lou123"
    );
    expect(extractGitHubUsername("https://github.com")).toBeNull();
    expect(extractGitHubUsername("https://github.com/topics")).toBeNull();
    expect(extractGitHubUsername("https://gitlab.com/lou-valdellon")).toBeNull();
  });

  it("prefers GITHUB_USERNAME env over CMS profile contact URL", () => {
    process.env.GITHUB_USERNAME = "env-handle";
    expect(
      resolveConfiguredGitHubUsername("https://github.com/profile-handle")
    ).toBe("env-handle");

    delete process.env.GITHUB_USERNAME;
    expect(
      resolveConfiguredGitHubUsername("https://github.com/profile-handle")
    ).toBe("profile-handle");
  });

  it("aggregates non-fork public repositories, stars, and top languages accurately", async () => {
    process.env.GITHUB_USERNAME = "lou-dev";
    process.env.GITHUB_TOKEN = "ghp_mock_token_123";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/users/lou-dev")) {
          return new Response(
            JSON.stringify({
              login: "lou-dev",
              html_url: "https://github.com/lou-dev",
              public_repos: 2,
              followers: 14,
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify([
            {
              name: "portfolio",
              html_url: "https://github.com/lou-dev/portfolio",
              language: "TypeScript",
              stargazers_count: 12,
              fork: false,
              private: false,
              pushed_at: "2026-11-16T00:00:00Z",
            },
            {
              name: "analytics-etl",
              html_url: "https://github.com/lou-dev/analytics-etl",
              language: "TypeScript",
              stargazers_count: 8,
              fork: false,
              private: false,
              pushed_at: "2026-11-15T00:00:00Z",
            },
            {
              name: "forked-demo",
              html_url: "https://github.com/lou-dev/forked-demo",
              language: "JavaScript",
              stargazers_count: 99,
              fork: true,
              private: false,
            },
          ]),
          { status: 200 }
        );
      });

    const snapshot = await fetchGitHubSnapshot({ bypassCache: true });

    expect(snapshot.configured).toBe(true);
    expect(snapshot.username).toBe("lou-dev");
    expect(snapshot.publicRepos).toBe(2);
    expect(snapshot.followers).toBe(14);
    expect(snapshot.totalStars).toBe(20);
    expect(snapshot.topLanguages).toEqual([
      { name: "TypeScript", count: 2, pct: 100 },
    ]);
    expect(snapshot.recentRepos).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("degrades safely without throwing when unconfigured or GitHub fails", async () => {
    const empty = await fetchGitHubSnapshot({ profileGithubUrl: "https://github.com" });
    expect(empty.configured).toBe(false);
    expect(empty.reason).toBe("github_username_unconfigured");

    process.env.GITHUB_USERNAME = "lou-dev";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
      })
    );

    const limited = await fetchGitHubSnapshot({ bypassCache: true });
    expect(limited.configured).toBe(false);
    expect(limited.reason).toBe("github_upstream_http_403");
  });
});
