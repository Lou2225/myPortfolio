import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import {
  PortfolioDatabase,
  ContactMessage,
  AnalyticsEvent,
  EmailDispatchStatus,
} from "@/types/portfolio";
import { profileData, defaultSectionHeaders } from "@/data/portfolio";
import { marqueePrinciples } from "@/data/principles";
import { pillarsData } from "@/data/pillars";
import { skillsData } from "@/data/skills";
import { certificatesData } from "@/data/certificates";
import { projectsData } from "@/data/projects";
import { impactMetrics } from "@/data/impact";
import { DEFAULT_APPEARANCE } from "@/data/appearance";
import { sanitizeAppearanceConfig } from "@/lib/appearance";
import {
  buildSupabaseHeaders,
  getStorageMode,
  resolveLocalDataDir,
  StorageReadError,
  StorageWriteError,
} from "@/lib/storageCore";
import {
  backfillLegacyRelationalData,
  getDefaultWelcomeMessage,
  insertAnalyticsEvents,
  insertContactMessage,
  listAnalyticsEvents,
  listContactMessages,
  probeRelationalTables,
} from "@/lib/relationalDb";

export {
  buildSupabaseHeaders,
  getStorageMode,
  resolveLocalDataDir,
  StorageReadError,
  StorageWriteError,
};

function getLocalPortfolioFile(): string {
  return path.join(resolveLocalDataDir(), "portfolio-db.json");
}

function getLocalCredentialsFile(): string {
  return path.join(resolveLocalDataDir(), "admin-credentials.json");
}

const SUPABASE_ADMIN_CREDENTIALS_ID = "admin_credentials";
export const PORTFOLIO_CACHE_TAG = "portfolio-db";

export interface StoredAdminCredentials {
  passwordHash: string;
  updatedAt: string;
}

// Fast content RAM cache for public portfolio SSR/API (excludes high-churn messages/analytics)
let serverMemoryCache: {
  scopeKey: string;
  data: PortfolioDatabase;
  expiresAt: number;
} | null = null;
let inflightContentRead: {
  scopeKey: string;
  promise: Promise<PortfolioDatabase>;
} | null = null;
const MEMORY_CACHE_TTL_MS = 60_000;
const SEED_BASELINE_UPDATED_AT = "2026-01-01T00:00:00.000Z";
let legacyRelationalBackfilled = false;

function getCacheScopeKey(): string {
  return `${getStorageMode()}:${resolveLocalDataDir()}`;
}

// In-process async write mutex so concurrent CMS content updates never clobber updates
let portfolioWriteQueue: Promise<unknown> = Promise.resolve();

export function getDefaultSeedDatabase(): PortfolioDatabase {
  return {
    profile: profileData,
    sectionHeaders: defaultSectionHeaders,
    marqueePrinciples,
    pillars: pillarsData,
    skills: skillsData,
    certificates: certificatesData,
    projects: projectsData,
    impactMetrics,
    appearance: DEFAULT_APPEARANCE,
    messages: [getDefaultWelcomeMessage()],
    analytics: [],
    updatedAt: SEED_BASELINE_UPDATED_AT,
  };
}

import { calculateAge, DEFAULT_BIRTH_DATE } from "@/lib/date";
import { sanitizeImageTransform } from "@/lib/imageTransform";

function normalizeDatabase(raw: Partial<PortfolioDatabase>): PortfolioDatabase {
  const seed = getDefaultSeedDatabase();
  const rawAvatarUrl = raw.profile?.avatarUrl ?? seed.profile.avatarUrl;
  const normalizedAvatarUrl =
    rawAvatarUrl === "/assets/hero/avatar.png"
      ? "/assets/hero/avatar.webp"
      : rawAvatarUrl;

  const mergedProfile = {
    ...seed.profile,
    ...(raw.profile || {}),
    avatarUrl: normalizedAvatarUrl,
    monogramImageUrl: raw.profile?.monogramImageUrl ?? seed.profile.monogramImageUrl ?? "",
    monogramTransform: raw.profile?.monogramTransform
      ? sanitizeImageTransform(raw.profile.monogramTransform, "circle")
      : seed.profile.monogramTransform,
    avatarTransform: raw.profile?.avatarTransform
      ? sanitizeImageTransform(raw.profile.avatarTransform, "squircle")
      : seed.profile.avatarTransform,
    birthDate: raw.profile?.birthDate || seed.profile.birthDate || DEFAULT_BIRTH_DATE,
    education: {
      ...seed.profile.education,
      ...(raw.profile?.education || {}),
    },
    contact: {
      ...seed.profile.contact,
      ...(raw.profile?.contact || {}),
    },
  };
  const computedAge = calculateAge(mergedProfile.birthDate);
  if (computedAge !== null) {
    mergedProfile.age = computedAge;
  }

  return {
    profile: mergedProfile,
    sectionHeaders: {
      ...seed.sectionHeaders,
      ...(raw.sectionHeaders || {}),
    },
    marqueePrinciples:
      Array.isArray(raw.marqueePrinciples) && raw.marqueePrinciples.length > 0
        ? raw.marqueePrinciples
        : seed.marqueePrinciples,
    pillars:
      Array.isArray(raw.pillars) && raw.pillars.length > 0
        ? raw.pillars
        : seed.pillars,
    skills:
      Array.isArray(raw.skills) && raw.skills.length > 0
        ? raw.skills
        : seed.skills,
    certificates:
      Array.isArray(raw.certificates) && raw.certificates.length > 0
        ? raw.certificates
        : seed.certificates,
    projects:
      Array.isArray(raw.projects) && raw.projects.length > 0
        ? raw.projects
        : seed.projects,
    impactMetrics:
      Array.isArray(raw.impactMetrics) && raw.impactMetrics.length > 0
        ? raw.impactMetrics
        : seed.impactMetrics,
    appearance: sanitizeAppearanceConfig(raw.appearance),
    messages: Array.isArray(raw.messages) ? raw.messages : seed.messages,
    analytics: Array.isArray(raw.analytics) ? raw.analytics : seed.analytics,
    updatedAt: raw.updatedAt || seed.updatedAt,
  };
}

function normalizeContentOnly(
  raw: Partial<PortfolioDatabase>
): PortfolioDatabase {
  return {
    ...normalizeDatabase(raw),
    messages: [],
    analytics: [],
  };
}

interface SupabaseReadResult {
  reachable: boolean;
  rowFound: boolean;
  data: PortfolioDatabase | null;
  hasLegacyRelationalArrays: boolean;
  latencyMs: number;
  error: string | null;
}

async function readSupabaseDBWithStatus(): Promise<SupabaseReadResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return {
      reachable: false,
      rowFound: false,
      data: null,
      hasLegacyRelationalArrays: false,
      latencyMs: 0,
      error: "Supabase credentials not configured.",
    };
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(
      `${url}/rest/v1/portfolio_store?id=eq.main&select=payload`,
      {
        headers: buildSupabaseHeaders(key),
        cache: "no-store",
        signal: AbortSignal.timeout(4500),
      }
    );
    const latencyMs = Math.max(1, Date.now() - startedAt);

    if (!res.ok) {
      return {
        reachable: false,
        rowFound: false,
        data: null,
        hasLegacyRelationalArrays: false,
        latencyMs,
        error: `Supabase returned HTTP ${res.status}.`,
      };
    }

    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0 && rows[0]?.payload) {
      const rawPayload = rows[0].payload as Partial<PortfolioDatabase>;
      const legacyMessages = Array.isArray(rawPayload.messages)
        ? rawPayload.messages
        : [];
      const legacyAnalytics = Array.isArray(rawPayload.analytics)
        ? rawPayload.analytics
        : [];
      const hasLegacy = legacyMessages.length > 0 || legacyAnalytics.length > 0;

      if (hasLegacy && !legacyRelationalBackfilled) {
        try {
          await backfillLegacyRelationalData({
            messages: legacyMessages,
            analytics: legacyAnalytics,
          });
          legacyRelationalBackfilled = true;
        } catch {
          // Retry backfill cleanly on next request
        }
      }

      return {
        reachable: true,
        rowFound: true,
        data: normalizeContentOnly(rawPayload),
        hasLegacyRelationalArrays: hasLegacy,
        latencyMs,
        error: null,
      };
    }

    return {
      reachable: true,
      rowFound: false,
      data: null,
      hasLegacyRelationalArrays: false,
      latencyMs,
      error: null,
    };
  } catch (err) {
    return {
      reachable: false,
      rowFound: false,
      data: null,
      hasLegacyRelationalArrays: false,
      latencyMs: Math.max(1, Date.now() - startedAt),
      error: err instanceof Error ? err.message : "Network request failed",
    };
  }
}

export interface DatabaseHealthReport {
  storageMode: "supabase" | "local-json";
  status: "healthy" | "degraded" | "offline";
  latencyMs: number;
  cloudReachable: boolean;
  fallbackActive: boolean;
  warning: string | null;
  tables: {
    main: boolean;
    adminCredentials: boolean;
    adminSecurity: boolean;
    portfolioSnapshots: boolean;
    contactMessages: boolean;
    contactMessagesV2: boolean;
    analyticsEvents: boolean;
    analyticsEventsV2: boolean;
  };
  storage: {
    bucket: string;
    exists: boolean;
    isPublic: boolean;
  };
  checkedAt: string;
}

async function probeSupabaseBucket(
  url: string,
  key: string,
  bucketName: string
): Promise<{ bucket: string; exists: boolean; isPublic: boolean }> {
  try {
    const res = await fetch(`${url}/storage/v1/bucket`, {
      headers: buildSupabaseHeaders(key),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return { bucket: bucketName, exists: false, isPublic: false };
    }
    const list = (await res.json().catch(() => [])) as Array<{
      id?: string;
      name?: string;
      public?: boolean;
    }>;
    const match = Array.isArray(list)
      ? list.find((b) => b.name === bucketName || b.id === bucketName)
      : undefined;
    return {
      bucket: bucketName,
      exists: Boolean(match),
      isPublic: Boolean(match?.public),
    };
  } catch {
    return { bucket: bucketName, exists: false, isPublic: false };
  }
}

/**
 * Probes live storage engine health, round-trip latency, and core/relational store tables.
 */
export async function probeDatabaseHealth(): Promise<DatabaseHealthReport> {
  const mode = getStorageMode();
  const checkedAt = new Date().toISOString();
  const targetBucket = (process.env.SUPABASE_STORAGE_BUCKET || "myPortfolio").trim();

  if (mode === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const started = Date.now();
      try {
        const [storeRes, relTables, bucketHealth] = await Promise.all([
          fetch(
            `${url}/rest/v1/portfolio_store?id=in.(main,admin_credentials,admin_security,portfolio_snapshots)&select=id`,
            {
              headers: buildSupabaseHeaders(key),
              cache: "no-store",
              signal: AbortSignal.timeout(4500),
            }
          ),
          probeRelationalTables(),
          probeSupabaseBucket(url, key, targetBucket),
        ]);
        const latencyMs = Math.max(1, Date.now() - started);

        if (!storeRes.ok) {
          return {
            storageMode: "supabase",
            status: "degraded",
            latencyMs,
            cloudReachable: false,
            fallbackActive: true,
            warning: `Supabase health check returned HTTP ${storeRes.status}; read requests may serve local fallback.`,
            tables: {
              main: false,
              adminCredentials: false,
              adminSecurity: false,
              portfolioSnapshots: false,
              contactMessages: relTables.contactMessages,
              contactMessagesV2: relTables.contactMessagesV2,
              analyticsEvents: relTables.analyticsEvents,
              analyticsEventsV2: relTables.analyticsEventsV2,
            },
            storage: bucketHealth,
            checkedAt,
          };
        }

        const rows = (await storeRes.json()) as Array<{ id?: string }>;
        const ids = new Set(rows.map((r) => r.id).filter(Boolean));
        const hasMain = ids.has("main");
        const hasAllRel =
          relTables.contactMessages &&
          relTables.analyticsEvents &&
          relTables.contactMessagesV2 &&
          relTables.analyticsEventsV2;
        const bucketReady = bucketHealth.exists && bucketHealth.isPublic;

        let warning: string | null = null;
        if (!hasMain) {
          warning =
            "Supabase connected cleanly, but main portfolio row has not been persisted yet.";
        } else if (!relTables.contactMessages || !relTables.analyticsEvents) {
          warning =
            "Run supabase/schema.sql in Supabase SQL Editor to create contact_messages and analytics_events.";
        } else if (!relTables.contactMessagesV2 || !relTables.analyticsEventsV2) {
          warning =
            "Relational tables exist, but v2 columns (session_id, device, referrer / email_dispatch_status, reply tracking) are missing. Re-run supabase/schema.sql in Supabase SQL Editor.";
        } else if (!bucketHealth.exists) {
          warning = `Supabase Storage bucket "${targetBucket}" was not found. Create a public bucket named "${targetBucket}" in Supabase Storage for media & CV uploads.`;
        } else if (!bucketHealth.isPublic) {
          warning = `Supabase Storage bucket "${targetBucket}" exists but is Private. Toggle it to Public so uploaded avatars, project thumbnails & CVs render on your site.`;
        }

        return {
          storageMode: "supabase",
          status: hasMain && hasAllRel && bucketReady ? "healthy" : "degraded",
          latencyMs,
          cloudReachable: true,
          fallbackActive: !hasMain,
          warning,
          tables: {
            main: hasMain,
            adminCredentials: ids.has(SUPABASE_ADMIN_CREDENTIALS_ID),
            adminSecurity: ids.has("admin_security"),
            portfolioSnapshots: ids.has("portfolio_snapshots"),
            contactMessages: relTables.contactMessages,
            contactMessagesV2: relTables.contactMessagesV2,
            analyticsEvents: relTables.analyticsEvents,
            analyticsEventsV2: relTables.analyticsEventsV2,
          },
          storage: bucketHealth,
          checkedAt,
        };
      } catch (err) {
        return {
          storageMode: "supabase",
          status: "offline",
          latencyMs: Math.max(1, Date.now() - started),
          cloudReachable: false,
          fallbackActive: true,
          warning: `Unable to reach Supabase (${
            err instanceof Error ? err.message : "network error"
          }); local JSON fallback active.`,
          tables: {
            main: false,
            adminCredentials: false,
            adminSecurity: false,
            portfolioSnapshots: false,
            contactMessages: false,
            contactMessagesV2: false,
            analyticsEvents: false,
            analyticsEventsV2: false,
          },
          storage: { bucket: targetBucket, exists: false, isPublic: false },
          checkedAt,
        };
      }
    }
  }

  const started = Date.now();
  const dataDir = resolveLocalDataDir();
  const checkFile = async (filename: string) => {
    try {
      await fs.access(path.join(dataDir, filename));
      return true;
    } catch {
      return false;
    }
  };

  const [main, adminCredentials, adminSecurity, portfolioSnapshots, relTables] =
    await Promise.all([
      checkFile("portfolio-db.json"),
      checkFile("admin-credentials.json"),
      checkFile("admin-security.json"),
      checkFile("portfolio-snapshots.json"),
      probeRelationalTables(),
    ]);

  return {
    storageMode: "local-json",
    status: "healthy",
    latencyMs: Math.max(1, Date.now() - started),
    cloudReachable: false,
    fallbackActive: false,
    warning: null,
    tables: {
      main,
      adminCredentials,
      adminSecurity,
      portfolioSnapshots,
      contactMessages: relTables.contactMessages,
      contactMessagesV2: relTables.contactMessagesV2,
      analyticsEvents: relTables.analyticsEvents,
      analyticsEventsV2: relTables.analyticsEventsV2,
    },
    storage: { bucket: targetBucket, exists: true, isPublic: true },
    checkedAt,
  };
}

/**
 * Clears in-memory RAM cache and revalidates Next.js `portfolio-db` ISR cache tags.
 */
export function clearPortfolioMemoryCache(): void {
  serverMemoryCache = null;
  inflightContentRead = null;
  try {
    revalidateTag(PORTFOLIO_CACHE_TAG, { expire: 0 });
    revalidatePath("/", "layout");
  } catch {
    // Ignore outside request context
  }
}

async function writeFileAtomic(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  const tmpPath = `${targetPath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmpPath, content, "utf-8");
  try {
    await fs.rename(tmpPath, targetPath);
  } catch {
    await fs.writeFile(targetPath, content, "utf-8");
    await fs.unlink(tmpPath).catch(() => undefined);
  }
}

async function writeSupabaseDB(db: PortfolioDatabase): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new StorageWriteError(
      "Supabase storage environment variables are not configured."
    );
  }

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/portfolio_store`, {
      method: "POST",
      headers: buildSupabaseHeaders(key, {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      }),
      body: JSON.stringify({
        id: "main",
        payload: db,
        updated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Network request failed";
    throw new StorageWriteError(
      `Unable to reach Supabase PostgreSQL (${detail}). Please check your connection and try again.`
    );
  }

  if (!res.ok) {
    let reason = `HTTP ${res.status}`;
    try {
      const errorText = (await res.text()).trim();
      if (errorText) {
        reason = `${reason}: ${errorText.slice(0, 180)}`;
      }
    } catch {
      // Ignore response text read error
    }
    throw new StorageWriteError(
      `Supabase PostgreSQL write failed (${reason}).`
    );
  }
}

async function readPortfolioContentUncached(): Promise<PortfolioDatabase> {
  // 1. Try Supabase if configured
  if (getStorageMode() === "supabase") {
    const cloudResult = await readSupabaseDBWithStatus();
    if (cloudResult.data) return cloudResult.data;
  }

  // 2. Local JSON database store (only seed when file truly does not exist — ENOENT)
  const localFile = getLocalPortfolioFile();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const content = await fs.readFile(localFile, "utf-8");
      const parsed = JSON.parse(content) as Partial<PortfolioDatabase>;
      return normalizeContentOnly(parsed);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        const seedContent = normalizeContentOnly(getDefaultSeedDatabase());
        try {
          await writeFileAtomic(localFile, JSON.stringify(seedContent, null, 2));
        } catch {
          // Ignore write error on read-only serverless fs if Supabase isn't connected yet
        }
        return seedContent;
      }
      const isTransient =
        code === "EBUSY" ||
        code === "EPERM" ||
        code === "EACCES" ||
        err instanceof SyntaxError;
      if (isTransient && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
        continue;
      }
      throw new StorageReadError(
        "Unable to read local portfolio database file (file locked or corrupted)."
      );
    }
  }
  throw new StorageReadError("Unable to read local portfolio database file.");
}

async function readPortfolioContentForWrite(): Promise<PortfolioDatabase> {
  if (getStorageMode() === "supabase") {
    const cloudResult = await readSupabaseDBWithStatus();
    if (!cloudResult.reachable) {
      throw new StorageWriteError(
        `Cannot verify current Supabase state before writing (${
          cloudResult.error || "connection failed"
        }). Write aborted to protect cloud data.`
      );
    }
    if (cloudResult.data) {
      return cloudResult.data;
    }
  }
  return readPortfolioContentUncached();
}

const getCachedPortfolioContentFromNext = unstable_cache(
  async () => readPortfolioContentUncached(),
  ["portfolio-database-store"],
  {
    tags: [PORTFOLIO_CACHE_TAG],
    revalidate: 60,
  }
);

/**
 * Reads cached CMS portfolio content for public SSR and `/api/portfolio`
 * without loading private `contact_messages` or `analytics_events` rows.
 */
export async function getPortfolioContent(options?: {
  bypassCache?: boolean;
}): Promise<PortfolioDatabase> {
  const scopeKey = getCacheScopeKey();
  const bypass = options?.bypassCache || Boolean(process.env.PORTFOLIO_DATA_DIR);

  if (!bypass) {
    if (
      serverMemoryCache &&
      serverMemoryCache.scopeKey === scopeKey &&
      Date.now() < serverMemoryCache.expiresAt
    ) {
      return serverMemoryCache.data;
    }

    if (inflightContentRead && inflightContentRead.scopeKey === scopeKey) {
      return inflightContentRead.promise;
    }

    const loadCachedPromise = (async () => {
      try {
        const cached = await getCachedPortfolioContentFromNext();
        serverMemoryCache = {
          scopeKey,
          data: cached,
          expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
        };
        return cached;
      } catch {
        const direct = await readPortfolioContentUncached();
        serverMemoryCache = {
          scopeKey,
          data: direct,
          expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
        };
        return direct;
      } finally {
        if (inflightContentRead?.scopeKey === scopeKey) {
          inflightContentRead = null;
        }
      }
    })();

    inflightContentRead = { scopeKey, promise: loadCachedPromise };
    return loadCachedPromise;
  }

  const fresh = await readPortfolioContentUncached();
  serverMemoryCache = {
    scopeKey,
    data: fresh,
    expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
  };
  return fresh;
}

/**
 * Loads full Admin database bundle (CMS content + live relational messages & analytics).
 */
export async function getPortfolioDB(options?: {
  bypassCache?: boolean;
}): Promise<PortfolioDatabase> {
  const [content, messages, analytics] = await Promise.all([
    getPortfolioContent(options),
    listContactMessages(),
    listAnalyticsEvents(),
  ]);

  return {
    ...content,
    messages,
    analytics,
  };
}

export async function savePortfolioDB(
  updater: (current: PortfolioDatabase) => PortfolioDatabase,
  shouldRevalidate = true
): Promise<PortfolioDatabase> {
  const executeSave = async (): Promise<PortfolioDatabase> => {
    const [currentContent, currentMessages, currentAnalytics] =
      await Promise.all([
        readPortfolioContentForWrite(),
        listContactMessages().catch(() => []),
        listAnalyticsEvents().catch(() => []),
      ]);

    const currentCombined: PortfolioDatabase = {
      ...currentContent,
      messages: currentMessages,
      analytics: currentAnalytics,
    };

    const rawUpdated = updater(currentCombined);
    const nextContent = normalizeContentOnly({
      ...rawUpdated,
      updatedAt: new Date().toISOString(),
    });

    const mode = getStorageMode();
    if (mode === "supabase") {
      await writeSupabaseDB(nextContent);
    }

    const localFile = getLocalPortfolioFile();
    try {
      await writeFileAtomic(localFile, JSON.stringify(nextContent, null, 2));
    } catch (err) {
      if (mode === "local-json") {
        const detail =
          err instanceof Error ? err.message : "Filesystem write failed";
        throw new StorageWriteError(
          `Failed to write local database file (${detail}).`
        );
      }
      // Read-only filesystem fallback when deployed on Vercel with Supabase
    }

    serverMemoryCache = {
      scopeKey: getCacheScopeKey(),
      data: nextContent,
      expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
    };

    try {
      revalidateTag(PORTFOLIO_CACHE_TAG, { expire: 0 });
      if (shouldRevalidate) {
        revalidatePath("/", "layout");
        revalidatePath("/admin");
      }
    } catch {
      // Ignore outside request context
    }

    return {
      ...nextContent,
      messages: currentMessages,
      analytics: currentAnalytics,
    };
  };

  const queuedTask = portfolioWriteQueue.then(executeSave, executeSave);
  portfolioWriteQueue = queuedTask.catch(() => undefined);
  return queuedTask;
}

export async function addContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  emailDispatchStatus?: EmailDispatchStatus;
}): Promise<ContactMessage> {
  return insertContactMessage(input);
}

export interface AnalyticsEventInput {
  type: AnalyticsEvent["type"];
  target: string;
  sessionId?: string;
  device?: AnalyticsEvent["device"];
  referrer?: string;
}

export async function recordAnalyticsEvents(
  inputs: readonly AnalyticsEventInput[]
): Promise<void> {
  if (inputs.length === 0) return;

  const baseNow = Date.now();
  const events: AnalyticsEvent[] = inputs.map((input, idx) => ({
    id: crypto.randomUUID(),
    type: input.type,
    target: input.target,
    createdAt: new Date(baseNow + idx).toISOString(),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.device ? { device: input.device } : {}),
    ...(input.referrer ? { referrer: input.referrer } : {}),
  }));

  try {
    await insertAnalyticsEvents(events);
  } catch (err) {
    // Analytics writes are best-effort telemetry and must not throw to visitors
    console.warn("Analytics persistence skipped:", err);
  }
}

/**
 * Reads custom administrator password override stored outside `PortfolioDatabase`
 * so salted hashes are never leaked to public routes, admin queries, or JSON exports.
 */
export async function readAdminCredentialOverride(): Promise<StoredAdminCredentials | null> {
  if (getStorageMode() === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new StorageReadError(
        "Supabase storage environment variables are not configured."
      );
    }

    let res: Response;
    try {
      res = await fetch(
        `${url}/rest/v1/portfolio_store?id=eq.${SUPABASE_ADMIN_CREDENTIALS_ID}&select=payload`,
        {
          headers: buildSupabaseHeaders(key),
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        }
      );
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Network request failed";
      throw new StorageReadError(
        `Unable to verify admin credential override in Supabase (${detail}).`
      );
    }

    if (!res.ok) {
      throw new StorageReadError(
        `Failed to read admin credential override from Supabase (HTTP ${res.status}).`
      );
    }

    const rows = await res.json();
    const payload =
      Array.isArray(rows) && rows.length > 0 ? rows[0]?.payload : null;
    if (
      payload &&
      typeof payload.passwordHash === "string" &&
      payload.passwordHash
    ) {
      return {
        passwordHash: payload.passwordHash,
        updatedAt:
          typeof payload.updatedAt === "string"
            ? payload.updatedAt
            : new Date().toISOString(),
      };
    }
    return null;
  }

  try {
    const content = await fs.readFile(getLocalCredentialsFile(), "utf-8");
    const parsed = JSON.parse(content) as Partial<StoredAdminCredentials>;
    if (typeof parsed.passwordHash === "string" && parsed.passwordHash) {
      return {
        passwordHash: parsed.passwordHash,
        updatedAt:
          typeof parsed.updatedAt === "string"
            ? parsed.updatedAt
            : new Date().toISOString(),
      };
    }
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return null;
    }
    throw new StorageReadError(
      "Unable to read local administrator credential override."
    );
  }
}

export async function writeAdminCredentialOverride(
  credentials: StoredAdminCredentials
): Promise<void> {
  const mode = getStorageMode();

  if (mode === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new StorageWriteError(
        "Supabase storage environment variables are not configured."
      );
    }

    let res: Response;
    try {
      res = await fetch(`${url}/rest/v1/portfolio_store`, {
        method: "POST",
        headers: buildSupabaseHeaders(key, {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        }),
        body: JSON.stringify({
          id: SUPABASE_ADMIN_CREDENTIALS_ID,
          payload: credentials,
          updated_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Network request failed";
      throw new StorageWriteError(
        `Unable to update administrator credentials in Supabase (${detail}).`
      );
    }

    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const text = (await res.text()).trim();
        if (text) reason = `${reason}: ${text.slice(0, 180)}`;
      } catch {
        // Ignore read failure
      }
      throw new StorageWriteError(
        `Failed to store administrator credentials in Supabase (${reason}).`
      );
    }
  }

  try {
    await writeFileAtomic(
      getLocalCredentialsFile(),
      JSON.stringify(credentials, null, 2)
    );
  } catch (err) {
    if (mode === "local-json") {
      const detail =
        err instanceof Error ? err.message : "Filesystem write failed";
      throw new StorageWriteError(
        `Failed to save administrator credentials locally (${detail}). Connect Supabase to persist password changes in serverless deployments.`
      );
    }
  }
}

export async function clearAdminCredentialOverride(): Promise<void> {
  const mode = getStorageMode();

  if (mode === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new StorageWriteError(
        "Supabase storage environment variables are not configured."
      );
    }

    let res: Response;
    try {
      res = await fetch(
        `${url}/rest/v1/portfolio_store?id=eq.${SUPABASE_ADMIN_CREDENTIALS_ID}`,
        {
          method: "DELETE",
          headers: buildSupabaseHeaders(key),
          signal: AbortSignal.timeout(8000),
        }
      );
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Network request failed";
      throw new StorageWriteError(
        `Unable to reach Supabase while reverting credentials (${detail}).`
      );
    }

    if (!res.ok) {
      throw new StorageWriteError(
        `Failed to revert credentials in Supabase (HTTP ${res.status}).`
      );
    }
  }

  try {
    await fs.unlink(getLocalCredentialsFile());
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT" && mode === "local-json") {
      throw new StorageWriteError(
        "Failed to delete local administrator credential override."
      );
    }
  }
}

