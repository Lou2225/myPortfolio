import { describe, expect, it } from "vitest";
import {
  ANALYTICS_BUFFER_CAPACITY,
  buildAnalyticsSnapshot,
  formatAnalyticsBriefMarkdown,
  formatAnalyticsReferrerLabel,
  serializeAnalyticsCsv,
  toLocalYmd,
} from "@/lib/analytics";
import { getDefaultSeedDatabase } from "@/lib/db";
import { toPublicPortfolioPayload } from "@/lib/portfolioPublic";
import type { PortfolioDatabase } from "@/types/portfolio";

describe("Public Portfolio DTO & Analytics Engine", () => {
  it("strips private PII, drafts, messages, and analytics from public payloads", () => {
    const seed = getDefaultSeedDatabase();
    const db: PortfolioDatabase = {
      ...seed,
      profile: {
        ...seed.profile,
        birthDate: "2004-05-12",
        contact: {
          ...seed.profile.contact,
          address: {
            regionCode: "040000000",
            regionName: "Region IV-A",
            cityCode: "043404000",
            cityName: "Cabuyao",
            barangayName: "Private Barangay",
          },
        },
      },
      projects: [
        ...seed.projects,
        {
          id: "draft-hidden-system",
          title: "Unpublished Secret Draft",
          category: "Internal",
          year: "2026",
          role: "Architect",
          outcome: "Internal only",
          description: "Private draft details",
          problem: "Internal problem",
          solution: "Internal solution",
          stack: ["Next.js"],
          image: "/images/projects/draft.webp",
          metrics: "N/A",
          featured: false,
          published: false,
        },
      ],
      messages: [
        {
          id: "msg_private",
          name: "Private Visitor",
          email: "private@example.com",
          subject: "Confidential",
          message: "Private inquiry body",
          createdAt: "2026-11-15T10:00:00.000Z",
          isRead: false,
          isStarred: false,
        },
      ],
    };

    const publicDto = toPublicPortfolioPayload(db) as unknown as Record<
      string,
      unknown
    >;

    expect(publicDto.messages).toBeUndefined();
    expect(publicDto.analytics).toBeUndefined();

    const profile = publicDto.profile as {
      birthDate: string;
      contact: Record<string, unknown>;
    };
    expect(profile.birthDate).toBe("");
    expect(profile.contact.address).toBeUndefined();

    const projects = publicDto.projects as Array<{
      id: string;
      published?: boolean;
    }>;
    expect(projects.some((p) => p.id === "draft-hidden-system")).toBe(false);
    expect(projects.length).toBeGreaterThan(0);
  });

  it("aggregates session KPIs accurately and neutralizes CSV formula injection", () => {
    const nowMs = Date.UTC(2026, 10, 16, 12, 0, 0);
    const seed = getDefaultSeedDatabase();
    const targetProject = seed.projects[0]?.id || "proj-1";

    const db: PortfolioDatabase = {
      ...seed,
      analytics: [
        {
          id: "ev_1",
          type: "page_view",
          target: "/",
          createdAt: new Date(nowMs - 60_000).toISOString(),
          sessionId: "sess_alpha",
          device: "desktop",
          referrer: "github.com",
        },
        {
          id: "ev_2",
          type: "page_view",
          target: "/",
          createdAt: new Date(nowMs - 50_000).toISOString(),
          sessionId: "sess_alpha",
          device: "desktop",
          referrer: "github.com",
        },
        {
          id: "ev_3",
          type: "project_click",
          target: targetProject,
          createdAt: new Date(nowMs - 40_000).toISOString(),
          sessionId: "sess_alpha",
          device: "desktop",
          referrer: "github.com",
        },
        {
          id: "ev_4",
          type: "cv_download",
          target: "Hero Resume CTA",
          createdAt: new Date(nowMs - 30_000).toISOString(),
          sessionId: "sess_alpha",
          device: "desktop",
        },
        {
          id: "ev_5",
          type: "contact_click",
          target: "=cmd|' /C calc'!A0",
          createdAt: new Date(nowMs - 20_000).toISOString(),
          sessionId: "sess_beta",
          device: "mobile",
          referrer: "+HYPERLINK(\"http://evil.example\")",
        },
      ],
    };

    const summary = buildAnalyticsSnapshot(db, {
      range: "7d",
      mode: "sessions",
      nowMs,
    });

    expect(summary.buffer.capacity).toBe(ANALYTICS_BUFFER_CAPACITY);
    expect(ANALYTICS_BUFFER_CAPACITY).toBe(5000);
    // sess_alpha had 2 page_view events, counted as 1 unique viewing session.
    expect(summary.kpis.views.current).toBe(1);
    expect(summary.kpis.projectClicks.current).toBe(1);
    expect(summary.kpis.cvDownloads).toBe(1);
    expect(summary.kpis.directContacts).toBe(1);

    const csv = serializeAnalyticsCsv(summary.eventsInWindow);
    expect(csv).toContain(`"'=cmd|' /C calc'!A0"`);
    expect(csv).toContain(`"'+HYPERLINK(""http://evil.example"")"`);
  });

  it("supports custom From-To date ranges, device/referrer slicers, and markdown KPI brief formatting", () => {
    // Construct local-midnight-safe timestamps so assertions hold under any TZ.
    const day1Start = new Date(2026, 10, 10, 9, 0, 0).getTime();
    const day2Mid = new Date(2026, 10, 11, 14, 0, 0).getTime();
    const day4Mid = new Date(2026, 10, 13, 15, 0, 0).getTime();
    const priorWindowMid = new Date(2026, 10, 6, 12, 0, 0).getTime();
    const nowMs = new Date(2026, 10, 16, 18, 0, 0).getTime();

    const fromYmd = toLocalYmd(day1Start);
    const toYmd = toLocalYmd(day4Mid);
    const seed = getDefaultSeedDatabase();
    const projectA = seed.projects[0];
    const projectB = seed.projects[1];
    const projectATitle = projectA?.title || "Capstone System";
    const projectBTitle = projectB?.title || "Business Analytics Dashboard";

    const db: PortfolioDatabase = {
      ...seed,
      messages: [
        {
          id: "msg_in_window",
          name: "Recruiter One",
          email: "recruiter@example.com",
          subject: "System Inquiry",
          message: "Let us talk about full-stack architecture.",
          createdAt: new Date(day2Mid).toISOString(),
          isRead: false,
          isStarred: false,
        },
        {
          id: "msg_out_of_window",
          name: "Old Lead",
          email: "old@example.com",
          subject: "Archive Inquiry",
          message: "Sent outside the custom date window.",
          createdAt: new Date(nowMs).toISOString(),
          isRead: true,
          isStarred: false,
        },
      ],
      analytics: [
        // Prior symmetrical 4-day window event (2026-11-06 to 2026-11-09)
        {
          id: "ev_prior",
          type: "page_view",
          target: "/",
          createdAt: new Date(priorWindowMid).toISOString(),
          sessionId: "sess_prior",
          device: "desktop",
          referrer: "github.com",
        },
        // In custom window (desktop + github.com)
        {
          id: "ev_d1",
          type: "page_view",
          target: "/",
          createdAt: new Date(day1Start).toISOString(),
          sessionId: "sess_d1",
          device: "desktop",
          referrer: "github.com",
        },
        {
          id: "ev_d2",
          type: "project_click",
          target: projectATitle,
          createdAt: new Date(day1Start + 30_000).toISOString(),
          sessionId: "sess_d1",
          device: "desktop",
          referrer: "github.com",
        },
        {
          id: "ev_d3",
          type: "cv_download",
          target: "Hero Resume CTA",
          createdAt: new Date(day2Mid).toISOString(),
          sessionId: "sess_d1",
          device: "desktop",
          referrer: "github.com",
        },
        // In custom window (mobile + direct)
        {
          id: "ev_m1",
          type: "page_view",
          target: "/",
          createdAt: new Date(day4Mid).toISOString(),
          sessionId: "sess_m1",
          device: "mobile",
          referrer: "direct",
        },
        {
          id: "ev_m2",
          type: "project_click",
          target: projectBTitle,
          createdAt: new Date(day4Mid + 15_000).toISOString(),
          sessionId: "sess_m1",
          device: "mobile",
          referrer: "direct",
        },
        // Outside custom window (Nov 16)
        {
          id: "ev_after",
          type: "page_view",
          target: "/",
          createdAt: new Date(nowMs).toISOString(),
          sessionId: "sess_after",
          device: "tablet",
          referrer: "linkedin.com",
        },
      ],
    };

    // 1. Custom 4-day range with intentionally swapped From/To dates -> normalized & 4 daily bins
    const customSummary = buildAnalyticsSnapshot(db, {
      range: "custom",
      mode: "sessions",
      nowMs,
      fromDate: toYmd,
      toDate: fromYmd,
    });

    expect(customSummary.range).toBe("custom");
    expect(customSummary.series).toHaveLength(4);
    expect(customSummary.slicers.fromDate).toBe(fromYmd);
    expect(customSummary.slicers.toDate).toBe(toYmd);
    expect(customSummary.slicers.isSliced).toBe(false);
    expect(customSummary.slicers.totalUnfilteredInWindow).toBe(5);
    expect(customSummary.slicers.deviceCounts.desktop).toBe(1);
    expect(customSummary.slicers.deviceCounts.mobile).toBe(1);
    expect(customSummary.slicers.availableReferrers.map((r) => r.value)).toEqual([
      "github.com",
      "direct",
    ]);
    expect(customSummary.kpis.views.current).toBe(2);
    expect(customSummary.kpis.views.prior).toBe(1);
    expect(customSummary.kpis.views.pct).toBe(100);
    expect(customSummary.kpis.projectClicks.current).toBe(2);
    expect(customSummary.kpis.inquiries.current).toBe(1);

    // 2. Single-day custom window uses 12 intra-day bins
    const singleDaySummary = buildAnalyticsSnapshot(db, {
      range: "custom",
      mode: "events",
      nowMs,
      fromDate: fromYmd,
      toDate: fromYmd,
    });
    expect(singleDaySummary.series).toHaveLength(12);
    expect(singleDaySummary.kpis.views.current).toBe(1);

    // 3. Cross-filtering by device + referrer slices metrics while preserving facet counts
    const slicedSummary = buildAnalyticsSnapshot(db, {
      range: "custom",
      mode: "sessions",
      nowMs,
      fromDate: fromYmd,
      toDate: toYmd,
      device: "desktop",
      referrer: "github.com",
    });

    expect(slicedSummary.slicers.isSliced).toBe(true);
    expect(slicedSummary.slicers.totalUnfilteredInWindow).toBe(5);
    expect(slicedSummary.eventsInWindow).toHaveLength(3);
    expect(slicedSummary.kpis.views.current).toBe(1);
    expect(slicedSummary.kpis.projectClicks.current).toBe(1);
    expect(slicedSummary.kpis.cvDownloads).toBe(1);
    expect(slicedSummary.projects[0]?.id).toBe(projectA?.id);

    // 4. Multi-select array slicers combine both devices/referrers accurately
    const multiSliced = buildAnalyticsSnapshot(db, {
      range: "custom",
      mode: "sessions",
      nowMs,
      fromDate: fromYmd,
      toDate: toYmd,
      devices: ["desktop", "mobile"],
      referrers: ["github.com", "direct"],
    });
    expect(multiSliced.slicers.device).toBe("multi");
    expect(multiSliced.slicers.devices).toEqual(["desktop", "mobile"]);
    expect(multiSliced.slicers.referrers).toEqual(["github.com", "direct"]);
    expect(multiSliced.eventsInWindow).toHaveLength(5);
    expect(multiSliced.kpis.views.current).toBe(2);

    // 5. Referrer label + Markdown KPI brief formatting
    expect(formatAnalyticsReferrerLabel("direct")).toBe("Direct / Bookmark");
    const brief = formatAnalyticsBriefMarkdown(slicedSummary, db);
    expect(brief).toContain("# Lou Diamond Lava Valdellon — Analytics Brief");
    expect(brief).toContain("Device: desktop · Source: github.com");
    expect(brief).toContain("- **Unique Sessions:** 1");
    expect(brief).toContain("- **Goal Conversions (CV/Contact):** 1");
    expect(brief).toContain("## Top Projects");
  });
});
