import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  clearPortfolioMemoryCache,
  getPortfolioDB,
  getStorageMode,
  PORTFOLIO_CACHE_TAG,
  probeDatabaseHealth,
  savePortfolioDB,
  StorageWriteError,
} from "@/lib/db";
import {
  pruneRelationalAnalytics,
  purgeReadUnstarredMessages,
  replaceAllAnalyticsEvents,
  replaceAllContactMessages,
} from "@/lib/relationalDb";
import {
  auditOrphanedMedia,
  computeObjectSha256,
  computeSectionFootprints,
  createPortfolioSnapshot,
  deleteOrphanedMediaFiles,
  deletePortfolioSnapshot,
  getPortfolioSnapshotById,
  listPortfolioSnapshotMetas,
  mergeRestoredSections,
  type PortfolioBackupEnvelope,
} from "@/lib/backups";
import {
  portfolioRestoreSchema,
  restoreSectionsSchema,
  type RestoreSectionFlags,
} from "@/lib/validation";
import { getEmailDiagnostics, sendTestNotificationEmail } from "@/lib/email";
import {
  checkMemoryRateLimit,
  createRateLimitResponse,
  extractNormalizedClientIp,
} from "@/lib/rateLimit";
import type { PortfolioDatabase } from "@/types/portfolio";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const downloadSnapshotId = searchParams.get("downloadSnapshot");

  if (downloadSnapshotId) {
    const snap = await getPortfolioSnapshotById(downloadSnapshotId);
    if (!snap) {
      return NextResponse.json(
        { error: "Snapshot not found." },
        { status: 404 }
      );
    }

    const envelope: PortfolioBackupEnvelope = {
      schemaVersion: 2,
      scope: "full",
      exportedAt: snap.createdAt,
      storageMode: getStorageMode(),
      sha256: snap.sha256,
      data: snap.data,
    };

    const dateTag = snap.createdAt.slice(0, 10);
    return new NextResponse(JSON.stringify(envelope, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="lou-snapshot-${dateTag}-${snap.id.slice(0, 8)}.json"`,
      },
    });
  }

  const includeMedia = searchParams.get("includeMedia") === "1";

  const [health, db, snapshots] = await Promise.all([
    probeDatabaseHealth(),
    getPortfolioDB({ bypassCache: true }),
    listPortfolioSnapshotMetas(),
  ]);

  const footprints = computeSectionFootprints(db);
  const mediaAudit = includeMedia ? await auditOrphanedMedia(db) : null;
  const emailDiagnostics = getEmailDiagnostics(
    db.profile.contact.email,
    db.profile.fullName
  );

  return NextResponse.json({
    health,
    footprints,
    snapshots,
    mediaAudit,
    emailDiagnostics,
  });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action:
        | "create-snapshot"
        | "restore-snapshot"
        | "restore-json"
        | "flush-server-cache"
        | "prune-analytics"
        | "purge-read-messages"
        | "scan-media"
        | "purge-orphan-media"
        | "send-test-email";
      label?: string;
      snapshotId?: string;
      sections?: Partial<RestoreSectionFlags>;
      rawBackup?: unknown;
      mode?: "older-than-days" | "clear-all";
      days?: number;
      targets?: string[];
    };

    if (body.action === "flush-server-cache") {
      clearPortfolioMemoryCache();
      try {
        revalidateTag(PORTFOLIO_CACHE_TAG, "max");
        revalidatePath("/", "layout");
      } catch {
        // Ignore if called outside request context
      }
      return NextResponse.json({
        success: true,
        flushedAt: new Date().toISOString(),
      });
    }

    if (body.action === "create-snapshot") {
      const db = await getPortfolioDB({ bypassCache: true });
      const created = await createPortfolioSnapshot({
        label: body.label?.trim() || "Manual Checkpoint",
        trigger: "manual",
        db,
      });
      const snapshots = await listPortfolioSnapshotMetas();
      return NextResponse.json({
        success: true,
        snapshot: created,
        snapshots,
      });
    }

    if (body.action === "restore-snapshot") {
      if (!body.snapshotId) {
        return NextResponse.json(
          { error: "Snapshot ID is required." },
          { status: 400 }
        );
      }

      const target = await getPortfolioSnapshotById(body.snapshotId);
      if (!target) {
        return NextResponse.json(
          { error: "Requested snapshot was not found." },
          { status: 404 }
        );
      }

      const sections = restoreSectionsSchema.parse(body.sections || {});
      const current = await getPortfolioDB({ bypassCache: true });
      await createPortfolioSnapshot({
        label: `Auto-checkpoint before restoring "${target.label}"`,
        trigger: "pre-restore",
        db: current,
      });

      await savePortfolioDB((curr) =>
        mergeRestoredSections(curr, target.data, sections)
      );
      if (sections.messages && Array.isArray(target.data.messages)) {
        await replaceAllContactMessages(target.data.messages);
      }
      if (sections.analytics && Array.isArray(target.data.analytics)) {
        await replaceAllAnalyticsEvents(target.data.analytics);
      }
      revalidatePath("/", "layout");

      const updated = await getPortfolioDB({ bypassCache: true });
      const [snapshots, footprints] = await Promise.all([
        listPortfolioSnapshotMetas(),
        Promise.resolve(computeSectionFootprints(updated)),
      ]);

      return NextResponse.json({
        success: true,
        data: updated,
        snapshots,
        footprints,
      });
    }

    if (body.action === "restore-json") {
      if (!body.rawBackup || typeof body.rawBackup !== "object") {
        return NextResponse.json(
          { error: "Backup JSON object is required." },
          { status: 400 }
        );
      }

      const sections = restoreSectionsSchema.parse(body.sections || {});
      const maybeEnvelope = body.rawBackup as Partial<PortfolioBackupEnvelope>;

      let candidateData: unknown = body.rawBackup;
      if (maybeEnvelope.schemaVersion === 2 && maybeEnvelope.data) {
        candidateData = maybeEnvelope.data;
        if (typeof maybeEnvelope.sha256 === "string" && maybeEnvelope.sha256) {
          const actualDigest = computeObjectSha256(maybeEnvelope.data);
          if (actualDigest !== maybeEnvelope.sha256) {
            return NextResponse.json(
              {
                error:
                  "Backup SHA-256 integrity check failed. File content appears modified or corrupted.",
              },
              { status: 400 }
            );
          }
        }
      }

      const parsedBackup = portfolioRestoreSchema.safeParse(candidateData);
      if (!parsedBackup.success) {
        const issue = parsedBackup.error.issues[0];
        return NextResponse.json(
          {
            error: issue
              ? `Schema validation error at "${issue.path.join(".")}": ${issue.message}`
              : "Backup file does not match portfolio database schema.",
          },
          { status: 400 }
        );
      }

      const incomingPartial =
        parsedBackup.data as unknown as Partial<PortfolioDatabase>;
      const current = await getPortfolioDB({ bypassCache: true });
      await createPortfolioSnapshot({
        label: "Auto-checkpoint before JSON Import",
        trigger: "pre-restore",
        db: current,
      });

      await savePortfolioDB((curr) =>
        mergeRestoredSections(curr, incomingPartial, sections)
      );
      if (sections.messages && Array.isArray(incomingPartial.messages)) {
        await replaceAllContactMessages(incomingPartial.messages);
      }
      if (sections.analytics && Array.isArray(incomingPartial.analytics)) {
        await replaceAllAnalyticsEvents(incomingPartial.analytics);
      }
      revalidatePath("/", "layout");

      const updated = await getPortfolioDB({ bypassCache: true });
      const [snapshots, footprints] = await Promise.all([
        listPortfolioSnapshotMetas(),
        Promise.resolve(computeSectionFootprints(updated)),
      ]);

      return NextResponse.json({
        success: true,
        data: updated,
        snapshots,
        footprints,
      });
    }

    if (body.action === "prune-analytics") {
      const pruneMode = body.mode || "clear-all";
      const days =
        typeof body.days === "number" && body.days > 0
          ? Math.min(365, Math.floor(body.days))
          : 30;

      const { removedCount } = await pruneRelationalAnalytics({
        mode: pruneMode,
        days,
      });
      const updated = await getPortfolioDB({ bypassCache: true });

      return NextResponse.json({
        success: true,
        removedCount,
        data: updated,
        footprints: computeSectionFootprints(updated),
      });
    }

    if (body.action === "purge-read-messages") {
      const { purgedCount } = await purgeReadUnstarredMessages();
      const updated = await getPortfolioDB({ bypassCache: true });

      return NextResponse.json({
        success: true,
        purgedCount,
        data: updated,
        footprints: computeSectionFootprints(updated),
      });
    }

    if (body.action === "scan-media") {
      const db = await getPortfolioDB({ bypassCache: true });
      const mediaAudit = await auditOrphanedMedia(db);
      return NextResponse.json({
        success: true,
        mediaAudit,
      });
    }

    if (body.action === "purge-orphan-media") {
      const targets = Array.isArray(body.targets) ? body.targets : [];
      if (targets.length === 0) {
        return NextResponse.json(
          { error: "No orphan files selected for deletion." },
          { status: 400 }
        );
      }
      const db = await getPortfolioDB({ bypassCache: true });
      const result = await deleteOrphanedMediaFiles(targets, db);
      const mediaAudit = await auditOrphanedMedia(db);
      return NextResponse.json({
        success: true,
        deleted: result.deleted,
        skipped: result.skipped,
        mediaAudit,
      });
    }

    if (body.action === "send-test-email") {
      const clientIp = extractNormalizedClientIp(request.headers);
      const rate = checkMemoryRateLimit(`admin-test-email:${clientIp}`, {
        limit: 5,
        windowMs: 15 * 60 * 1000,
      });
      if (!rate.allowed) {
        return createRateLimitResponse(
          rate.retryAfterSec,
          "Test email rate limit reached. Wait a moment before retrying."
        );
      }

      const db = await getPortfolioDB({ bypassCache: true });
      const diagnostics = getEmailDiagnostics(
        db.profile.contact.email,
        db.profile.fullName
      );
      if (!diagnostics.configured) {
        return NextResponse.json(
          {
            error:
              "Resend API is not configured (set RESEND_API_KEY in .env.local or Vercel environment variables).",
          },
          { status: 422 }
        );
      }

      const dispatch = await sendTestNotificationEmail({
        recipientEmail: db.profile.contact.email,
        portfolioOwnerName: db.profile.fullName,
      });

      if (!dispatch.ok) {
        return NextResponse.json(
          {
            error:
              dispatch.error ||
              "Resend rejected test dispatch. Check RESEND_API_KEY and recipient permissions.",
          },
          { status: dispatch.status === "skipped" ? 422 : 502 }
        );
      }

      return NextResponse.json({
        success: true,
        providerId: dispatch.providerId,
        recipient: diagnostics.notificationRecipient,
        fromAddress: diagnostics.fromAddress,
      });
    }

    return NextResponse.json({ error: "Unknown system action." }, { status: 400 });
  } catch (err) {
    if (err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "System maintenance operation failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId");
  if (!snapshotId) {
    return NextResponse.json(
      { error: "snapshotId query parameter is required." },
      { status: 400 }
    );
  }

  try {
    const snapshots = await deletePortfolioSnapshot(snapshotId);
    return NextResponse.json({ success: true, snapshots });
  } catch (err) {
    if (err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to delete snapshot." },
      { status: 500 }
    );
  }
}

