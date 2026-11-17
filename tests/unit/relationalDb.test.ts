import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

import {
  clearPortfolioMemoryCache,
  getPortfolioContent,
  getPortfolioDB,
  savePortfolioDB,
} from "@/lib/db";
import {
  deleteContactMessageById,
  getContactMessageById,
  insertAnalyticsEvents,
  insertContactMessage,
  listAnalyticsEvents,
  listContactMessages,
  probeRelationalTables,
  pruneRelationalAnalytics,
  purgeReadUnstarredMessages,
  updateContactMessageById,
} from "@/lib/relationalDb";

let tempDataDir = "";
const origEnv = {
  PORTFOLIO_DATA_DIR: process.env.PORTFOLIO_DATA_DIR,
  PORTFOLIO_FORCE_LOCAL_STORAGE: process.env.PORTFOLIO_FORCE_LOCAL_STORAGE,
};

describe("Relational Messages/Analytics Stores & Content Separation", () => {
  beforeAll(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-reldb-test-"));
    process.env.PORTFOLIO_DATA_DIR = tempDataDir;
    process.env.PORTFOLIO_FORCE_LOCAL_STORAGE = "1";
    clearPortfolioMemoryCache();
  });

  afterAll(() => {
    clearPortfolioMemoryCache();
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("performs full ContactMessage CRUD including reply tracking and selective purge", async () => {
    const msgA = await insertContactMessage({
      name: "Alice Recruiter",
      email: "alice@example.com",
      subject: "Senior Full-Stack Opening",
      message: "Would love to schedule an intro chat with our engineering team.",
      emailDispatchStatus: "sent",
    });

    const msgB = await insertContactMessage({
      name: "Bob Founder",
      email: "bob@example.com",
      subject: "Analytics Consulting",
      message: "Looking for help architecting telemetry dashboards.",
      emailDispatchStatus: "skipped",
    });

    const listed = await listContactMessages();
    expect(listed.some((m) => m.id === msgA.id)).toBe(true);
    expect(listed.some((m) => m.id === msgB.id)).toBe(true);

    const fetched = await getContactMessageById(msgA.id);
    expect(fetched?.emailDispatchStatus).toBe("sent");

    // Mark msgA read + starred, and msgB read + unstarred.
    await updateContactMessageById(msgA.id, {
      isRead: true,
      isStarred: true,
      repliedAt: "2026-11-16T01:00:00.000Z",
      replyCount: 1,
      lastReplySubject: "Re: Senior Full-Stack Opening",
    });
    await updateContactMessageById(msgB.id, { isRead: true, isStarred: false });

    const purged = await purgeReadUnstarredMessages();
    expect(purged.purgedCount).toBeGreaterThanOrEqual(1);
    expect(await getContactMessageById(msgB.id)).toBeNull();
    const retainedA = await getContactMessageById(msgA.id);
    expect(retainedA?.replyCount).toBe(1);
    expect(retainedA?.lastReplySubject).toBe("Re: Senior Full-Stack Opening");

    await deleteContactMessageById(msgA.id);
    expect(await getContactMessageById(msgA.id)).toBeNull();
  });

  it("inserts analytics events cleanly and prunes older-than-days or clear-all", async () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();

    await insertAnalyticsEvents([
      {
        id: "ev_old_1",
        type: "page_view",
        target: "/",
        createdAt: oldDate,
        sessionId: "sess_old",
        device: "desktop",
        referrer: "direct",
      },
      {
        id: "ev_recent_1",
        type: "project_click",
        target: "proj-analytics",
        createdAt: recentDate,
        sessionId: "sess_now",
        device: "mobile",
        referrer: "github.com",
      },
    ]);

    const afterInsert = await listAnalyticsEvents();
    expect(afterInsert.some((e) => e.id === "ev_old_1")).toBe(true);
    expect(afterInsert.some((e) => e.id === "ev_recent_1")).toBe(true);

    const agedPrune = await pruneRelationalAnalytics({
      mode: "older-than-days",
      days: 30,
    });
    expect(agedPrune.removedCount).toBe(1);
    expect(agedPrune.analytics.some((e) => e.id === "ev_old_1")).toBe(false);
    expect(agedPrune.analytics.some((e) => e.id === "ev_recent_1")).toBe(true);

    const clearAll = await pruneRelationalAnalytics({ mode: "clear-all" });
    expect(clearAll.analytics).toHaveLength(0);
  });

  it("persists content-only portfolio-db.json separately from relational streams", async () => {
    const relMsg = await insertContactMessage({
      name: "Combined View Check",
      email: "combined@example.com",
      subject: "Decoupling Verification",
      message: "Ensures relational messages stay out of main JSON content store.",
    });

    await savePortfolioDB((current) => ({
      ...current,
      profile: {
        ...current.profile,
        headline: "Isolated Test Headline",
      },
    }));

    const contentOnly = await getPortfolioContent({ bypassCache: true });
    expect(contentOnly.profile.headline).toBe("Isolated Test Headline");
    expect(contentOnly.messages).toHaveLength(0);
    expect(contentOnly.analytics).toHaveLength(0);

    const combined = await getPortfolioDB({ bypassCache: true });
    expect(combined.profile.headline).toBe("Isolated Test Headline");
    expect(combined.messages.some((m) => m.id === relMsg.id)).toBe(true);

    const rawDbJson = JSON.parse(
      fs.readFileSync(path.join(tempDataDir, "portfolio-db.json"), "utf-8")
    ) as { messages: unknown[]; analytics: unknown[] };
    expect(rawDbJson.messages).toEqual([]);
    expect(rawDbJson.analytics).toEqual([]);
  });

  it("upgrades legacy default /assets/hero/avatar.png paths to avatar.webp", async () => {
    const legacyContent = await getPortfolioContent({ bypassCache: true });
    const dbFile = path.join(tempDataDir, "portfolio-db.json");
    fs.writeFileSync(
      dbFile,
      JSON.stringify(
        {
          ...legacyContent,
          profile: {
            ...legacyContent.profile,
            avatarUrl: "/assets/hero/avatar.png",
          },
        },
        null,
        2
      ),
      "utf-8"
    );

    clearPortfolioMemoryCache();
    const migrated = await getPortfolioContent({ bypassCache: true });
    expect(migrated.profile.avatarUrl).toBe("/assets/hero/avatar.webp");
  });

  it("detects missing v2 relational columns cleanly during Supabase schema probes", async () => {
    const prevForce = process.env.PORTFOLIO_FORCE_LOCAL_STORAGE;
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      delete process.env.PORTFOLIO_FORCE_LOCAL_STORAGE;
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-proj.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_mock_key";

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input) => {
          const url = String(input);
          if (url.includes("select=id&limit=1")) {
            return new Response(JSON.stringify([]), { status: 200 });
          }
          return new Response(
            JSON.stringify({ code: "42703", message: "column does not exist" }),
            { status: 400 }
          );
        });

      const probe = await probeRelationalTables();
      expect(probe).toEqual({
        contactMessages: true,
        contactMessagesV2: false,
        analyticsEvents: true,
        analyticsEventsV2: false,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    } finally {
      vi.restoreAllMocks();
      if (prevForce === undefined) delete process.env.PORTFOLIO_FORCE_LOCAL_STORAGE;
      else process.env.PORTFOLIO_FORCE_LOCAL_STORAGE = prevForce;
      if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });
});
