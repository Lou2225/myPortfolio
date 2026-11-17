"use client";

import { useEffect, useState } from "react";
import { ContactMessage } from "@/types/portfolio";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { IconActionButton } from "@/components/ui/ActionButtons";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { TabPanel } from "@/components/ui/TabPanel";
import { AdminAlertBanner } from "@/components/admin/AdminAlertBanner";
import { MessageReplyModal } from "@/components/admin/MessageReplyModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  useOfflineStatus,
  isNetworkOffline,
} from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import {
  Mail,
  Star,
  Trash2,
  CheckCircle2,
  Reply,
  Inbox,
  Clock,
  Send,
  Loader2,
} from "lucide-react";
import type { EmailDiagnostics } from "@/lib/email";

interface InboxManagerProps {
  messages: ContactMessage[];
  onRefresh: () => Promise<void>;
}

export function InboxManager({ messages, onRefresh }: InboxManagerProps) {
  const { isOnline } = useOfflineStatus();
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDeleteMsg, setPendingDeleteMsg] =
    useState<ContactMessage | null>(null);
  const [replyingToMsg, setReplyingToMsg] =
    useState<ContactMessage | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailDiagnostics, setEmailDiagnostics] =
    useState<EmailDiagnostics | null>(null);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailNotice, setTestEmailNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/messages", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          if (typeof data.emailConfigured === "boolean") {
            setEmailConfigured(data.emailConfigured);
          }
          if (data.emailDiagnostics) {
            setEmailDiagnostics(data.emailDiagnostics as EmailDiagnostics);
          }
        }
      })
      .catch(() => {
        // Fallback smoothly to mailto mode if status check is offline
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSendTestEmail = async () => {
    if (sendingTestEmail) return;
    if (isNetworkOffline(isOnline)) {
      setActionError("Offline — Reconnect to verify Resend API email delivery.");
      return;
    }

    setSendingTestEmail(true);
    setActionError(null);
    setTestEmailNotice(null);
    try {
      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-test-email" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        recipient?: string;
        providerId?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || "Failed to send Resend test email.");
      }

      const recipientLabel = json.recipient || "configured inbox";
      setTestEmailNotice(
        `Test email dispatched via Resend to ${recipientLabel}${json.providerId ? ` (ID: ${json.providerId})` : ""}.`
      );
      announceBrandPortalStatus({
        tone: "live",
        label: "Resend Verified",
        detail: `Delivered to ${recipientLabel}`,
        durationMs: 3200,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to verify Resend API.";
      setActionError(msg);
      announceBrandPortalStatus({
        tone: "error",
        label: "Email Check Failed",
        detail: msg,
      });
    } finally {
      setSendingTestEmail(false);
    }
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

  const filterTabs: TabItem<"all" | "unread" | "starred">[] = [
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
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4"
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Inbox className="w-5 h-5 text-(--text-accent) shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl uppercase tracking-tight text-(--text-primary)">
              Recruiter & Client Message Inbox
            </h2>
            <p className="text-xs text-(--text-muted)">
              Messages submitted via your portfolio&apos;s Contact form are stored here automatically.
            </p>
          </div>
        </div>

        <Tabs
          items={filterTabs}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter inbox messages"
          size="sm"
          variant="accent"
        />
      </div>

      {actionError && (
        <AdminAlertBanner
          variant="error"
          message={actionError}
          onDismiss={() => setActionError(null)}
        />
      )}

      {testEmailNotice && (
        <AdminAlertBanner
          variant="success"
          message={testEmailNotice}
          onDismiss={() => setTestEmailNotice(null)}
        />
      )}

      {/* Resend Transactional Email Status Strip */}
      {emailDiagnostics && (
        <div
          data-cascade
          className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0 text-xs font-mono">
            <StatusPill
              label={
                emailDiagnostics.configured
                  ? "Resend Active"
                  : "Mailto Fallback"
              }
              variant={emailDiagnostics.configured ? "success" : "warning"}
              size="xs"
            />
            {emailDiagnostics.configured ? (
              <span className="text-(--text-secondary) truncate">
                Alerts →{" "}
                <strong className="text-(--text-primary)">
                  {emailDiagnostics.notificationRecipient || "No recipient"}
                </strong>
                {emailDiagnostics.isSandboxSender && (
                  <span className="text-amber-400">
                    {" "}
                    · Sandbox sender (onboarding@resend.dev)
                  </span>
                )}
              </span>
            ) : (
              <span className="text-(--text-muted) truncate">
                Set <code className="text-(--text-primary)">RESEND_API_KEY</code>{" "}
                in <code className="text-(--text-primary)">.env.local</code> for
                live inquiry alerts &amp; 1-click replies.
              </span>
            )}
          </div>

          {emailDiagnostics.configured && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sendingTestEmail}
              onClick={() => void handleSendTestEmail()}
              className="h-8 px-3 text-[11px] font-mono shrink-0"
            >
              {sendingTestEmail ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-(--text-accent)" />
              ) : (
                <Send className="w-3.5 h-3.5 text-(--text-accent)" />
              )}
              <span>
                {sendingTestEmail ? "Sending Test..." : "Send Test Email"}
              </span>
            </Button>
          )}
        </div>
      )}

      {/* Messages List with Reusable Tabs Cascade (flows natively in document scroll — no nested scrollbar flash) */}
      <TabPanel activeKey={filter}>
        {filtered.length === 0 ? (
          <div
            data-cascade
            className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-12 text-center space-y-3"
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
          <div className="space-y-4">
            {filtered.map((msg) => (
              <article
                key={msg.id}
                data-cascade
                data-message-id={msg.id}
                className={`bg-(--bg-surface) border rounded-(--radius-card) p-5 sm:p-6 transition-all ${
                  !msg.isRead
                    ? "border-brand/40 shadow-[0_0_25px_var(--accent-glow)]"
                    : "border-(--border-subtle)"
                } ${busyId === msg.id ? "opacity-60" : ""}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-(--border-subtle) pb-4">
                  <div className="flex items-start sm:items-center gap-3">
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
                          ? "border-amber-400/45 bg-amber-400/10 text-amber-400 hover:text-amber-300 hover:bg-amber-400/15"
                          : undefined
                      }
                      icon={
                        <Star
                          className={`w-4 h-4 ${msg.isStarred ? "fill-current" : ""}`}
                        />
                      }
                    />

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-base text-(--text-primary)">
                          {msg.subject}
                        </h3>
                        {!msg.isRead && (
                          <StatusPill label="New" variant="solid" size="xs" />
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
                      <p className="text-xs font-mono text-(--text-muted) mt-0.5">
                        From:{" "}
                        <span className="text-(--text-secondary)">
                          {msg.name}
                        </span>{" "}
                        &lt;{msg.email}&gt;
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                    <span
                      suppressHydrationWarning
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-(--text-muted) mr-1"
                    >
                      <Clock className="w-3 h-3" />
                      {new Date(msg.createdAt).toLocaleString()}
                    </span>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        handleToggle(msg.id, { isRead: !msg.isRead })
                      }
                      className="h-9 px-3.5 font-mono text-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-(--text-accent)" />
                      <span>{msg.isRead ? "Mark Unread" : "Mark Read"}</span>
                    </Button>

                    <Button
                      type="button"
                      onClick={() => setReplyingToMsg(msg)}
                      variant="primary"
                      size="sm"
                      className="keep-white h-9 px-3.5 font-mono text-xs"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>Reply</span>
                    </Button>

                    <IconActionButton
                      size="compact"
                      intent="danger"
                      label="Delete message"
                      disabled={busyId === msg.id}
                      onClick={() => setPendingDeleteMsg(msg)}
                      icon={<Trash2 className="w-4 h-4" />}
                    />
                  </div>
                </div>

                <ScrollArea maxHeight={180} className="mt-4">
                  <p className="text-sm text-(--text-secondary) leading-relaxed whitespace-pre-wrap">
                    {msg.message}
                  </p>
                </ScrollArea>
              </article>
            ))}
          </div>
        )}
      </TabPanel>

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

