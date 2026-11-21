"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Clock, ExternalLink, Mail, Send, X } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { MessageField, SubjectField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { useOfflineStatus } from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import { contactReplySchema } from "@/lib/validation";
import type { ContactMessage } from "@/types/portfolio";

export interface MessageReplyModalProps {
  open: boolean;
  message: ContactMessage | null;
  emailConfigured: boolean;
  onClose: () => void;
  onRepliedSuccess: () => Promise<void> | void;
}

function buildDefaultReplySubject(originalSubject: string): string {
  const cleaned = (originalSubject || "").replace(/^(re:\s*)+/i, "").trim();
  const prefixed = cleaned ? `Re: ${cleaned}` : "Re: Portfolio Inquiry";
  return prefixed.slice(0, 160);
}

/**
 * Modular transactional reply modal for /admin Inbox.
 * Dispatches replies directly via Resend (`POST /api/admin/messages`) when
 * configured, while always keeping an explicit `mailto:` fallback available.
 */
export function MessageReplyModal({
  open,
  message,
  emailConfigured,
  onClose,
  onRepliedSuccess,
}: MessageReplyModalProps) {
  const { isOnline } = useOfflineStatus();
  const [cachedMessage, setCachedMessage] = useState<ContactMessage | null>(
    message
  );
  const [subject, setSubject] = useState(() =>
    message ? buildDefaultReplySubject(message.subject) : ""
  );
  const [replyBody, setReplyBody] = useState("");
  const [forceTouched, setForceTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !message) return;
    const rafId = requestAnimationFrame(() => {
      setCachedMessage(message);
      setSubject(buildDefaultReplySubject(message.subject));
      setReplyBody("");
      setForceTouched(false);
      setSubmitting(false);
      setSubmitError(null);
    });
    return () => cancelAnimationFrame(rafId);
  }, [open, message]);

  const activeMessage = open ? message || cachedMessage : cachedMessage;

  const mailtoHref = useMemo(() => {
    if (!activeMessage) return "#";
    const mailSubject =
      subject.trim() || buildDefaultReplySubject(activeMessage.subject);
    const params = new URLSearchParams();
    params.set("subject", mailSubject);
    if (replyBody.trim()) {
      params.set("body", replyBody.trim());
    }
    return `mailto:${activeMessage.email}?${params.toString()}`;
  }, [activeMessage, subject, replyBody]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMessage || submitting) return;

    setForceTouched(true);
    setSubmitError(null);

    if (!isOnline) {
      setSubmitError(
        "Offline — Reconnect to send an email reply, or use Open Mail Client."
      );
      return;
    }

    if (!emailConfigured) {
      setSubmitError(
        "Transactional email is not configured on this server. Use Open Mail Client below."
      );
      return;
    }

    const parsed = contactReplySchema.safeParse({
      id: activeMessage.id,
      subject,
      replyBody,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setSubmitError(
        firstIssue?.message || "Please complete a valid subject and reply message."
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error || `Failed to send reply (HTTP ${res.status}).`;
        setSubmitError(msg);
        announceBrandPortalStatus({
          tone: "error",
          label: "Reply Failed",
          detail: msg,
        });
        return;
      }

      await onRepliedSuccess();
      onClose();
    } catch {
      const msg =
        "Network error while dispatching reply. Your draft has not been lost.";
      setSubmitError(msg);
      announceBrandPortalStatus({
        tone: "error",
        label: "Reply Failed",
        detail: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      open={open && Boolean(activeMessage)}
      onClose={onClose}
      closeDisabled={submitting}
      ariaLabelledBy="reply-modal-title"
      ariaDescribedBy="reply-modal-recipient"
      maxWidthClassName="max-w-2xl"
    >
      {activeMessage && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-(--border-subtle) flex items-start justify-between gap-3 bg-(--bg-surface) shrink-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-8 h-8 rounded-(--radius-control) bg-brand/15 border border-brand/35 flex items-center justify-center text-(--text-accent) shrink-0">
                  <Mail className="w-4 h-4" aria-hidden="true" />
                </span>
                <h3
                  id="reply-modal-title"
                  className="font-display text-xl uppercase tracking-tight text-(--text-primary)"
                >
                  Reply To Inquiry
                </h3>
              </div>
              <p
                id="reply-modal-recipient"
                className="text-xs font-mono text-(--text-muted) mt-1.5 truncate"
              >
                To:{" "}
                <span className="text-(--text-primary) font-semibold">
                  {activeMessage.name}
                </span>{" "}
                &lt;{activeMessage.email}&gt;
                {(activeMessage.replyCount ?? 0) > 0 && (
                  <span className="text-(--text-accent)">
                    {" "}
                    · Replied ({activeMessage.replyCount})
                  </span>
                )}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close reply dialog"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Scrollable Body */}
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0 lou-scrollarea">
            {!emailConfigured && (
              <p className="text-xs font-mono text-(--text-muted) leading-relaxed">
                Transactional email is not configured on this server (RESEND_API_KEY / RESEND_FROM_EMAIL). Use Open Mail Client below to send your reply.
              </p>
            )}

            {submitError && (
              <p
                role="alert"
                className="text-xs font-mono text-red-400 leading-relaxed"
              >
                {submitError}
              </p>
            )}

            {/* Original Inquiry Preview */}
            <div className="p-3.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-(--text-muted)">
                <span className="uppercase tracking-wider text-(--text-secondary) font-semibold">
                  Original Subject: {activeMessage.subject}
                </span>
                <span
                  suppressHydrationWarning
                  className="inline-flex items-center gap-1"
                >
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {new Date(activeMessage.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-(--text-secondary) leading-relaxed whitespace-pre-wrap max-h-28 overflow-y-auto">
                {activeMessage.message}
              </p>
              {activeMessage.repliedAt && (
                <p
                  suppressHydrationWarning
                  className="text-[11px] font-mono text-(--text-accent) pt-1 border-t border-(--border-subtle)"
                >
                  Last replied {new Date(activeMessage.repliedAt).toLocaleString()}
                  {activeMessage.lastReplySubject
                    ? ` — "${activeMessage.lastReplySubject}"`
                    : ""}
                </p>
              )}
            </div>

            <SubjectField
              id="reply-modal-subject"
              label="Reply Subject"
              value={subject}
              onChange={setSubject}
              minLength={3}
              maxLength={160}
              forceTouched={forceTouched}
              disabled={submitting}
              placeholder="Re: Project Inquiry"
            />

            <MessageField
              id="reply-modal-body"
              label="Reply Message"
              value={replyBody}
              onChange={setReplyBody}
              minLength={5}
              maxLength={5000}
              rows={6}
              forceTouched={forceTouched}
              disabled={submitting}
              placeholder={`Hi ${activeMessage.name.split(" ")[0] || "there"},\n\nThanks for reaching out...`}
            />
          </div>

          {/* Footer Actions */}
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-(--border-subtle) bg-(--bg-surface) flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
            <Button
              href={mailtoHref}
              variant={emailConfigured ? "outline" : "primary"}
              size="sm"
              className={
                emailConfigured
                  ? "h-10 px-4 font-mono text-xs w-full sm:w-auto justify-center"
                  : "keep-white h-10 px-4 font-mono text-xs w-full sm:w-auto justify-center"
              }
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Open Mail Client</span>
            </Button>

            <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={submitting}
                className="h-10 px-4 font-mono text-xs flex-1 sm:flex-initial"
              >
                Cancel
              </Button>

              {emailConfigured && (
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submitting || !isOnline}
                  className="keep-white h-10 px-4 font-mono text-xs flex-[1.4] sm:flex-initial"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{submitting ? "Sending..." : "Send Email Reply"}</span>
                </Button>
              )}
            </div>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
