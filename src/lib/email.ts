import type { ContactMessage, EmailDispatchStatus } from "@/types/portfolio";

export interface EmailDispatchResult {
  ok: boolean;
  status: EmailDispatchStatus;
  providerId?: string;
  reason?: string;
  error?: string;
}

export interface EmailDiagnostics {
  configured: boolean;
  fromAddress: string;
  isSandboxSender: boolean;
  notificationRecipient: string;
  usingFallbackRecipient: boolean;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeHeaderText(input: string, maxLen = 160): string {
  return input
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function isEmailDispatchConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function resolveNotificationRecipient(
  fallbackProfileEmail?: string | null
): string {
  const envTarget = process.env.CONTACT_NOTIFICATION_EMAIL?.trim();
  if (envTarget) return envTarget;
  return (fallbackProfileEmail || "").trim();
}

function resolveFromAddress(senderLabel?: string): string {
  const configured = process.env.RESEND_FROM_EMAIL?.trim();
  if (configured) return configured;
  const label = sanitizeHeaderText(senderLabel || "Portfolio CMS", 60);
  return `${label} <onboarding@resend.dev>`;
}

/**
 * Computes secret-free email readiness metadata for authenticated CMS diagnostics.
 */
export function getEmailDiagnostics(
  fallbackProfileEmail?: string | null,
  senderLabel?: string
): EmailDiagnostics {
  const fromAddress = resolveFromAddress(senderLabel);
  const envTarget = process.env.CONTACT_NOTIFICATION_EMAIL?.trim() || "";
  const notificationRecipient = resolveNotificationRecipient(fallbackProfileEmail);

  return {
    configured: isEmailDispatchConfigured(),
    fromAddress,
    isSandboxSender: fromAddress.toLowerCase().includes("onboarding@resend.dev"),
    notificationRecipient,
    usingFallbackRecipient: !envTarget && Boolean(notificationRecipient),
  };
}

async function postToResend(payload: {
  from: string;
  to: string[];
  subject: string;
  reply_to?: string;
  html: string;
  text: string;
}): Promise<EmailDispatchResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      status: "skipped",
      reason: "provider_unconfigured",
    };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });

    const json = (await res.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!res.ok) {
      return {
        ok: false,
        status: "failed",
        error: json?.message || `Email provider returned HTTP ${res.status}.`,
      };
    }

    return {
      ok: true,
      status: "sent",
      providerId: json?.id,
    };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      error:
        err instanceof Error ? err.message : "Email transport request timed out.",
    };
  }
}

export async function sendContactNotificationEmail(params: {
  inquiry: ContactMessage;
  recipientEmail?: string | null;
  portfolioOwnerName?: string;
}): Promise<EmailDispatchResult> {
  if (!isEmailDispatchConfigured()) {
    return {
      ok: false,
      status: "skipped",
      reason: "provider_unconfigured",
    };
  }

  const recipient = resolveNotificationRecipient(params.recipientEmail);
  if (!recipient) {
    return {
      ok: false,
      status: "skipped",
      reason: "missing_recipient",
    };
  }

  const { inquiry } = params;
  const cleanSubject = sanitizeHeaderText(
    `[Portfolio Inquiry] ${inquiry.subject}`,
    160
  );
  const safeName = escapeHtml(inquiry.name);
  const safeEmail = escapeHtml(inquiry.email);
  const safeSubject = escapeHtml(inquiry.subject);
  const safeBody = escapeHtml(inquiry.message).replace(/\n/g, "<br />");
  const safeOwner = escapeHtml(params.portfolioOwnerName || "Portfolio Owner");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#08080a; color:#f4f4f5; padding:24px; border-radius:8px; max-width:600px;">
      <p style="font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:#ff3b1d; margin:0 0 8px;">New Portfolio Inquiry</p>
      <h2 style="font-size:20px; margin:0 0 16px; color:#ffffff;">${safeSubject}</h2>
      <div style="background:#111114; border:1px solid #27272a; padding:16px; border-radius:6px; margin-bottom:16px;">
        <p style="margin:0 0 6px; font-size:13px;"><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>
        <p style="margin:0; font-size:12px; color:#a1a1aa;">Recipient Workspace: ${safeOwner}</p>
      </div>
      <div style="background:#17171b; border:1px solid #27272a; padding:16px; border-radius:6px; font-size:14px; line-height:1.6; color:#e4e4e7;">
        ${safeBody}
      </div>
      <p style="font-size:11px; color:#71717a; margin:16px 0 0;">Hit reply directly to respond to ${safeName}, or manage this inquiry inside /admin.</p>
    </div>
  `.trim();

  const text = [
    `New Portfolio Inquiry: ${inquiry.subject}`,
    `From: ${inquiry.name} <${inquiry.email}>`,
    "",
    inquiry.message,
  ].join("\n");

  return postToResend({
    from: resolveFromAddress(params.portfolioOwnerName),
    to: [recipient],
    subject: cleanSubject,
    reply_to: inquiry.email,
    html,
    text,
  });
}

export async function sendInboxReplyEmail(params: {
  toEmail: string;
  toName: string;
  subject: string;
  replyBody: string;
  originalSubject: string;
  originalMessage: string;
  senderName?: string;
  senderReplyTo?: string | null;
}): Promise<EmailDispatchResult> {
  if (!isEmailDispatchConfigured()) {
    return {
      ok: false,
      status: "skipped",
      reason: "provider_unconfigured",
    };
  }

  const cleanSubject = sanitizeHeaderText(params.subject, 160);
  const safeRecipient = escapeHtml(params.toName);
  const safeSender = escapeHtml(params.senderName || "Lou Diamond Valdellon");
  const safeReplyHtml = escapeHtml(params.replyBody).replace(/\n/g, "<br />");
  const safeOrigSubject = escapeHtml(params.originalSubject);
  const safeOrigMsg = escapeHtml(params.originalMessage).replace(/\n/g, "<br />");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#18181b; padding:20px; max-width:600px;">
      <p style="font-size:14px; line-height:1.6; margin:0 0 16px;">Hi ${safeRecipient},</p>
      <div style="font-size:14px; line-height:1.65; margin:0 0 24px;">
        ${safeReplyHtml}
      </div>
      <p style="font-size:13px; color:#52525b; margin:0 0 20px;">Best regards,<br /><strong>${safeSender}</strong></p>
      <hr style="border:none; border-top:1px solid #e4e4e7; margin:20px 0;" />
      <p style="font-size:11px; color:#71717a; margin:0 0 6px;">Original inquiry (${safeOrigSubject}):</p>
      <blockquote style="margin:0; padding-left:12px; border-left:2px solid #d4d4d8; font-size:12px; color:#52525b; line-height:1.5;">
        ${safeOrigMsg}
      </blockquote>
    </div>
  `.trim();

  const text = [
    `Hi ${params.toName},`,
    "",
    params.replyBody,
    "",
    `Best regards,\n${params.senderName || "Lou Diamond Valdellon"}`,
    "",
    "--- Original Inquiry ---",
    `Subject: ${params.originalSubject}`,
    params.originalMessage,
  ].join("\n");

  const replyTo = (params.senderReplyTo || "").trim();

  return postToResend({
    from: resolveFromAddress(params.senderName),
    to: [params.toEmail],
    subject: cleanSubject,
    ...(replyTo ? { reply_to: replyTo } : {}),
    html,
    text,
  });
}

/**
 * Dispatches a non-intrusive Resend health verification email to the configured notification recipient.
 */
export async function sendTestNotificationEmail(params: {
  recipientEmail?: string | null;
  portfolioOwnerName?: string;
}): Promise<EmailDispatchResult> {
  if (!isEmailDispatchConfigured()) {
    return {
      ok: false,
      status: "skipped",
      reason: "provider_unconfigured",
    };
  }

  const recipient = resolveNotificationRecipient(params.recipientEmail);
  if (!recipient) {
    return {
      ok: false,
      status: "skipped",
      reason: "missing_recipient",
    };
  }

  const safeOwner = escapeHtml(params.portfolioOwnerName || "Portfolio CMS");
  const fromAddr = resolveFromAddress(params.portfolioOwnerName);
  const sentAt = new Date().toISOString();

  return postToResend({
    from: fromAddr,
    to: [recipient],
    subject: "[Portfolio CMS] Resend API Verification Passed",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#08080a; color:#f4f4f5; padding:24px; border-radius:8px; max-width:560px;">
        <p style="font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:#ff3b1d; margin:0 0 8px;">Email Transport Active</p>
        <h2 style="font-size:18px; margin:0 0 12px; color:#ffffff;">Resend API Connected</h2>
        <p style="font-size:13px; color:#d4d4d8; line-height:1.6; margin:0 0 12px;">
          Your portfolio transactional email transport for <strong>${safeOwner}</strong> successfully dispatched this test message.
        </p>
        <p style="font-size:11px; color:#a1a1aa; margin:0;">From: ${escapeHtml(fromAddr)}<br />Timestamp: ${escapeHtml(sentAt)}</p>
      </div>
    `.trim(),
    text: `Resend API verification passed for ${params.portfolioOwnerName || "Portfolio CMS"}.\nFrom: ${fromAddr}\nTimestamp: ${sentAt}`,
  });
}
