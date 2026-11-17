import { describe, expect, it } from "vitest";
import { isSafeUploadStoragePath } from "@/lib/backups";
import { getDefaultSeedDatabase } from "@/lib/db";
import {
  contactFormSchema,
  contactReplySchema,
  portfolioRestoreSchema,
} from "@/lib/validation";

describe("Validation & Path Traversal Guards", () => {
  it("validates public contact form submissions and normalizes email casing", () => {
    const valid = contactFormSchema.safeParse({
      name: "  Alex Rivera ",
      email: "  Alex.Rivera@Example.COM ",
      subject: "Full-Stack Role Inquiry",
      message: "Hello Lou, we would love to schedule a technical conversation.",
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.email).toBe("alex.rivera@example.com");
      expect(valid.data.name).toBe("Alex Rivera");
    }

    const badEmail = contactFormSchema.safeParse({
      name: "Alex Rivera",
      email: "not-an-email",
      subject: "Role Inquiry",
      message: "Hello Lou, this has enough characters to pass message length.",
    });
    expect(badEmail.success).toBe(false);

    const shortMessage = contactFormSchema.safeParse({
      name: "Alex Rivera",
      email: "alex@example.com",
      subject: "Hi",
      message: "Too short",
    });
    expect(shortMessage.success).toBe(false);
  });

  it("validates admin inbox reply payloads via contactReplySchema", () => {
    expect(
      contactReplySchema.safeParse({
        id: "msg_123",
        subject: "Re: Architecture Call",
        replyBody: "Thanks for reaching out — happy to connect on Thursday.",
      }).success
    ).toBe(true);

    expect(
      contactReplySchema.safeParse({
        id: "",
        subject: "Re:",
        replyBody: "Thanks for reaching out — happy to connect.",
      }).success
    ).toBe(false);

    expect(
      contactReplySchema.safeParse({
        id: "msg_123",
        subject: "Ok",
        replyBody: "Hey",
      }).success
    ).toBe(false);
  });

  it("validates backup/restore payloads including extended reply fields and analytics", () => {
    const seed = getDefaultSeedDatabase();
    const parsed = portfolioRestoreSchema.safeParse({
      profile: seed.profile,
      projects: seed.projects,
      messages: [
        {
          id: "msg_1",
          name: "Hiring Manager",
          email: "hiring@example.com",
          subject: "Interview",
          message: "Can we talk this week about a senior role?",
          createdAt: "2026-11-15T10:00:00.000Z",
          isRead: true,
          isStarred: false,
          emailDispatchStatus: "sent",
          repliedAt: "2026-11-15T11:00:00.000Z",
          replyCount: 1,
          lastReplySubject: "Re: Interview",
        },
      ],
      analytics: seed.analytics,
    });

    expect(parsed.success).toBe(true);
  });

  it("allows only constrained two-segment upload storage paths", () => {
    expect(isSafeUploadStoragePath("projects/demo-1234.webp")).toBe(true);
    expect(isSafeUploadStoragePath("resume/lou-cv-2026.pdf")).toBe(true);
    expect(isSafeUploadStoragePath("hero/avatar_1.png")).toBe(true);

    expect(isSafeUploadStoragePath("../secret.json")).toBe(false);
    expect(isSafeUploadStoragePath("projects/../secret.png")).toBe(false);
    expect(isSafeUploadStoragePath("projects\\windows.png")).toBe(false);
    expect(isSafeUploadStoragePath("projects/nested/deep.png")).toBe(false);
    expect(isSafeUploadStoragePath("otherfolder/avatar.png")).toBe(false);
    expect(isSafeUploadStoragePath("projects/query?v=1.png")).toBe(false);
  });
});
