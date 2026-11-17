import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addContactMessage,
  getPortfolioContent,
  StorageWriteError,
} from "@/lib/db";
import { updateContactMessageById } from "@/lib/relationalDb";
import { sendContactNotificationEmail } from "@/lib/email";
import {
  checkMemoryRateLimit,
  createRateLimitResponse,
  extractNormalizedClientIp,
} from "@/lib/rateLimit";
import { contactFormSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const clientIp = extractNormalizedClientIp(request.headers);
    const rate = checkMemoryRateLimit(`contact:${clientIp}`, {
      limit: 6,
      windowMs: 15 * 60 * 1000,
    });
    if (!rate.allowed) {
      return createRateLimitResponse(
        rate.retryAfterSec,
        "Too many inquiries sent from this network. Please wait a few minutes."
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Silent honeypot drop BEFORE schema validation so automated bots receive no failure signal or storage write
    if (
      body &&
      typeof body === "object" &&
      typeof body.honeypot === "string" &&
      body.honeypot.trim().length > 0
    ) {
      return NextResponse.json({
        success: true,
        message: "Thank you for reaching out.",
      });
    }

    const validated = contactFormSchema.parse(body);

    const savedMsg = await addContactMessage({
      name: validated.name,
      email: validated.email,
      subject: validated.subject,
      message: validated.message,
    });

    // Best-effort transactional notification email (never blocks or rolls back stored inquiry)
    let notificationSent = false;
    let emailStatus: "sent" | "skipped" | "failed" = "skipped";
    try {
      const content = await getPortfolioContent();
      const dispatch = await sendContactNotificationEmail({
        inquiry: savedMsg,
        recipientEmail: content.profile.contact.email,
        portfolioOwnerName: content.profile.fullName,
      });
      emailStatus = dispatch.status;
      notificationSent = dispatch.ok;

      await updateContactMessageById(savedMsg.id, {
        emailDispatchStatus: dispatch.status,
      });
    } catch (emailErr) {
      emailStatus = "failed";
      console.error("Contact email notification error:", emailErr);
    }

    return NextResponse.json({
      success: true,
      id: savedMsg.id,
      notificationSent,
      emailStatus,
      message:
        "Message received and stored in the Portfolio Inbox! Lou will get back to you shortly.",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: err.issues[0]?.message || "Validation failed",
        },
        { status: 422 }
      );
    }

    if (err instanceof StorageWriteError) {
      console.error("Contact form StorageWriteError:", err.message);
      return NextResponse.json(
        {
          success: false,
          error:
            "Portfolio inbox service is temporarily unavailable. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
