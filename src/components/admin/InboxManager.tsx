"use client";

import { useEffect, useState } from "react";
import { ContactMessage } from "@/types/portfolio";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { IconActionButton } from "@/components/ui/ActionButtons";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { AdminSlideView } from "@/components/motion/AdminMotion";
import { AdminAlertBanner } from "@/components/admin/AdminAlertBanner";
import { AdminModuleHeaderBar } from "@/components/admin/AdminModuleHeaderBar";
import { MessageReplyModal } from "@/components/admin/MessageReplyModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  useOfflineStatus,
  isNetworkOffline,
} from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  Mail,
  Star,
  Trash2,
  CheckCircle2,
  Reply,
  Inbox,
  Clock,
} from "lucide-react";

type InboxFilter = "all" | "unread" | "starred";
const INBOX_FILTER_ORDER: readonly InboxFilter[] = ["all", "unread", "starred"];

interface InboxManagerProps {
  messages: ContactMessage[];
  onRefresh: () => Promise<void>;
}

export function InboxManager({ messages, onRefresh }: InboxManagerProps) {
  const { isOnline } = useOfflineStatus();
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [filterDirection, setFilterDirection] = useState<"forward" | "back">(
    "forward"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDeleteMsg, setPendingDeleteMsg] =
    useState<ContactMessage | null>(null);
  const [replyingToMsg, setReplyingToMsg] =
    useState<ContactMessage | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/messages", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.emailConfigured === "boolean") {
          setEmailConfigured(data.emailConfigured);
        }
      })
      .catch(() => {
        // Fallback smoothly to mailto mode if status check is offline
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectFilter = (nextFilter: InboxFilter) => {
    if (nextFilter === filter) return;
    setFilterDirection(
      INBOX_FILTER_ORDER.indexOf(nextFilter) >=
        INBOX_FILTER_ORDER.indexOf(filter)
        ? "forward"
        : "back"
    );
    setFilter(nextFilter);
  };

  const filtered = messages.filter((m) => {
    if (filter === "unread") return !m.isRead;
    if (filter === "starred") return m.isStarred;
    return true;
  });

  const handleToggle = async (
    id: string,
    updates: { isRead?: boolean; isStarred?: boolean }
  ) => {
    if (isNetworkOffline(isOnline)) {
      setActionError("Offline — Reconnect to save changes");
      return;
    }

    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to update message.");
      }
      await onRefresh();
      const label =
        updates.isRead !== undefined
          ? updates.isRead
            ? "Marked Read"
            : "Marked Unread"
          : updates.isStarred
          ? "Message Starred"
          : "Star Removed";
      announceBrandPortalStatus({
        tone: "live",
        label,
        detail: "Inbox synced",
        durationMs: 2400,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update message.";
      setActionError(msg);
      announceBrandPortalStatus({
        tone: "error",
        label: "Inbox Error",
        detail: msg,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (isNetworkOffline(isOnline)) {
      setActionError("Offline — Reconnect to save changes");
      announceBrandPortalStatus({
        tone: "offline",
        label: "Offline Mode",
        detail: "Reconnect to manage inbox",
      });
      return;
    }

    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/messages?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to delete message.");
      }
      await onRefresh();
      announceBrandPortalStatus({
        tone: "synced",
        label: "Message Deleted",
        detail: "Removed from inbox",
        durationMs: 2600,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete message.";
      setActionError(msg);
      announceBrandPortalStatus({
        tone: "error",
        label: "Delete Failed",
        detail: msg,
      });
    } finally {
      setBusyId(null);
    }
  };

  const unreadCount = messages.filter((m) => !m.isRead).length;
  const starredCount = messages.filter((m) => m.isStarred).length;

  const filterTabs: TabItem<InboxFilter>[] = [
    { id: "all", label: "All", badge: messages.length },
    {
      id: "unread",
      label: "Unread",
      badge: unreadCount,
      isAlertBadge: unreadCount > 0,
    },
    { id: "starred", label: "Starred", badge: starredCount },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Responsive Filter Bar */}
      <AdminModuleHeaderBar
        dataCascade
        sticky={false}
        icon={<Inbox className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />}
        title="Recruiter & Client Message Inbox"
        tooltipLabel="Inbox triage & Resend replies"
        tooltipContent="Manage visitor inquiries submitted through the public Contact form. Mark unread, star priority leads, or dispatch transactional Resend email replies directly."
        showSubtitleOnMobile
        subtitle={`${messages.length} Total · ${unreadCount} Unread · ${starredCount} Starred`}
        rightSlot={
          <Tabs
            items={filterTabs}
            value={filter}
            onChange={handleSelectFilter}
            ariaLabel="Filter inbox messages"
            size="sm"
            layout={isMobile ? "equal" : "auto"}
            variant="accent"
            className="w-full sm:w-auto"
          />
        }
      />

      {actionError && (
        <AdminAlertBanner
          variant="error"
          message={actionError}
          onDismiss={() => setActionError(null)}
        />
      )}

      {/* Messages List with Smooth Directional Slide Transition */}
      <div role="tabpanel" className="overflow-x-clip">
        <AdminSlideView
          activeKey={filter}
          direction={filterDirection}
          distancePx={28}
          skipInitial
        >
          {filtered.length === 0 ? (
            <div
              data-cascade
              className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-8 sm:p-12 text-center space-y-3"
            >
              <Mail className="w-8 h-8 text-(--text-muted) mx-auto" />
              <p className="font-display text-2xl uppercase tracking-tight text-(--text-primary)">
                No Messages in This View
              </p>
              <p className="text-xs text-(--text-muted) max-w-md mx-auto">
                Try submitting a test inquiry from the Contact section on your public portfolio to see it appear here in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5 sm:space-y-4">
              {filtered.map((msg) => {
                const hasStatusPills =
                  !msg.isRead ||
                  msg.emailDispatchStatus === "sent" ||
                  msg.emailDispatchStatus === "failed" ||
                  (msg.replyCount ?? 0) > 0;

                return (
                  <article
                    key={msg.id}
                    data-cascade
                    data-message-id={msg.id}
                    className={`bg-(--bg-surface) border rounded-(--radius-card) p-3.5 sm:p-6 space-y-3 sm:space-y-4 transition-all ${
                      !msg.isRead
                        ? "border-brand/45 shadow-[0_0_25px_var(--accent-glow)]"
                        : "border-(--border-subtle)"
                    } ${busyId === msg.id ? "opacity-60" : ""}`}
                  >
                    {/* Header: Badges + Subject (left) & Star Priority Toggle (right) */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {hasStatusPills && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {!msg.isRead && (
                              <StatusPill
                                label="New"
                                variant="solid"
                                size="xs"
                              />
                            )}
                            {msg.emailDispatchStatus === "sent" && (
                              <StatusPill
                                label="Email Delivered"
                                variant="success"
                                size="xs"
                              />
                            )}
                            {msg.emailDispatchStatus === "failed" && (
                              <StatusPill
                                label="Notify Failed"
                                variant="warning"
                                size="xs"
                              />
                            )}
                            {(msg.replyCount ?? 0) > 0 && (
                              <StatusPill
                                label={`Replied (${msg.replyCount})`}
                                variant="accent"
                                size="xs"
                              />
                            )}
                          </div>
                        )}

                        <h3 className="font-semibold text-base sm:text-lg text-(--text-primary) leading-snug wrap-break-word">
                          {msg.subject}
                        </h3>
                      </div>

                      <IconActionButton
                        size="compact"
                        label={
                          msg.isStarred ? "Unstar message" : "Star message"
                        }
                        onClick={() =>
                          handleToggle(msg.id, { isStarred: !msg.isStarred })
                        }
                        className={
                          msg.isStarred
                            ? "border-amber-400/45 bg-amber-400/10 text-amber-400 hover:text-amber-300 hover:bg-amber-400/15 shrink-0"
                            : "shrink-0"
                        }
                        icon={
                          <Star
                            className={`w-4 h-4 ${msg.isStarred ? "fill-current" : ""}`}
                          />
                        }
                      />
                    </div>

                    {/* Sender & Timestamp Metadata */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs font-mono pb-3 border-b border-(--border-subtle)/70">
                      <p className="flex flex-wrap items-baseline gap-x-1.5 min-w-0 text-(--text-muted)">
                        <span>From:</span>
                        <span className="text-(--text-primary) font-medium">
                          {msg.name}
                        </span>
                        <span className="break-all sm:break-normal">
                          &lt;{msg.email}&gt;
                        </span>
                      </p>

                      <span
                        suppressHydrationWarning
                        className="inline-flex items-center gap-1.5 text-[11px] text-(--text-muted) shrink-0"
                      >
                        <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {/* Inquiry Message Body (Readable Surface Directly Above Actions) */}
                    <ScrollArea
                      maxHeight={180}
                      className="rounded-(--radius-control) bg-(--bg-surface-2)/65 border border-(--border-subtle)/60 p-3 sm:p-4"
                    >
                      <p className="text-sm text-(--text-secondary) leading-relaxed whitespace-pre-wrap wrap-break-word">
                        {msg.message}
                      </p>
                    </ScrollArea>

                    {/* Clean Single-Row Bottom Action Bar */}
                    <div className="pt-2.5 border-t border-(--border-subtle)/60 flex items-center sm:justify-end gap-2">
                      <Button
                        type="button"
                        onClick={() => setReplyingToMsg(msg)}
                        variant="primary"
                        size="sm"
                        className="keep-white h-10 px-3.5 sm:px-4 font-mono text-xs flex-1 sm:flex-none"
                      >
                        <Reply className="w-3.5 h-3.5 shrink-0" />
                        <span>Reply</span>
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          handleToggle(msg.id, { isRead: !msg.isRead })
                        }
                        className="h-10 px-3 sm:px-3.5 font-mono text-xs flex-1 sm:flex-none"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                        <span>{msg.isRead ? "Mark Unread" : "Mark Read"}</span>
                      </Button>

                      <IconActionButton
                        size="compact"
                        intent="danger"
                        label="Delete message"
                        disabled={busyId === msg.id}
                        onClick={() => setPendingDeleteMsg(msg)}
                        className="shrink-0"
                        icon={<Trash2 className="w-4 h-4" />}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </AdminSlideView>
      </div>

      <MessageReplyModal
        open={Boolean(replyingToMsg)}
        message={replyingToMsg}
        emailConfigured={emailConfigured}
        onClose={() => setReplyingToMsg(null)}
        onRepliedSuccess={async () => {
          announceBrandPortalStatus({
            tone: "live",
            label: "Reply Sent",
            detail: "Dispatched via email",
            durationMs: 2600,
          });
          await onRefresh();
        }}
      />

      <ConfirmModal
        open={Boolean(pendingDeleteMsg)}
        variant="danger"
        title="Delete Message Permanently?"
        description={
          pendingDeleteMsg
            ? `Permanently delete the inquiry "${pendingDeleteMsg.subject}" from ${pendingDeleteMsg.name} (${pendingDeleteMsg.email})? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete Message"
        loading={Boolean(pendingDeleteMsg && busyId === pendingDeleteMsg.id)}
        onCancel={() => {
          if (!busyId) setPendingDeleteMsg(null);
        }}
        onConfirm={async () => {
          if (!pendingDeleteMsg) return;
          const targetId = pendingDeleteMsg.id;
          await handleDelete(targetId);
          setPendingDeleteMsg(null);
        }}
      />
    </div>
  );
}

