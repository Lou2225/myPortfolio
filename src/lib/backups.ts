import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import {
  buildSupabaseHeaders,
  getStorageMode,
  resolveLocalDataDir,
  StorageWriteError,
} from "@/lib/db";
import { sanitizeAppearanceConfig } from "@/lib/appearance";
import type { PortfolioDatabase } from "@/types/portfolio";
import type { RestoreSectionFlags } from "@/lib/validation";

function getLocalSnapshotsFile(): string {
  return path.join(resolveLocalDataDir(), "portfolio-snapshots.json");
}

const SUPABASE_SNAPSHOTS_ROW_ID = "portfolio_snapshots";
const MAX_SNAPSHOTS = 10;

const UPLOAD_SUBFOLDERS = ["hero", "monogram", "projects", "resume", "general"] as const;

export type SnapshotTrigger = "manual" | "pre-restore" | "pre-reset";

export interface PortfolioSnapshotMeta {
  id: string;
  label: string;
  trigger: SnapshotTrigger;
  createdAt: string;
  sha256: string;
  sizeBytes: number;
  counts: {
    projects: number;
    skills: number;
    pillars: number;
    impactMetrics: number;
    messages: number;
    analytics: number;
  };
}

export interface PortfolioSnapshotRecord extends PortfolioSnapshotMeta {
  data: PortfolioDatabase;
}

export interface PortfolioBackupEnvelope {
  schemaVersion: 2;
  scope: "content-only" | "full";
  exportedAt: string;
  storageMode: "supabase" | "local-json";
  sha256: string;
  data: Partial<PortfolioDatabase>;
}

export interface SectionFootprint {
  key: "profile" | "narrative" | "skills" | "projects" | "messages" | "analytics";
  label: string;
  bytes: number;
  percentage: number;
  records: number;
}

export interface MediaOrphanFile {
  id: string;
  storagePath: string;
  publicUrl: string;
  folder: string;
  name: string;
  sizeBytes: number;
  updatedAt: string | null;
}

export interface MediaAuditReport {
  mode: "supabase" | "local";
  bucketOrDir: string;
  totalFiles: number;
  totalBytes: number;
  referencedCount: number;
  orphans: MediaOrphanFile[];
  scanWarning: string | null;
}

/**
 * Computes a deterministic lowercase hex SHA-256 checksum over JSON-serialized data.
 */
export function computeObjectSha256(payload: unknown): string {
  const canonical = JSON.stringify(payload);
  return crypto.createHash("sha256").update(canonical, "utf-8").digest("hex");
}

/**
 * Computes UTF-8 byte footprint and share percentage across each database domain.
 */
export function computeSectionFootprints(db: PortfolioDatabase): {
  totalBytes: number;
  sections: SectionFootprint[];
} {
  const totalSkillsCount = db.skills.reduce(
    (sum, cat) => sum + cat.skills.length,
    0
  );

  const rawEntries: Array<{
    key: SectionFootprint["key"];
    label: string;
    bytes: number;
    records: number;
  }> = [
    {
      key: "profile",
      label: "Profile & Appearance",
      bytes: Buffer.byteLength(
        JSON.stringify({ profile: db.profile, appearance: db.appearance }),
        "utf-8"
      ),
      records: 1,
    },
    {
      key: "narrative",
      label: "Headers, Pillars & Marquee",
      bytes: Buffer.byteLength(
        JSON.stringify({
          sectionHeaders: db.sectionHeaders,
          pillars: db.pillars,
          marqueePrinciples: db.marqueePrinciples,
        }),
        "utf-8"
      ),
      records: db.pillars.length + db.marqueePrinciples.length,
    },
    {
      key: "skills",
      label: "Skills & Impact",
      bytes: Buffer.byteLength(
        JSON.stringify({ skills: db.skills, impactMetrics: db.impactMetrics }),
        "utf-8"
      ),
      records: totalSkillsCount + db.impactMetrics.length,
    },
    {
      key: "projects",
      label: "Projects",
      bytes: Buffer.byteLength(JSON.stringify(db.projects), "utf-8"),
      records: db.projects.length,
    },
    {
      key: "messages",
      label: "Inbox Messages",
      bytes: Buffer.byteLength(JSON.stringify(db.messages), "utf-8"),
      records: db.messages.length,
    },
    {
      key: "analytics",
      label: "Analytics Events",
      bytes: Buffer.byteLength(JSON.stringify(db.analytics), "utf-8"),
      records: db.analytics.length,
    },
  ];

  const totalBytes = Math.max(
    1,
    rawEntries.reduce((sum, entry) => sum + entry.bytes, 0)
  );

  const sections: SectionFootprint[] = rawEntries.map((entry) => ({
    ...entry,
    percentage: Math.max(
      entry.bytes > 0 ? 1 : 0,
      Math.round((entry.bytes / totalBytes) * 100)
    ),
  }));

  return { totalBytes, sections };
}

function toSnapshotMeta(record: PortfolioSnapshotRecord): PortfolioSnapshotMeta {
  return {
    id: record.id,
    label: record.label,
    trigger: record.trigger,
    createdAt: record.createdAt,
    sha256: record.sha256,
    sizeBytes: record.sizeBytes,
    counts: record.counts,
  };
}

function normalizeSnapshotArray(raw: unknown): PortfolioSnapshotRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is PortfolioSnapshotRecord =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as PortfolioSnapshotRecord).id === "string" &&
        Boolean((item as PortfolioSnapshotRecord).data)
    )
    .slice(0, MAX_SNAPSHOTS);
}

async function readSnapshotsStore(): Promise<PortfolioSnapshotRecord[]> {
  if (getStorageMode() === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      try {
        const res = await fetch(
          `${url}/rest/v1/portfolio_store?id=eq.${SUPABASE_SNAPSHOTS_ROW_ID}&select=payload`,
          {
            headers: buildSupabaseHeaders(key),
            cache: "no-store",
            signal: AbortSignal.timeout(4500),
          }
        );
        if (res.ok) {
          const rows = await res.json();
          const payload =
            Array.isArray(rows) && rows.length > 0 ? rows[0]?.payload : null;
          if (payload && Array.isArray(payload.snapshots)) {
            return normalizeSnapshotArray(payload.snapshots);
          }
          return [];
        }
      } catch {
        // Fallback to local snapshot vault file
      }
    }
  }

  try {
    const raw = await fs.readFile(getLocalSnapshotsFile(), "utf-8");
    const parsed = JSON.parse(raw) as { snapshots?: unknown };
    return normalizeSnapshotArray(parsed?.snapshots);
  } catch {
    return [];
  }
}

async function writeSnapshotsStore(
  snapshots: PortfolioSnapshotRecord[]
): Promise<void> {
  const clean = snapshots.slice(0, MAX_SNAPSHOTS);
  const payload = {
    snapshots: clean,
    updatedAt: new Date().toISOString(),
  };

  const mode = getStorageMode();
  if (mode === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new StorageWriteError("Supabase credentials not configured.");
    }

    const res = await fetch(`${url}/rest/v1/portfolio_store`, {
      method: "POST",
      headers: buildSupabaseHeaders(key, {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      }),
      body: JSON.stringify({
        id: SUPABASE_SNAPSHOTS_ROW_ID,
        payload,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      throw new StorageWriteError(
        `Failed to save snapshot vault in Supabase (HTTP ${res.status}).`
      );
    }
  }

  try {
    await fs.mkdir(resolveLocalDataDir(), { recursive: true });
    await fs.writeFile(
      getLocalSnapshotsFile(),
      JSON.stringify(payload, null, 2),
      "utf-8"
    );
  } catch (err) {
    if (mode === "local-json") {
      const detail =
        err instanceof Error ? err.message : "Filesystem write failed";
      throw new StorageWriteError(
        `Failed to persist snapshot vault locally (${detail}).`
      );
    }
  }
}

export async function listPortfolioSnapshotMetas(): Promise<
  PortfolioSnapshotMeta[]
> {
  const all = await readSnapshotsStore();
  return all.map(toSnapshotMeta);
}

export async function getPortfolioSnapshotById(
  id: string
): Promise<PortfolioSnapshotRecord | null> {
  const all = await readSnapshotsStore();
  return all.find((s) => s.id === id) || null;
}

/**
 * Captures a rolling checkpoint (max 10) inside the Snapshot Vault.
 */
export async function createPortfolioSnapshot(params: {
  label: string;
  trigger: SnapshotTrigger;
  db: PortfolioDatabase;
}): Promise<PortfolioSnapshotMeta> {
  const existing = await readSnapshotsStore();
  const serialized = JSON.stringify(params.db);
  const sizeBytes = Buffer.byteLength(serialized, "utf-8");
  const sha256 = computeObjectSha256(params.db);
  const totalSkills = params.db.skills.reduce(
    (sum, cat) => sum + cat.skills.length,
    0
  );

  const record: PortfolioSnapshotRecord = {
    id: crypto.randomUUID(),
    label: params.label.trim().slice(0, 80) || "Portfolio Checkpoint",
    trigger: params.trigger,
    createdAt: new Date().toISOString(),
    sha256,
    sizeBytes,
    counts: {
      projects: params.db.projects.length,
      skills: totalSkills,
      pillars: params.db.pillars.length,
      impactMetrics: params.db.impactMetrics.length,
      messages: params.db.messages.length,
      analytics: params.db.analytics.length,
    },
    data: params.db,
  };

  const next = [record, ...existing].slice(0, MAX_SNAPSHOTS);
  await writeSnapshotsStore(next);
  return toSnapshotMeta(record);
}

export async function deletePortfolioSnapshot(
  snapshotId: string
): Promise<PortfolioSnapshotMeta[]> {
  const existing = await readSnapshotsStore();
  const next = existing.filter((s) => s.id !== snapshotId);
  if (next.length !== existing.length) {
    await writeSnapshotsStore(next);
  }
  return next.map(toSnapshotMeta);
}

/**
 * Selectively merges checked sections from an incoming backup/snapshot into the current database.
 */
export function mergeRestoredSections(
  current: PortfolioDatabase,
  incoming: Partial<PortfolioDatabase>,
  sections: RestoreSectionFlags
): PortfolioDatabase {
  return {
    ...current,
    profile:
      sections.profile && incoming.profile ? incoming.profile : current.profile,
    sectionHeaders:
      sections.narrative && incoming.sectionHeaders
        ? { ...current.sectionHeaders, ...incoming.sectionHeaders }
        : current.sectionHeaders,
    pillars:
      sections.narrative && Array.isArray(incoming.pillars)
        ? incoming.pillars
        : current.pillars,
    marqueePrinciples:
      sections.narrative && Array.isArray(incoming.marqueePrinciples)
        ? incoming.marqueePrinciples
        : current.marqueePrinciples,
    skills:
      sections.skills && Array.isArray(incoming.skills)
        ? incoming.skills
        : current.skills,
    impactMetrics:
      sections.skills && Array.isArray(incoming.impactMetrics)
        ? incoming.impactMetrics
        : current.impactMetrics,
    projects:
      sections.projects && Array.isArray(incoming.projects)
        ? incoming.projects
        : current.projects,
    appearance:
      sections.appearance && incoming.appearance
        ? sanitizeAppearanceConfig(incoming.appearance)
        : current.appearance,
    messages:
      sections.messages && Array.isArray(incoming.messages)
        ? incoming.messages
        : current.messages,
    analytics:
      sections.analytics && Array.isArray(incoming.analytics)
        ? incoming.analytics
        : current.analytics,
  };
}

function normalizeAssetReference(rawUrl?: string | null): string | null {
  const clean = (rawUrl || "").trim();
  if (!clean || clean.startsWith("data:") || clean.startsWith("blob:")) {
    return null;
  }
  try {
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      const parsed = new URL(clean);
      return decodeURIComponent(parsed.pathname);
    }
    const withoutHash = clean.split("#")[0]?.split("?")[0] || clean;
    return decodeURIComponent(withoutHash);
  } catch {
    return clean.split("?")[0] || clean;
  }
}

/**
 * Extracts every normalized upload path/URL currently referenced by the portfolio database.
 */
function extractReferencedAssetPaths(db: PortfolioDatabase): Set<string> {
  const refs = new Set<string>();
  const addRef = (url?: string | null) => {
    const norm = normalizeAssetReference(url);
    if (!norm) return;
    refs.add(norm);
    // Also capture `<folder>/<filename>` tail for fast matching
    const uploadsIdx = norm.indexOf("/uploads/");
    if (uploadsIdx >= 0) {
      refs.add(norm.slice(uploadsIdx + "/uploads/".length));
    }
    const publicObjMarker = "/storage/v1/object/public/";
    const pubIdx = norm.indexOf(publicObjMarker);
    if (pubIdx >= 0) {
      const afterBucket = norm.slice(pubIdx + publicObjMarker.length);
      const firstSlash = afterBucket.indexOf("/");
      if (firstSlash >= 0) {
        refs.add(afterBucket.slice(firstSlash + 1));
      }
    }
  };

  addRef(db.profile.avatarUrl);
  addRef(db.profile.monogramImageUrl);
  addRef(db.profile.resumeUrl);
  for (const project of db.projects) {
    addRef(project.image);
  }
  return refs;
}

/**
 * Scans `public/uploads/*` or Supabase Storage `myPortfolio` bucket to identify unreferenced files.
 */
export async function auditOrphanedMedia(
  db: PortfolioDatabase
): Promise<MediaAuditReport> {
  const referenced = extractReferencedAssetPaths(db);
  const mode = getStorageMode();

  if (mode === "supabase") {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = (process.env.SUPABASE_STORAGE_BUCKET || "myPortfolio").trim();

    if (supabaseUrl && supabaseKey) {
      const orphans: MediaOrphanFile[] = [];
      let totalFiles = 0;
      let totalBytes = 0;
      let warning: string | null = null;

      for (const folder of UPLOAD_SUBFOLDERS) {
        try {
          const res = await fetch(
            `${supabaseUrl}/storage/v1/object/list/${bucket}`,
            {
              method: "POST",
              headers: buildSupabaseHeaders(supabaseKey, {
                "Content-Type": "application/json",
              }),
              body: JSON.stringify({
                prefix: folder,
                limit: 200,
                offset: 0,
              }),
              signal: AbortSignal.timeout(4500),
            }
          );

          if (!res.ok) {
            warning = `Supabase Storage list returned HTTP ${res.status} on "${folder}".`;
            continue;
          }

          const items = (await res.json()) as Array<{
            id?: string | null;
            name?: string;
            updated_at?: string;
            metadata?: { size?: number } | null;
          }>;

          for (const item of items) {
            if (!item.name || !item.id) continue;
            const storagePath = `${folder}/${item.name}`;
            const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
            const sizeBytes = Number(item.metadata?.size || 0);
            totalFiles += 1;
            totalBytes += sizeBytes;

            const normalizedPath = `/storage/v1/object/public/${bucket}/${storagePath}`;
            if (!referenced.has(storagePath) && !referenced.has(normalizedPath)) {
              orphans.push({
                id: storagePath,
                storagePath,
                publicUrl,
                folder,
                name: item.name,
                sizeBytes,
                updatedAt: item.updated_at || null,
              });
            }
          }
        } catch (err) {
          warning = `Supabase Storage audit interrupted (${
            err instanceof Error ? err.message : "network error"
          }).`;
        }
      }

      return {
        mode: "supabase",
        bucketOrDir: bucket,
        totalFiles,
        totalBytes,
        referencedCount: referenced.size,
        orphans,
        scanWarning: warning,
      };
    }
  }

  // Local `public/uploads/<folder>` scanner
  const uploadsRoot = path.join(process.cwd(), "public", "uploads");
  const orphans: MediaOrphanFile[] = [];
  let totalFiles = 0;
  let totalBytes = 0;

  for (const folder of UPLOAD_SUBFOLDERS) {
    const dirPath = path.join(uploadsRoot, folder);
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const fullPath = path.join(dirPath, entry.name);
        const stat = await fs.stat(fullPath);
        const storagePath = `${folder}/${entry.name}`;
        const publicUrl = `/uploads/${storagePath}`;
        totalFiles += 1;
        totalBytes += stat.size;

        if (!referenced.has(storagePath) && !referenced.has(publicUrl)) {
          orphans.push({
            id: storagePath,
            storagePath,
            publicUrl,
            folder,
            name: entry.name,
            sizeBytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
          });
        }
      }
    } catch {
      // Folder may not exist yet before first upload
    }
  }

  return {
    mode: "local",
    bucketOrDir: "public/uploads",
    totalFiles,
    totalBytes,
    referencedCount: referenced.size,
    orphans,
    scanWarning: null,
  };
}

const SAFE_STORAGE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export function isSafeUploadStoragePath(candidate: string): boolean {
  if (
    !candidate ||
    candidate.includes("..") ||
    candidate.includes("\\") ||
    /[?#%\s]/.test(candidate)
  ) {
    return false;
  }
  const parts = candidate.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  const [folder, fileName] = parts;
  return (
    (UPLOAD_SUBFOLDERS as readonly string[]).includes(folder) &&
    SAFE_STORAGE_SEGMENT.test(fileName)
  );
}

/**
 * Safely deletes verified unreferenced upload files (never touching seed assets or active URLs).
 */
export async function deleteOrphanedMediaFiles(
  targets: string[],
  db: PortfolioDatabase
): Promise<{ deleted: string[]; skipped: string[] }> {
  const referenced = extractReferencedAssetPaths(db);
  const deleted: string[] = [];
  const skipped: string[] = [];
  const mode = getStorageMode();

  const cleanTargets = Array.from(
    new Set(targets.map((t) => t.replace(/^\/+/, "").trim()))
  );

  for (const storagePath of cleanTargets) {
    if (
      !isSafeUploadStoragePath(storagePath) ||
      referenced.has(storagePath) ||
      referenced.has(`/uploads/${storagePath}`)
    ) {
      skipped.push(storagePath);
      continue;
    }

    if (mode === "supabase") {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const bucket = (process.env.SUPABASE_STORAGE_BUCKET || "myPortfolio").trim();

      if (supabaseUrl && supabaseKey) {
        try {
          const [folder, fileName] = storagePath.split("/");
          const encodedPath = `${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}`;
          const res = await fetch(
            `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
            {
              method: "DELETE",
              headers: buildSupabaseHeaders(supabaseKey),
              signal: AbortSignal.timeout(4500),
            }
          );
          if (res.ok) {
            deleted.push(storagePath);
            continue;
          }
        } catch {
          // Fall through to skipped
        }
      }
      skipped.push(storagePath);
      continue;
    }

    const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
    const resolvedTarget = path.resolve(uploadsRoot, storagePath);
    if (!resolvedTarget.startsWith(uploadsRoot + path.sep)) {
      skipped.push(storagePath);
      continue;
    }

    try {
      await fs.unlink(resolvedTarget);
      deleted.push(storagePath);
    } catch {
      skipped.push(storagePath);
    }
  }

  return { deleted, skipped };
}

