import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  escapeHtml,
  getEmailDiagnostics,
  isEmailDispatchConfigured,
  sanitizeHeaderText,
  sendContactNotificationEmail,
  sendInboxReplyEmail,
  sendTestNotificationEmail,
} from "@/lib/email";
import type { ContactMessage } from "@/types/portfolio";

const ORIGINAL_ENV = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  CONTACT_NOTIFICATION_EMAIL: process.env.CONTACT_NOTIFICATION_EMAIL,
};

function restoreEmailEnv() {
  for (const [key, val] of Object.entries(ORIGINAL_ENV)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

const SAMPLE_INQUIRY: ContactMessage = {
  id: "msg_test_1",
  name: "Dana <script>alert(1)</script>",
  email: "dana@example.com",
  subject: "Architecture Review\r\nBcc: attacker@evil.test",
  message: "Line one\n<img src=x onerror=alert(1) />",
  createdAt: "2026-11-16T00:00:00.000Z",
  isRead: false,
  isStarred: false,
};

describe("Transactional Email Adapter (Resend REST)", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.CONTACT_NOTIFICATION_EMAIL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEmailEnv();
  });

  it("escapes HTML and strips CRLF header injection characters", () => {
    expect(escapeHtml(`<script>"xss" & 'test'</script>`)).toBe(
      "&lt;script&gt;&quot;xss&quot; &amp; &#39;test&#39;&lt;/script&gt;"
    );
    expect(sanitizeHeaderText("Hello\r\nBcc: spy@evil.com")).toBe(
      "Hello Bcc: spy@evil.com"
    );
  });

  it("degrades cleanly to skipped when RESEND_API_KEY is absent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(isEmailDispatchConfigured()).toBe(false);

    const notifyRes = await sendContactNotificationEmail({
      inquiry: SAMPLE_INQUIRY,
      recipientEmail: "owner@example.com",
    });
    expect(notifyRes).toEqual({
      ok: false,
      status: "skipped",
      reason: "provider_unconfigured",
    });

    const replyRes = await sendInboxReplyEmail({
      toEmail: "dana@example.com",
      toName: "Dana",
      subject: "Re: Review",
      replyBody: "Happy to discuss tomorrow.",
      originalSubject: "Review",
      originalMessage: "Hello",
    });
    expect(replyRes.status).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends escaped HTML notification and inbox reply emails via Resend", async () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    process.env.RESEND_FROM_EMAIL = "Portfolio <noreply@example.com>";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "email_abc_123" }), { status: 200 })
      );

    const notifyResult = await sendContactNotificationEmail({
      inquiry: SAMPLE_INQUIRY,
      recipientEmail: "owner@example.com",
      portfolioOwnerName: "Lou Diamond",
    });

    expect(notifyResult).toEqual({
      ok: true,
      status: "sent",
      providerId: "email_abc_123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0];
    const parsedBody = JSON.parse(String(init?.body)) as {
      subject: string;
      reply_to?: string;
      html: string;
      to: string[];
    };

    expect(parsedBody.to).toEqual(["owner@example.com"]);
    expect(parsedBody.reply_to).toBe("dana@example.com");
    expect(parsedBody.subject).not.toMatch(/[\r\n]/);
    expect(parsedBody.html).not.toContain("<script>");
    expect(parsedBody.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    const replyResult = await sendInboxReplyEmail({
      toEmail: "dana@example.com",
      toName: "Dana",
      subject: "Re: Architecture Review",
      replyBody: "Thanks for reaching out!\n<b>Details</b>",
      originalSubject: "Review",
      originalMessage: "Original content",
      senderName: "Lou Diamond",
      senderReplyTo: "owner@example.com",
    });

    expect(replyResult.status).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns failed status gracefully without throwing on Resend errors", async () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Rate limit exceeded" }), {
        status: 429,
      })
    );

    const httpErrResult = await sendContactNotificationEmail({
      inquiry: SAMPLE_INQUIRY,
      recipientEmail: "owner@example.com",
    });
    expect(httpErrResult.ok).toBe(false);
    expect(httpErrResult.status).toBe("failed");
    expect(httpErrResult.error).toContain("Rate limit exceeded");

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Socket hang up")
    );
    const netErrResult = await sendContactNotificationEmail({
      inquiry: SAMPLE_INQUIRY,
      recipientEmail: "owner@example.com",
    });
    expect(netErrResult.ok).toBe(false);
    expect(netErrResult.status).toBe("failed");
    expect(netErrResult.error).toContain("Socket hang up");
  });

  it("reports secret-free diagnostics and dispatches Resend test verification emails", async () => {
    const idleDiag = getEmailDiagnostics("fallback@example.com", "Lou");
    expect(idleDiag.configured).toBe(false);
    expect(idleDiag.isSandboxSender).toBe(true);
    expect(idleDiag.notificationRecipient).toBe("fallback@example.com");
    expect(idleDiag.usingFallbackRecipient).toBe(true);

    const skippedTest = await sendTestNotificationEmail({
      recipientEmail: "fallback@example.com",
    });
    expect(skippedTest.status).toBe("skipped");

    process.env.RESEND_API_KEY = "re_live_mock";
    process.env.RESEND_FROM_EMAIL = "Lou <hello@lou.dev>";
    process.env.CONTACT_NOTIFICATION_EMAIL = "alerts@lou.dev";

    const activeDiag = getEmailDiagnostics("fallback@example.com", "Lou");
    expect(activeDiag).toEqual({
      configured: true,
      fromAddress: "Lou <hello@lou.dev>",
      isSandboxSender: false,
      notificationRecipient: "alerts@lou.dev",
      usingFallbackRecipient: false,
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "email_verify_99" }), { status: 200 })
      );

    const testResult = await sendTestNotificationEmail({
      recipientEmail: "fallback@example.com",
      portfolioOwnerName: "Lou",
    });
    expect(testResult).toEqual({
      ok: true,
      status: "sent",
      providerId: "email_verify_99",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
