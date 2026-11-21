import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type {
  AnalyticsEvent,
  ContactMessage,
  EmailDispatchStatus,
} from "@/types/portfolio";
import {
  buildSupabaseHeaders,
  getStorageMode,
  resolveLocalDataDir,
  StorageReadError,
  StorageWriteError,
} from "@/lib/storageCore";

import {
  ANALYTICS_LOCAL_MAX_EVENTS,
  ANALYTICS_SUPABASE_FETCH_LIMIT,
} from "@/lib/storageConstants";

export { ANALYTICS_LOCAL_MAX_EVENTS, ANALYTICS_SUPABASE_FETCH_LIMIT };

let messagesWriteQueue: Promise<unknown> = Promise.resolve();
let analyticsWriteQueue: Promise<unknown> = Promise.resolve();

function getLocalMessagesFile(): string {
  return path.join(resolveLocalDataDir(), "contact-messages.json");
}

function getLocalAnalyticsFile(): string {
  return path.join(resolveLocalDataDir(), "analytics-events.json");
}

function getLegacyPortfolioFile(): string {
  return path.join(resolveLocalDataDir(), "portfolio-db.json");
}

export function getDefaultWelcomeMessage(): ContactMessage {
  return {
    id: "welcome-msg-1",
    name: "Portfolio Management System",
    email: "system@loudiamond.dev",
    subject: "Welcome to your Full-Stack Portfolio Inbox!",
    message:
      "Your Contact Form is now connected directly to this database inbox. Whenever a recruiter or client submits a message on your site, it will appear right here for you to read, star, or reply to.",
    isRead: false,
    isStarred: true,
    createdAt: new Date().toISOString(),
  };
}

interface SupabaseContactRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  is_read: boolean;
  is_starred: boolean;
  email_dispatch_status?: EmailDispatchStatus | null;
  replied_at?: string | null;
  reply_count?: number | null;
  last_reply_subject?: string | null;
  created_at: string;
}

interface SupabaseAnalyticsRow {
  id: string;
  event_type: AnalyticsEvent["type"];
  target: string;
  session_id?: string | null;
  device?: AnalyticsEvent["device"] | null;
  referrer?: string | null;
  created_at: string;
}

function mapSupabaseContactRow(row: SupabaseContactRow): ContactMessage {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    ...(row.email_dispatch_status
      ? { emailDispatchStatus: row.email_dispatch_status }
      : {}),
    ...(row.replied_at ? { repliedAt: row.replied_at } : {}),
    ...(typeof row.reply_count === "number" && row.reply_count > 0
      ? { replyCount: row.reply_count }
      : {}),
    ...(row.last_reply_subject
      ? { lastReplySubject: row.last_reply_subject }
      : {}),
    createdAt: row.created_at,
  };
}

const STRICT_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSupabaseContactRow(msg: ContactMessage, includeExtended = true) {
  const base = {
    id: msg.id,
    name: msg.name,
    email: msg.email,
    subject: msg.subject,
    message: msg.message,
    is_read: msg.isRead,
    is_starred: msg.isStarred,
    created_at: msg.createdAt,
  };

  if (!includeExtended) return base;

  // Always emit every extended column explicitly (null/0) so multi-row PostgREST bulk
  // inserts never fail with PGRST102 ("All object keys must match").
  return {
    ...base,
    email_dispatch_status: msg.emailDispatchStatus ?? null,
    replied_at: msg.repliedAt ?? null,
    reply_count: typeof msg.replyCount === "number" ? msg.replyCount : 0,
    last_reply_subject: msg.lastReplySubject ?? null,
  };
}

function mapSupabaseAnalyticsRow(row: SupabaseAnalyticsRow): AnalyticsEvent {
  return {
    id: row.id,
    type: row.event_type,
    target: row.target,
    createdAt: row.created_at,
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    ...(row.device ? { device: row.device } : {}),
    ...(row.referrer ? { referrer: row.referrer } : {}),
  };
}

function toSupabaseAnalyticsRow(ev: AnalyticsEvent, includeExtended = true) {
  const base = {
    id: ev.id,
    event_type: ev.type,
    target: ev.target,
    created_at: ev.createdAt,
  };

  if (!includeExtended) return base;

  // Always emit every extended column explicitly (null) so multi-row PostgREST bulk
  // inserts never fail with PGRST102 ("All object keys must match").
  return {
    ...base,
    session_id: ev.sessionId ?? null,
    device: ev.device ?? null,
    referrer: ev.referrer ?? null,
  };
}

function isMissingColumnError(status: number, bodyText: string): boolean {
  return (
    status === 400 &&
    /column|PGRST204|schema cache/i.test(bodyText)
  );
}

function getSupabaseCreds(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new StorageWriteError(
      "Supabase storage environment variables are not configured."
    );
  }
  return { url, key };
}

async function readLegacyLocalField<T>(field: "messages" | "analytics"): Promise<T[] | null> {
  try {
    const raw = await fs.readFile(getLegacyPortfolioFile(), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(parsed?.[field])) {
      return parsed[field] as T[];
    }
    return null;
  } catch {
    return null;
  }
}

async function readLocalMessagesFile(): Promise<ContactMessage[]> {
  const file = getLocalMessagesFile();
  try {
    const content = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as ContactMessage[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new StorageReadError("Unable to read local contact messages store.");
    }
    const legacy = await readLegacyLocalField<ContactMessage>("messages");
    const initial = legacy && legacy.length > 0 ? legacy : [getDefaultWelcomeMessage()];
    try {
      await fs.mkdir(resolveLocalDataDir(), { recursive: true });
      await fs.writeFile(file, JSON.stringify(initial, null, 2), "utf-8");
    } catch {
      // Ignore seed write errors on read-only FS
    }
    return initial;
  }
}

async function writeLocalMessagesFile(messages: ContactMessage[]): Promise<void> {
  const dir = resolveLocalDataDir();
  const file = getLocalMessagesFile();
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(messages, null, 2), "utf-8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Filesystem write failed";
    throw new StorageWriteError(`Failed to write contact messages store (${detail}).`);
  }
}

async function readLocalAnalyticsFile(): Promise<AnalyticsEvent[]> {
  const file = getLocalAnalyticsFile();
  try {
    const content = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed)
      ? (parsed as AnalyticsEvent[]).slice(0, ANALYTICS_LOCAL_MAX_EVENTS)
      : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new StorageReadError("Unable to read local analytics store.");
    }
    const legacy = await readLegacyLocalField<AnalyticsEvent>("analytics");
    const initial = legacy ? legacy.slice(0, ANALYTICS_LOCAL_MAX_EVENTS) : [];
    try {
      await fs.mkdir(resolveLocalDataDir(), { recursive: true });
      await fs.writeFile(file, JSON.stringify(initial, null, 2), "utf-8");
    } catch {
      // Ignore seed write errors on read-only FS
    }
    return initial;
  }
}

async function writeLocalAnalyticsFile(events: AnalyticsEvent[]): Promise<void> {
  const dir = resolveLocalDataDir();
  const file = getLocalAnalyticsFile();
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify(events.slice(0, ANALYTICS_LOCAL_MAX_EVENTS), null, 2),
      "utf-8"
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Filesystem write failed";
    throw new StorageWriteError(`Failed to write analytics store (${detail}).`);
  }
}

function enqueueMessageOp<T>(fn: () => Promise<T>): Promise<T> {
  const queued = messagesWriteQueue.then(fn, fn);
  messagesWriteQueue = queued.catch(() => undefined);
  return queued;
}

function enqueueAnalyticsOp<T>(fn: () => Promise<T>): Promise<T> {
  const queued = analyticsWriteQueue.then(fn, fn);
  analyticsWriteQueue = queued.catch(() => undefined);
  return queued;
}

async function supabaseInsertRows<T>(
  table: "contact_messages" | "analytics_events",
  rows: T[],
  fallbackRows?: unknown[],
  extraPrefer?: string
): Promise<void> {
  if (rows.length === 0) return;
  const { url, key } = getSupabaseCreds();

  const sendBatch = async (batch: unknown[]) => {
    const prefer = extraPrefer || "return=minimal";
    const endpoint =
      extraPrefer && extraPrefer.includes("resolution=")
        ? `${url}/rest/v1/${table}?on_conflict=id`
        : `${url}/rest/v1/${table}`;

    return fetch(endpoint, {
      method: "POST",
      headers: buildSupabaseHeaders(key, {
        "Content-Type": "application/json",
        Prefer: prefer,
      }),
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(5500),
    });
  };

  let res = await sendBatch(rows);
  if (!res.ok && fallbackRows) {
    const text = await res.text().catch(() => "");
    if (isMissingColumnError(res.status, text)) {
      res = await sendBatch(fallbackRows);
    } else {
      throw new StorageWriteError(
        `Supabase ${table} write failed (HTTP ${res.status}${text ? `: ${text.slice(0, 140)}` : ""}).`
      );
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new StorageWriteError(
      `Supabase ${table} write failed (HTTP ${res.status}${text ? `: ${text.slice(0, 140)}` : ""}).`
    );
  }
}

/**
 * Idempotently copies any legacy messages/analytics stored in `portfolio_store`'s `main` row
 * into normalized relational tables without overwriting existing rows.
 */
export async function backfillLegacyRelationalData(legacy: {
  messages?: ContactMessage[];
  analytics?: AnalyticsEvent[];
}): Promise<{ migratedMessages: number; migratedAnalytics: number }> {
  if (getStorageMode() !== "supabase") {
    return { migratedMessages: 0, migratedAnalytics: 0 };
  }

  let migratedMessages = 0;
  let migratedAnalytics = 0;

  if (Array.isArray(legacy.messages) && legacy.messages.length > 0) {
    const valid = legacy.messages.filter(
      (m) => m && typeof m.id === "string" && STRICT_UUID_REGEX.test(m.id)
    );
    if (valid.length > 0) {
      await supabaseInsertRows(
        "contact_messages",
        valid.map((m) => toSupabaseContactRow(m, true)),
        valid.map((m) => toSupabaseContactRow(m, false)),
        "resolution=ignore-duplicates,return=minimal"
      );
      migratedMessages = valid.length;
    }
  }

  if (Array.isArray(legacy.analytics) && legacy.analytics.length > 0) {
    const valid = legacy.analytics.filter(
      (e) => e && typeof e.id === "string" && STRICT_UUID_REGEX.test(e.id)
    );
    const chunkSize = 250;
    for (let i = 0; i < valid.length; i += chunkSize) {
      const slice = valid.slice(i, i + chunkSize);
      await supabaseInsertRows(
        "analytics_events",
        slice.map((e) => toSupabaseAnalyticsRow(e, true)),
        slice.map((e) => toSupabaseAnalyticsRow(e, false)),
        "resolution=ignore-duplicates,return=minimal"
      );
    }
    migratedAnalytics = valid.length;
  }

  return { migratedMessages, migratedAnalytics };
}

export async function listContactMessages(): Promise<ContactMessage[]> {
  if (getStorageMode() === "supabase") {
    const { url, key } = getSupabaseCreds();
    let res: Response;
    try {
      res = await fetch(
        `${url}/rest/v1/contact_messages?select=*&order=created_at.desc`,
        {
          headers: buildSupabaseHeaders(key),
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        }
      );
    } catch (err) {
      throw new StorageReadError(
        `Unable to reach Supabase contact_messages (${
          err instanceof Error ? err.message : "network error"
        }).`
      );
    }

    if (!res.ok) {
      throw new StorageReadError(
        `Failed to query Supabase contact_messages (HTTP ${res.status}).`
      );
    }

    const rows = (await res.json()) as SupabaseContactRow[];
    return Array.isArray(rows) ? rows.map(mapSupabaseContactRow) : [];
  }

  return readLocalMessagesFile();
}

export async function getContactMessageById(
  id: string
): Promise<ContactMessage | null> {
  if (getStorageMode() === "supabase") {
    const { url, key } = getSupabaseCreds();
    const res = await fetch(
      `${url}/rest/v1/contact_messages?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      {
        headers: buildSupabaseHeaders(key),
        cache: "no-store",
        signal: AbortSignal.timeout(4500),
      }
    );
    if (!res.ok) {
      throw new StorageReadError(
        `Failed to load contact message (HTTP ${res.status}).`
      );
    }
    const rows = (await res.json()) as SupabaseContactRow[];
    return rows[0] ? mapSupabaseContactRow(rows[0]) : null;
  }

  const all = await readLocalMessagesFile();
  return all.find((m) => m.id === id) || null;
}

export async function insertContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  emailDispatchStatus?: EmailDispatchStatus;
}): Promise<ContactMessage> {
  const newMsg: ContactMessage = {
    id: crypto.randomUUID(),
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
    isRead: false,
    isStarred: false,
    ...(input.emailDispatchStatus
      ? { emailDispatchStatus: input.emailDispatchStatus }
      : {}),
    createdAt: new Date().toISOString(),
  };

  if (getStorageMode() === "supabase") {
    await supabaseInsertRows(
      "contact_messages",
      [toSupabaseContactRow(newMsg, true)],
      [toSupabaseContactRow(newMsg, false)]
    );
    return newMsg;
  }

  return enqueueMessageOp(async () => {
    const current = await readLocalMessagesFile();
    const next = [newMsg, ...current];
    await writeLocalMessagesFile(next);
    return newMsg;
  });
}

export async function updateContactMessageById(
  id: string,
  updates: {
    isRead?: boolean;
    isStarred?: boolean;
    emailDispatchStatus?: EmailDispatchStatus;
    repliedAt?: string | null;
    replyCount?: number;
    lastReplySubject?: string | null;
  },
  options?: { returnAll?: boolean }
): Promise<{ updated: ContactMessage | null; messages: ContactMessage[] }> {
  const returnAll = options?.returnAll !== false;

  if (getStorageMode() === "supabase") {
    if (!STRICT_UUID_REGEX.test(id)) {
      return {
        updated: null,
        messages: returnAll ? await listContactMessages() : [],
      };
    }

    const { url, key } = getSupabaseCreds();
    const extendedPatch: Record<string, unknown> = {};
    const basePatch: Record<string, unknown> = {};

    if (updates.isRead !== undefined) {
      extendedPatch.is_read = updates.isRead;
      basePatch.is_read = updates.isRead;
    }
    if (updates.isStarred !== undefined) {
      extendedPatch.is_starred = updates.isStarred;
      basePatch.is_starred = updates.isStarred;
    }
    if (updates.emailDispatchStatus !== undefined) {
      extendedPatch.email_dispatch_status = updates.emailDispatchStatus;
    }
    if (updates.repliedAt !== undefined) {
      extendedPatch.replied_at = updates.repliedAt;
    }
    if (updates.replyCount !== undefined) {
      extendedPatch.reply_count = updates.replyCount;
    }
    if (updates.lastReplySubject !== undefined) {
      extendedPatch.last_reply_subject = updates.lastReplySubject;
    }

    let patchedRow: ContactMessage | null = null;
    if (Object.keys(extendedPatch).length > 0) {
      const sendPatch = (body: Record<string, unknown>) =>
        fetch(
          `${url}/rest/v1/contact_messages?id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: buildSupabaseHeaders(key, {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            }),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(4500),
          }
        );

      let res = await sendPatch(extendedPatch);
      let v2OnlyMissingColumn = false;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (isMissingColumnError(res.status, text)) {
          if (Object.keys(basePatch).length > 0) {
            res = await sendPatch(basePatch);
          } else {
            // v1 table without extended columns: skip silently rather than failing email status sync
            v2OnlyMissingColumn = true;
          }
        } else {
          throw new StorageWriteError(
            `Failed to update message in Supabase (HTTP ${res.status}).`
          );
        }
      }

      if (!v2OnlyMissingColumn && !res.ok) {
        throw new StorageWriteError(
          `Failed to update message in Supabase (HTTP ${res.status}).`
        );
      }

      if (!v2OnlyMissingColumn && res.ok) {
        const rows = (await res.json().catch(() => [])) as SupabaseContactRow[];
        if (Array.isArray(rows) && rows.length > 0) {
          patchedRow = mapSupabaseContactRow(rows[0]);
        }
      }
    }

    if (!returnAll) {
      return { updated: patchedRow, messages: [] };
    }
    const messages = await listContactMessages();
    const updated = patchedRow || messages.find((m) => m.id === id) || null;
    return { updated, messages };
  }

  return enqueueMessageOp(async () => {
    const current = await readLocalMessagesFile();
    let updated: ContactMessage | null = null;
    const next = current.map((m) => {
      if (m.id !== id) return m;
      updated = {
        ...m,
        ...(updates.isRead !== undefined ? { isRead: updates.isRead } : {}),
        ...(updates.isStarred !== undefined
          ? { isStarred: updates.isStarred }
          : {}),
        ...(updates.emailDispatchStatus !== undefined
          ? { emailDispatchStatus: updates.emailDispatchStatus }
          : {}),
        ...(updates.repliedAt !== undefined
          ? { repliedAt: updates.repliedAt }
          : {}),
        ...(updates.replyCount !== undefined
          ? { replyCount: updates.replyCount }
          : {}),
        ...(updates.lastReplySubject !== undefined
          ? { lastReplySubject: updates.lastReplySubject }
          : {}),
      };
      return updated;
    });
    if (updated) {
      await writeLocalMessagesFile(next);
    }
    return { updated, messages: next };
  });
}

export async function deleteContactMessageById(
  id: string
): Promise<ContactMessage[]> {
  if (getStorageMode() === "supabase") {
    const { url, key } = getSupabaseCreds();
    const res = await fetch(
      `${url}/rest/v1/contact_messages?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: buildSupabaseHeaders(key),
        signal: AbortSignal.timeout(4500),
      }
    );
    if (!res.ok) {
      throw new StorageWriteError(
        `Failed to delete message in Supabase (HTTP ${res.status}).`
      );
    }
    return listContactMessages();
  }

  return enqueueMessageOp(async () => {
    const current = await readLocalMessagesFile();
    const next = current.filter((m) => m.id !== id);
    await writeLocalMessagesFile(next);
    return next;
  });
}

export async function purgeReadUnstarredMessages(): Promise<{
  purgedCount: number;
  messages: ContactMessage[];
}> {
  if (getStorageMode() === "supabase") {
    const before = await listContactMessages();
    const { url, key } = getSupabaseCreds();
    const res = await fetch(
      `${url}/rest/v1/contact_messages?is_read=is.true&is_starred=is.false`,
      {
        method: "DELETE",
        headers: buildSupabaseHeaders(key),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) {
      throw new StorageWriteError(
        `Failed to purge read messages in Supabase (HTTP ${res.status}).`
      );
    }
    const after = await listContactMessages();
    return {
      purgedCount: Math.max(0, before.length - after.length),
      messages: after,
    };
  }

  return enqueueMessageOp(async () => {
    const current = await readLocalMessagesFile();
    const next = current.filter((m) => !m.isRead || m.isStarred);
    const purgedCount = Math.max(0, current.length - next.length);
    await writeLocalMessagesFile(next);
    return { purgedCount, messages: next };
  });
}

export async function replaceAllContactMessages(
  messages: ContactMessage[]
): Promise<ContactMessage[]> {
  if (getStorageMode() === "supabase") {
    const { url, key } = getSupabaseCreds();
    const delRes = await fetch(
      `${url}/rest/v1/contact_messages?id=not.is.null`,
      {
        method: "DELETE",
        headers: buildSupabaseHeaders(key),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!delRes.ok) {
      throw new StorageWriteError(
        `Failed to clear contact_messages during restore (HTTP ${delRes.status}).`
      );
    }

    const seenIds = new Set<string>();
    const normalized = messages.map((m) => {
      let safeId = STRICT_UUID_REGEX.test(m.id) ? m.id : crypto.randomUUID();
      if (seenIds.has(safeId)) {
        safeId = crypto.randomUUID();
      }
      seenIds.add(safeId);
      return { ...m, id: safeId };
    });
    const chunkSize = 200;
    for (let i = 0; i < normalized.length; i += chunkSize) {
      const batch = normalized.slice(i, i + chunkSize);
      await supabaseInsertRows(
        "contact_messages",
        batch.map((m) => toSupabaseContactRow(m, true)),
        batch.map((m) => toSupabaseContactRow(m, false))
      );
    }
    return listContactMessages();
  }

  return enqueueMessageOp(async () => {
    await writeLocalMessagesFile(messages);
    return messages;
  });
}

export async function listAnalyticsEvents(options?: {
  limit?: number;
}): Promise<AnalyticsEvent[]> {
  if (getStorageMode() === "supabase") {
    const { url, key } = getSupabaseCreds();
    const limit = Math.min(
      ANALYTICS_SUPABASE_FETCH_LIMIT,
      Math.max(1, options?.limit ?? ANALYTICS_SUPABASE_FETCH_LIMIT)
    );
    let res: Response;
    try {
      res = await fetch(
        `${url}/rest/v1/analytics_events?select=*&order=created_at.desc&limit=${limit}`,
        {
          headers: buildSupabaseHeaders(key),
          cache: "no-store",
          signal: AbortSignal.timeout(5500),
        }
      );
    } catch (err) {
      throw new StorageReadError(
        `Unable to reach Supabase analytics_events (${
          err instanceof Error ? err.message : "network error"
        }).`
      );
    }

    if (!res.ok) {
      throw new StorageReadError(
        `Failed to query Supabase analytics_events (HTTP ${res.status}).`
      );
    }

    const rows = (await res.json()) as SupabaseAnalyticsRow[];
    return Array.isArray(rows) ? rows.map(mapSupabaseAnalyticsRow) : [];
  }

  return readLocalAnalyticsFile();
}

export async function insertAnalyticsEvents(
  events: readonly AnalyticsEvent[]
): Promise<void> {
  if (events.length === 0) return;

  if (getStorageMode() === "supabase") {
    await supabaseInsertRows(
      "analytics_events",
      events.map((e) => toSupabaseAnalyticsRow(e, true)),
      events.map((e) => toSupabaseAnalyticsRow(e, false))
    );
    return;
  }

  await enqueueAnalyticsOp(async () => {
    const current = await readLocalAnalyticsFile();
    const next = [...events.slice().reverse(), ...current].slice(
      0,
      ANALYTICS_LOCAL_MAX_EVENTS
    );
    await writeLocalAnalyticsFile(next);
  });
}

export async function pruneRelationalAnalytics(options: {
  mode: "older-than-days" | "clear-all";
  days?: number;
}): Promise<{ removedCount: number; analytics: AnalyticsEvent[] }> {
  const days =
    typeof options.days === "number" && options.days > 0
      ? Math.min(365, Math.floor(options.days))
      : 30;
  const cutoffIso = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString();

  if (getStorageMode() === "supabase") {
    const before = await listAnalyticsEvents();
    const { url, key } = getSupabaseCreds();
    const filter =
      options.mode === "clear-all"
        ? "id=not.is.null"
        : `created_at=lt.${encodeURIComponent(cutoffIso)}`;
    const res = await fetch(`${url}/rest/v1/analytics_events?${filter}`, {
      method: "DELETE",
      headers: buildSupabaseHeaders(key),
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) {
      throw new StorageWriteError(
        `Failed to prune analytics in Supabase (HTTP ${res.status}).`
      );
    }
    const after = await listAnalyticsEvents();
    return {
      removedCount: Math.max(0, before.length - after.length),
      analytics: after,
    };
  }

  return enqueueAnalyticsOp(async () => {
    const current = await readLocalAnalyticsFile();
    const cutoffMs = new Date(cutoffIso).getTime();
    const next =
      options.mode === "clear-all"
        ? []
        : current.filter((ev) => {
            const ts = new Date(ev.createdAt).getTime();
            return Number.isNaN(ts) || ts >= cutoffMs;
          });
    const removedCount = Math.max(0, current.length - next.length);
    await writeLocalAnalyticsFile(next);
    return { removedCount, analytics: next };
  });
}

export async function replaceAllAnalyticsEvents(
  events: AnalyticsEvent[]
): Promise<AnalyticsEvent[]> {
  if (getStorageMode() === "supabase") {
    const { url, key } = getSupabaseCreds();
    const delRes = await fetch(
      `${url}/rest/v1/analytics_events?id=not.is.null`,
      {
        method: "DELETE",
        headers: buildSupabaseHeaders(key),
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!delRes.ok) {
      throw new StorageWriteError(
        `Failed to clear analytics_events during restore (HTTP ${delRes.status}).`
      );
    }

    const seenIds = new Set<string>();
    const normalized = events.map((ev) => {
      let safeId = STRICT_UUID_REGEX.test(ev.id) ? ev.id : crypto.randomUUID();
      if (seenIds.has(safeId)) {
        safeId = crypto.randomUUID();
      }
      seenIds.add(safeId);
      return { ...ev, id: safeId };
    });
    const chunkSize = 250;
    for (let i = 0; i < normalized.length; i += chunkSize) {
      const batch = normalized.slice(i, i + chunkSize);
      await supabaseInsertRows(
        "analytics_events",
        batch.map((e) => toSupabaseAnalyticsRow(e, true)),
        batch.map((e) => toSupabaseAnalyticsRow(e, false))
      );
    }
    return listAnalyticsEvents();
  }

  return enqueueAnalyticsOp(async () => {
    const bounded = events.slice(0, ANALYTICS_LOCAL_MAX_EVENTS);
    await writeLocalAnalyticsFile(bounded);
    return bounded;
  });
}

export async function probeRelationalTables(): Promise<{
  contactMessages: boolean;
  contactMessagesV2: boolean;
  analyticsEvents: boolean;
  analyticsEventsV2: boolean;
}> {
  if (getStorageMode() === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return {
        contactMessages: false,
        contactMessagesV2: false,
        analyticsEvents: false,
        analyticsEventsV2: false,
      };
    }

    const probeSelect = async (table: string, columns: string) => {
      try {
        const res = await fetch(
          `${url}/rest/v1/${table}?select=${columns}&limit=1`,
          {
            headers: buildSupabaseHeaders(key),
            cache: "no-store",
            signal: AbortSignal.timeout(4000),
          }
        );
        return res.ok;
      } catch {
        return false;
      }
    };

    const [
      contactMessages,
      contactMessagesV2,
      analyticsEvents,
      analyticsEventsV2,
    ] = await Promise.all([
      probeSelect("contact_messages", "id"),
      probeSelect(
        "contact_messages",
        "id,email_dispatch_status,replied_at,reply_count,last_reply_subject"
      ),
      probeSelect("analytics_events", "id"),
      probeSelect("analytics_events", "id,session_id,device,referrer"),
    ]);

    return {
      contactMessages,
      contactMessagesV2,
      analyticsEvents,
      analyticsEventsV2,
    };
  }

  const checkFile = async (filePath: string) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  };

  const [contactMessages, analyticsEvents] = await Promise.all([
    checkFile(getLocalMessagesFile()),
    checkFile(getLocalAnalyticsFile()),
  ]);
  return {
    contactMessages,
    contactMessagesV2: contactMessages,
    analyticsEvents,
    analyticsEventsV2: analyticsEvents,
  };
}
