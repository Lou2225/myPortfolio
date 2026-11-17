import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  getPortfolioContent,
  StorageReadError,
  StorageWriteError,
} from "@/lib/db";
import {
  deleteContactMessageById,
  getContactMessageById,
  listContactMessages,
  updateContactMessageById,
} from "@/lib/relationalDb";
import {
  getEmailDiagnostics,
  isEmailDispatchConfigured,
  sendInboxReplyEmail,
} from "@/lib/email";
import {
  checkMemoryRateLimit,
  createRateLimitResponse,
  extractNormalizedClientIp,
} from "@/lib/rateLimit";
import { contactReplySchema } from "@/lib/validation";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [messages, content] = await Promise.all([
      listContactMessages(),
      getPortfolioContent(),
    ]);
    const emailDiagnostics = getEmailDiagnostics(
      content.profile.contact.email,
      content.profile.fullName
    );
    return NextResponse.json({
      messages,
      emailConfigured: emailDiagnostics.configured,
      emailDiagnostics,
    });
  } catch (err) {
    if (err instanceof StorageReadError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to load inbox messages." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      isRead?: boolean;
      isStarred?: boolean;
    };

    if (!body.id) {
      return NextResponse.json(
        { error: "Message ID is required." },
        { status: 400 }
      );
    }

    const { messages } = await updateContactMessageById(body.id, {
      isRead: body.isRead,
      isStarred: body.isStarred,
    });

    return NextResponse.json({
      success: true,
      messages,
    });
  } catch (err) {
    if (err instanceof StorageWriteError || err instanceof StorageReadError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to update message" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clientIp = extractNormalizedClientIp(request.headers);
    const rate = checkMemoryRateLimit(`admin-reply:${clientIp}`, {
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!rate.allowed) {
      return createRateLimitResponse(
        rate.retryAfterSec,
        "Reply rate limit reached. Wait a moment before sending more replies."
      );
    }

    if (!isEmailDispatchConfigured()) {
      return NextResponse.json(
        {
          error:
            "Server email dispatch is not configured (set RESEND_API_KEY). Use the Mail App Reply fallback instead.",
        },
        { status: 422 }
      );
    }

    const body = await request.json();
    const parsed = contactReplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid reply message details.",
        },
        { status: 400 }
      );
    }

    const target = await getContactMessageById(parsed.data.id);
    if (!target) {
      return NextResponse.json(
        { error: "Target inquiry could not be found." },
        { status: 404 }
      );
    }

    const content = await getPortfolioContent();
    const dispatch = await sendInboxReplyEmail({
      toEmail: target.email,
      toName: target.name,
      subject: parsed.data.subject,
      replyBody: parsed.data.replyBody,
      originalSubject: target.subject,
      originalMessage: target.message,
      senderName: content.profile.fullName,
      senderReplyTo: content.profile.contact.email,
    });

    if (!dispatch.ok) {
      return NextResponse.json(
        { error: dispatch.error || "Email provider failed to send reply." },
        { status: 502 }
      );
    }

    const { messages } = await updateContactMessageById(target.id, {
      isRead: true,
      repliedAt: new Date().toISOString(),
      replyCount: (target.replyCount ?? 0) + 1,
      lastReplySubject: parsed.data.subject,
    });

    return NextResponse.json({
      success: true,
      providerId: dispatch.providerId,
      messages,
    });
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to dispatch email reply." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Message ID required" }, { status: 400 });
    }

    const messages = await deleteContactMessageById(id);

    return NextResponse.json({
      success: true,
      messages,
    });
  } catch (err) {
    if (err instanceof StorageWriteError || err instanceof StorageReadError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 }
    );
  }
}
