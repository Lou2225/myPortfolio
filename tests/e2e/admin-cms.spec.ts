import { expect, test } from "@playwright/test";

const E2E_ADMIN_PASSWORD = "E2E-Test-Password-2026!";

test.describe("Admin Auth, Inbox Reply Modal & CMS CRUD E2E", () => {
  test("fails closed on unauthenticated admin endpoints and rejects wrong login password", async ({
    page,
    request,
  }) => {
    const protectedEndpoints = [
      { method: "GET", url: "/api/admin/portfolio" },
      { method: "GET", url: "/api/admin/messages" },
      { method: "GET", url: "/api/admin/system" },
    ] as const;

    for (const ep of protectedEndpoints) {
      const res = await request.fetch(ep.url, { method: ep.method });
      expect(res.status()).toBe(401);
    }

    const postMsgRes = await request.post("/api/admin/messages", {
      data: {
        id: "msg_fake",
        subject: "Unauthorized",
        replyBody: "Should be blocked without admin cookie.",
      },
    });
    expect(postMsgRes.status()).toBe(401);

    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /Administrator Login/i })
    ).toBeVisible({ timeout: 15000 });

    const failedAuthPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/auth") &&
        res.request().method() === "POST"
    );

    await page.locator("#admin-password").fill("definitely-wrong-pass");
    await page
      .getByRole("button", { name: /Unlock Portfolio Manager/i })
      .click();

    const failedAuthRes = await failedAuthPromise;
    expect(failedAuthRes.status()).toBe(401);

    await expect(
      page.getByText(/Invalid administrator password/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test("logs into /admin, manages Inbox + Reply modal, and edits & restores CMS profile", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const inquirySubject = `E2E Inquiry ${stamp}`;
    const honeypotSubject = `Honeypot Trap ${stamp}`;

    // Seed real inquiry and verify honeypot silently discards spam without polluting inbox.
    const realContactRes = await request.post("/api/contact", {
      data: {
        name: "Maya Recruiter",
        email: "maya@example.com",
        subject: inquirySubject,
        message: "We would love to discuss a full-stack architecture role with you.",
      },
    });
    expect(realContactRes.status()).toBe(200);

    const botContactRes = await request.post("/api/contact", {
      data: {
        name: "Spam Bot",
        email: "bot@example.com",
        subject: honeypotSubject,
        message: "Automated bot message body that should never hit inbox.",
        honeypot: "http://spam-link.example",
      },
    });
    expect(botContactRes.status()).toBe(200);

    // Log in via AdminLogin form (wait for full hydration before submit).
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /Administrator Login/i })
    ).toBeVisible({ timeout: 15000 });

    const loginResPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/auth") &&
        res.request().method() === "POST"
    );

    await page.locator("#admin-password").fill(E2E_ADMIN_PASSWORD);
    await page
      .getByRole("button", { name: /Unlock Portfolio Manager/i })
      .click();

    const loginRes = await loginResPromise;
    expect(loginRes.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: /Administrator Login/i })
    ).not.toBeVisible({ timeout: 15000 });

    // Navigate to Inbox tab cleanly.
    await page.goto("/admin?tab=inbox", { waitUntil: "networkidle" });
    const msgHeading = page.getByRole("heading", { name: inquirySubject });
    await expect(msgHeading).toBeVisible({ timeout: 15000 });

    // Confirm honeypot spam was silently discarded and never reached Inbox.
    await expect(
      page.getByRole("heading", { name: honeypotSubject })
    ).not.toBeVisible();

    const msgCard = page
      .locator("article")
      .filter({ has: msgHeading })
      .first();

    // Toggle Read -> Mark Unread.
    await msgCard.getByRole("button", { name: /^Mark Read$/i }).click();
    await expect(
      msgCard.getByRole("button", { name: /^Mark Unread$/i })
    ).toBeVisible({ timeout: 10000 });

    // Toggle Star.
    await msgCard.getByRole("button", { name: /Star message/i }).click();
    await expect(
      msgCard.getByRole("button", { name: /Unstar message/i })
    ).toBeVisible({ timeout: 10000 });

    // Open Reply Modal and verify fallback + mailto link + original preview.
    await msgCard.getByRole("button", { name: /^Reply$/i }).click();
    const replyDialog = page.getByRole("dialog");
    await expect(replyDialog).toBeVisible({ timeout: 10000 });
    await expect(
      replyDialog.getByRole("heading", { name: /Reply To Inquiry/i })
    ).toBeVisible();
    await expect(replyDialog.getByText(/Mailto Fallback/i)).toBeVisible();
    await expect(replyDialog.locator("#reply-modal-subject")).toHaveValue(
      `Re: ${inquirySubject}`
    );

    const mailtoLink = replyDialog.getByRole("link", {
      name: /Open Mail Client/i,
    });
    await expect(mailtoLink).toHaveAttribute(
      "href",
      /^mailto:maya@example\.com\?/
    );

    await replyDialog.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(replyDialog).not.toBeVisible({ timeout: 10000 });

    // Delete test inquiry cleanly through ConfirmModal.
    await msgCard.getByRole("button", { name: /Delete message/i }).click();
    const confirmDialog = page.getByRole("dialog");
    await expect(
      confirmDialog.getByRole("heading", { name: /Delete Message Permanently/i })
    ).toBeVisible({ timeout: 10000 });
    await confirmDialog.getByRole("button", { name: /Delete Message/i }).click();

    await expect(msgHeading).not.toBeVisible({ timeout: 10000 });

    // Switch to Profile tab, edit Monogram Fallback, publish live, verify /api/portfolio, then restore.
    await page.goto("/admin?tab=profile", { waitUntil: "networkidle" });
    const monogramInput = page.getByLabel(/Monogram Fallback/i);
    await expect(monogramInput).toBeVisible({ timeout: 15000 });
    const originalMonogram = await monogramInput.inputValue();
    const updatedMonogram = originalMonogram === "E9" ? "LV" : "E9";

    await monogramInput.fill(updatedMonogram);
    await page
      .getByRole("main")
      .getByRole("button", { name: /Save & Publish/i })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Save & Publish/i })
      .click();

    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10000 });

    await expect
      .poll(
        async () => {
          const res = await request.get("/api/portfolio");
          const json = (await res.json()) as { profile: { monogram: string } };
          return json.profile.monogram;
        },
        { timeout: 10000 }
      )
      .toBe(updatedMonogram);

    // Restore original monogram cleanly.
    await monogramInput.fill(originalMonogram);
    await page
      .getByRole("main")
      .getByRole("button", { name: /Save & Publish/i })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Save & Publish/i })
      .click();

    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10000 });

    await expect
      .poll(
        async () => {
          const res = await request.get("/api/portfolio");
          const json = (await res.json()) as { profile: { monogram: string } };
          return json.profile.monogram;
        },
        { timeout: 10000 }
      )
      .toBe(originalMonogram);

    // Verify Profile Card 3 (Avatar) stays overflow-free when staging a long filename at 1366px.
    await page.setViewportSize({ width: 1366, height: 768 });
    const avatarCard = page
      .locator("div.rounded-\\(--radius-card\\)")
      .filter({
        has: page.getByRole("heading", {
          name: /3\. Hero Portrait Cutout \(Avatar\)/i,
        }),
      })
      .first();
    await expect(avatarCard).toBeVisible();

    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64"
    );
    await avatarCard.locator('input[type="file"]').setInputFiles({
      name: "1Avatar-removebg-preview-very-long-filename.png",
      mimeType: "image/png",
      buffer: tinyPng,
    });
    const cropDialog = page.getByRole("dialog", {
      name: /Edit Portrait Image Path or URL/i,
    });
    await expect(cropDialog).toBeVisible({ timeout: 5000 });
    await cropDialog.getByRole("button", { name: /Save to Draft/i }).click();
    await expect(cropDialog).not.toBeVisible({ timeout: 5000 });
    await expect(avatarCard.getByText(/STAGED/i)).toBeVisible({ timeout: 5000 });

    const overflowCheck = await avatarCard.evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const buttons = Array.from(card.querySelectorAll("button"));
      const clipped = buttons
        .map((btn) => {
          const r = btn.getBoundingClientRect();
          return {
            label: btn.getAttribute("aria-label") || btn.textContent?.trim() || "",
            rightDiff: r.right - cardRect.right,
            leftDiff: cardRect.left - r.left,
          };
        })
        .filter((b) => b.rightDiff > 1 || b.leftDiff > 1);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        clipped,
      };
    });
    expect(overflowCheck.scrollWidth).toBeLessThanOrEqual(overflowCheck.innerWidth);
    expect(overflowCheck.clipped).toEqual([]);

    // Verify circular Up, Down, and Remove buttons keep consistent rounded-full geometry.
    for (const label of ["Move role 1 earlier", "Move role 1 later", "Remove role 1"]) {
      const btn = page.getByRole("button", { name: label });
      await expect(btn).toBeVisible();
      const shape = await btn.evaluate((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          borderRadius: parseFloat(style.borderRadius),
        };
      });
      expect(shape.width).toBeCloseTo(shape.height, 0);
      expect(shape.borderRadius).toBeGreaterThanOrEqual(shape.width / 2 - 1);
    }

    // Discard staged avatar draft so unsaved-changes guard stays clean before navigating.
    await page
      .getByRole("main")
      .getByRole("button", { name: /^Discard$/i })
      .click();
    const discardDialog = page.getByRole("dialog");
    await expect(discardDialog).toBeVisible({ timeout: 5000 });
    await discardDialog
      .getByRole("button", { name: /Discard Changes/i })
      .click();
    await expect(discardDialog).not.toBeVisible({ timeout: 5000 });

    // Navigate /admin -> / -> /admin via Brand Portal orb and verify warm cache skips dashboard skeleton.
    const toPublicOrb = page.getByRole("button", {
      name: /Return to Public Portfolio/i,
    });
    await expect(toPublicOrb).toHaveClass(/cursor-pointer/, { timeout: 10000 });
    await toPublicOrb.click();
    await page.waitForURL("**/", { timeout: 15000 });
    await expect(
      page.locator('aside[aria-label="Site loader"]')
    ).not.toBeVisible({ timeout: 10000 });

    await page.evaluate(() => {
      (window as unknown as { __sawAdminSkeleton?: boolean }).__sawAdminSkeleton =
        false;
      const obs = new MutationObserver(() => {
        if (
          document.querySelector(
            '[aria-label="Loading Portfolio Management Dashboard"]'
          )
        ) {
          (
            window as unknown as { __sawAdminSkeleton?: boolean }
          ).__sawAdminSkeleton = true;
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      (
        window as unknown as { __adminSkeletonObs?: MutationObserver }
      ).__adminSkeletonObs = obs;
    });

    const toAdminOrb = page.getByRole("button", {
      name: /Open Portfolio Manager/i,
    });
    await expect(toAdminOrb).toHaveClass(/cursor-pointer/, { timeout: 10000 });
    await toAdminOrb.click();
    await page.waitForURL("**/admin**", { timeout: 15000 });
    await expect(
      page.getByRole("region", { name: /Key Performance Metrics/i })
    ).toBeVisible({ timeout: 15000 });

    const sawSkeletonOnRevisit = await page.evaluate(() => {
      const w = window as unknown as {
        __sawAdminSkeleton?: boolean;
        __adminSkeletonObs?: MutationObserver;
      };
      w.__adminSkeletonObs?.disconnect();
      return Boolean(w.__sawAdminSkeleton);
    });
    expect(sawSkeletonOnRevisit).toBe(false);
  });

  test("operates Overview command filters, custom date picker, device/source slicers & unified KPI card", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    // Seed real desktop (github.com) & mobile (direct) telemetry events with a standard browser UA.
    const browserHeaders = {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
    };

    const seedRes = await request.post("/api/analytics", {
      headers: browserHeaders,
      data: {
        events: [
          {
            type: "page_view",
            target: "/",
            sessionId: `e2e_desk_${stamp}`,
            device: "desktop",
            referrer: "github.com",
          },
          {
            type: "project_click",
            target: "capstone-system",
            sessionId: `e2e_desk_${stamp}`,
            device: "desktop",
            referrer: "github.com",
          },
          {
            type: "page_view",
            target: "/",
            sessionId: `e2e_mob_${stamp}`,
            device: "mobile",
            referrer: "direct",
          },
        ],
      },
    });
    expect(seedRes.status()).toBe(200);

    // Log in to /admin cleanly.
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /Administrator Login/i })
    ).toBeVisible({ timeout: 15000 });

    const loginResPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/auth") &&
        res.request().method() === "POST"
    );

    await page.locator("#admin-password").fill(E2E_ADMIN_PASSWORD);
    await page
      .getByRole("button", { name: /Unlock Portfolio Manager/i })
      .click();
    const loginRes = await loginResPromise;
    expect(loginRes.status()).toBe(200);

    await page.goto("/admin?tab=overview", { waitUntil: "networkidle" });

    // Command Row: 1-Card Metrics Matrix (Left) + Combined Filters, Checkbox Slicers & Reports (Right).
    const kpiSection = page.getByRole("region", {
      name: /Key Performance Metrics/i,
    });
    const commandSection = page.getByRole("region", {
      name: /Analytics Filters, Slicers and Reports/i,
    });

    await expect(kpiSection).toBeVisible({ timeout: 15000 });
    await expect(commandSection).toBeVisible({ timeout: 15000 });

    // Verify all 4 KPI sections inside the unified 1-card grid (Hero + 3 companion rows).
    await expect(kpiSection.getByText(/Unique Sessions/i)).toBeVisible();
    await expect(kpiSection.getByText(/Project Clicks/i)).toBeVisible();
    await expect(kpiSection.getByText(/Inquiries & Goals/i)).toBeVisible();
    await expect(kpiSection.getByText(/Published Inventory/i)).toBeVisible();

    // Open Date Filter Dropdown -> click Quick Preselect 24H, then open again -> Today.
    await commandSection
      .getByRole("button", { name: /Filter analytics date range/i })
      .click();
    await page.getByRole("button", { name: /^24H$/i }).click();
    await expect(
      commandSection.getByRole("button", { name: /Filter analytics date range/i })
    ).toContainText(/Last 24 Hours/i);

    await commandSection
      .getByRole("button", { name: /Filter analytics date range/i })
      .click();
    await page.getByRole("button", { name: /^Today$/i }).click();

    // Switch Counting Methodology to Events then back to Sessions.
    const modeTabs = commandSection.getByRole("tablist", {
      name: /Counting methodology/i,
    });
    await modeTabs.getByRole("tab", { name: "Events" }).click();
    await expect(kpiSection.getByText(/Page Views/i)).toBeVisible();
    await modeTabs.getByRole("tab", { name: "Sessions" }).click();
    await expect(kpiSection.getByText(/Unique Sessions/i)).toBeVisible();

    // Multi-select Checkbox Slicers: check Desktop device + github.com source, verify checked state.
    const deviceGroup = commandSection.getByRole("group", {
      name: /Slice telemetry by device type/i,
    });
    const desktopCheckbox = deviceGroup.getByRole("checkbox", {
      name: /Desktop/i,
    });
    await desktopCheckbox.click();
    await expect(desktopCheckbox).toHaveAttribute("aria-checked", "true");

    const sourceGroup = commandSection.getByRole("group", {
      name: /Slice telemetry by referral source/i,
    });
    const githubCheckbox = sourceGroup.getByRole("checkbox", {
      name: /github\.com/i,
    });
    await githubCheckbox.click();
    await expect(githubCheckbox).toHaveAttribute("aria-checked", "true");
    await expect(kpiSection.getByText(/Sliced View/i)).toBeVisible();

    // Verify Reset button clears active slicers and date window cleanly.
    await commandSection
      .getByRole("button", { name: /Reset analytics filters/i })
      .click();
    await expect(desktopCheckbox).toHaveAttribute("aria-checked", "false");
    await expect(githubCheckbox).toHaveAttribute("aria-checked", "false");

    // Verify Operations & Reports controls inside the same command card.
    await commandSection
      .getByRole("button", { name: /Copy formatted KPI brief/i })
      .click();
    await commandSection
      .getByRole("button", { name: /Clear telemetry logs/i })
      .click();
    const clearDialog = page.getByRole("dialog");
    await expect(
      clearDialog.getByRole("heading", { name: /Clear Analytics Telemetry Logs\?/i })
    ).toBeVisible({ timeout: 10000 });
    await clearDialog.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(clearDialog).not.toBeVisible({ timeout: 10000 });
  });
});
