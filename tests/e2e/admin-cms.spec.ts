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

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Administrator Login/i })
    ).toBeVisible({ timeout: 15000 });

    await page.locator("#admin-password").fill("definitely-wrong-pass");

    const failedAuthPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/auth") &&
        res.request().method() === "POST" &&
        res.request().postData()?.includes('"password"') === true
    );

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
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Administrator Login/i })
    ).toBeVisible({ timeout: 15000 });

    const loginResPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/auth") &&
        res.request().method() === "POST" &&
        res.request().postData()?.includes('"password"') === true
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

    // Verify ProfileDropdown omits Secret Logo Redirect & Reset Content controls.
    await page
      .getByRole("button", { name: /Open Administrator Profile Menu/i })
      .click();
    await expect(
      page.getByRole("button", { name: /Logout of CMS/i })
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/Secret Logo Redirect/i)
    ).not.toBeVisible();
    await expect(
      page.getByText(/Reset Content to Seed Defaults/i)
    ).not.toBeVisible();
    await page.keyboard.press("Escape");

    // Navigate to Inbox tab cleanly and verify Sandbox sender label is absent.
    await page.goto("/admin?tab=inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Sandbox sender/i)).not.toBeVisible();
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
    await expect(
      replyDialog.getByText(/Transactional email is not configured/i)
    ).toBeVisible();
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
    await page.goto("/admin?tab=profile", { waitUntil: "domcontentloaded" });
    const monogramInput = page.getByLabel(/Monogram Fallback/i).first();
    await expect(monogramInput).toBeVisible({ timeout: 15000 });
    const originalMonogram = await monogramInput.inputValue();
    const updatedMonogram = originalMonogram === "E9" ? "LV" : "E9";

    await monogramInput.fill(updatedMonogram);
    await expect(
      page.getByRole("main").getByRole("button", { name: /Save & Publish/i })
    ).toHaveCount(0);
    await page.getByTestId("brand-portal-save").click();
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

    // Restore original monogram cleanly via Brand Portal Save button.
    await monogramInput.fill(originalMonogram);
    await page.getByTestId("brand-portal-save").click();
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

    // Verify circular 3-dots role action menu matches input height and no desktop drag handle exists.
    const roleDragHandle = page.getByRole("button", {
      name: /Drag or use arrow keys to reorder role 1/i,
    });
    await expect(roleDragHandle).toHaveCount(0);

    const roleInput1 = page.getByRole("textbox", { name: /Role Title 01/i });
    const roleMenuBtn = page.getByRole("button", { name: "Actions for role 1" });
    await expect(roleMenuBtn).toBeVisible();
    const roleFieldMetrics = await roleMenuBtn.evaluate((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        borderRadius: parseFloat(style.borderRadius),
      };
    });
    const roleInputBox = await roleInput1.boundingBox();
    expect(roleInputBox).not.toBeNull();
    expect(roleFieldMetrics.width).toBeCloseTo(roleFieldMetrics.height, 0);
    expect(roleFieldMetrics.height).toBeCloseTo(roleInputBox!.height, 0);
    expect(roleFieldMetrics.borderRadius).toBeGreaterThanOrEqual(
      roleFieldMetrics.width / 2 - 1
    );

    await roleMenuBtn.click();
    const roleMenu = page.getByRole("menu", { name: "Actions for role 1" });
    await expect(roleMenu).toBeVisible({ timeout: 5000 });
    await expect(
      roleMenu.getByRole("menuitem", { name: /Move Earlier/i })
    ).toBeVisible();
    await expect(
      roleMenu.getByRole("menuitem", { name: /Move Later/i })
    ).toBeVisible();
    await expect(
      roleMenu.getByRole("menuitem", { name: /Remove Role/i })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(roleMenu).not.toBeVisible({ timeout: 5000 });

    // Discard staged avatar draft via Brand Portal so unsaved-changes guard stays clean before navigating.
    await page.getByTestId("brand-portal-discard").click();
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

    // Verify Trusted Devices & Cross-Device Pairing height-limited container and Load more button.
    const mockedDevices = Array.from({ length: 5 }, (_, idx) => ({
      id: `dev_mock_${idx + 1}`,
      name: `Trusted Workstation ${idx + 1}`,
      model: "Desktop Browser",
      platform: "Windows",
      osVersion: "11",
      browser: "Chrome",
      architecture: "x86_64",
      cpuCores: 8,
      gpuRenderer: null,
      screenMetrics: "1920x1080",
      timezone: "Asia/Manila",
      deviceType: "desktop",
      keyThumbprint: `K${idx + 1}`,
      publicKeySpki: null,
      ipMasked: "127.0.0.1",
      userAgent: "Mozilla/5.0",
      trustSource: "login",
      status: "active",
      createdAt: "2026-11-17T00:00:00.000Z",
      lastSeenAt: "2026-11-17T00:00:00.000Z",
      revokedAt: null,
    }));
    await page.route("**/api/admin/devices", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sessionEpoch: 1,
            stealthGateEnabled: false,
            stealthKeyConfigured: false,
            totpEnabled: false,
            currentDeviceId: "dev_mock_1",
            activeDeviceCount: 5,
            devices: mockedDevices,
            auditLog: [],
            pendingPairings: [],
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/admin?tab=settings&section=security", {
      waitUntil: "domcontentloaded",
    });
    const trustedDevicesCard = page
      .locator("[data-cascade]")
      .filter({
        has: page.getByRole("heading", {
          name: /Trusted Devices & Cross-Device Pairing/i,
        }),
      })
      .first();
    await expect(
      trustedDevicesCard.getByText("Trusted Workstation 1")
    ).toBeVisible({ timeout: 15000 });
    await expect(
      trustedDevicesCard.getByText("Trusted Workstation 3")
    ).toBeVisible();
    await expect(
      trustedDevicesCard.getByText("Trusted Workstation 4")
    ).not.toBeVisible();
    await expect(
      trustedDevicesCard.getByText("Showing 3 of 5 devices")
    ).toBeVisible();

    await trustedDevicesCard
      .getByRole("button", { name: /^Load more$/i })
      .click();
    await expect(
      trustedDevicesCard.getByText("Trusted Workstation 5")
    ).toBeVisible();
    await expect(
      trustedDevicesCard.getByRole("button", { name: /^Load more$/i })
    ).not.toBeVisible();
    const scrollContainerBox = await trustedDevicesCard
      .locator("[data-lenis-prevent]")
      .first()
      .boundingBox();
    expect(scrollContainerBox).not.toBeNull();
    if (scrollContainerBox) {
      expect(scrollContainerBox.height).toBeLessThanOrEqual(425);
    }

    // Verify QR pairing modal layout has no localhost override UI and closes cleanly.
    await page
      .getByRole("button", { name: /Pair Device via QR \/ Link/i })
      .click();
    const qrDialog = page.getByRole("dialog", {
      name: /Pair Mobile Device via QR/i,
    });
    await expect(qrDialog).toBeVisible({ timeout: 10000 });
    await expect(
      qrDialog.getByText(/Verification PIN \(Never Stored in QR\)/i)
    ).toBeVisible();
    await expect(qrDialog.getByText(/Running on localhost/i)).not.toBeVisible();
    await expect(qrDialog.getByText(/QR Base Origin/i)).not.toBeVisible();
    await qrDialog
      .getByRole("button", { name: /Close QR pairing dialog/i })
      .click();
    await expect(qrDialog).not.toBeVisible({ timeout: 10000 });

    await page.unroute("**/api/admin/devices");
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
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Administrator Login/i })
    ).toBeVisible({ timeout: 15000 });

    const loginResPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/auth") &&
        res.request().method() === "POST" &&
        res.request().postData()?.includes('"password"') === true
    );

    await page.locator("#admin-password").fill(E2E_ADMIN_PASSWORD);
    await page
      .getByRole("button", { name: /Unlock Portfolio Manager/i })
      .click();
    const loginRes = await loginResPromise;
    expect(loginRes.status()).toBe(200);

    await page.goto("/admin?tab=overview", { waitUntil: "domcontentloaded" });

    // Command Row: 1-Card Metrics Matrix (Left) + Combined Filters, Checkbox Slicers & Reports (Right).
    const kpiSection = page.getByRole("region", {
      name: /Key Performance Metrics/i,
    });
    const commandSection = page.getByRole("region", {
      name: /Analytics Filters, Slicers and Reports/i,
    });

    await expect(kpiSection).toBeVisible({ timeout: 15000 });
    await expect(commandSection).toBeVisible({ timeout: 15000 });

    // Verify right-edge operational tooltip renders horizontally inside viewport (never crushed vertically).
    await commandSection
      .getByRole("button", { name: /Refresh analytics time calculations/i })
      .hover();
    const syncTooltip = page.getByRole("tooltip", {
      name: /Sync live time window/i,
    });
    await expect(syncTooltip).toBeVisible({ timeout: 5000 });
    const tipBox = await syncTooltip.boundingBox();
    const vw = page.viewportSize()?.width ?? 1280;
    expect(tipBox).not.toBeNull();
    if (tipBox) {
      expect(tipBox.width).toBeGreaterThan(tipBox.height);
      expect(tipBox.x).toBeGreaterThanOrEqual(8);
      expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(vw - 8);
    }

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

    // Toggle Counting Methodology between Sessions and Events views.
    await commandSection
      .getByRole("button", { name: /Switch to Events view/i })
      .click();
    await expect(kpiSection.getByText(/Page Views/i)).toBeVisible();
    await commandSection
      .getByRole("button", { name: /Switch to Sessions view/i })
      .click();
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

  test("connects Admin jumpscare toggle & trigger behaviors to public portfolio and pauses contact scroll", async ({
    page,
    request,
  }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Administrator Login/i })
    ).toBeVisible({ timeout: 15000 });

    const loginResPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/auth") &&
        res.request().method() === "POST" &&
        res.request().postData()?.includes('"password"') === true
    );
    await page.locator("#admin-password").fill(E2E_ADMIN_PASSWORD);
    await page
      .getByRole("button", { name: /Unlock Portfolio Manager/i })
      .click();
    expect((await loginResPromise).status()).toBe(200);

    // 1. Navigate to Appearance Studio -> enable Scare On + Get In Touch + Contact Me trigger via UI
    await page.goto("/admin?tab=settings&section=appearance", {
      waitUntil: "domcontentloaded",
    });

    const scareSwitch = page.getByRole("switch", {
      name: /Enable jumpscare Easter egg on public portfolio/i,
    });
    await scareSwitch.scrollIntoViewIfNeeded();
    if ((await scareSwitch.getAttribute("aria-checked")) !== "true") {
      await scareSwitch.click();
    }
    await page
      .getByRole("button", { name: /Get In Touch \+ Contact Me/i })
      .click();

    const publishResPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/portfolio") &&
        res.request().method() === "PUT"
    );
    await page.getByTestId("brand-portal-save").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Save & Publish$/i })
      .click();
    expect((await publishResPromise).status()).toBe(200);

    // Verify GET /api/portfolio reflects live jumpscare state immediately
    const apiGetInTouch = await (await request.get("/api/portfolio")).json();
    expect(apiGetInTouch.appearance.jumpscareEnabled).toBe(true);
    expect(apiGetInTouch.appearance.jumpscareTrigger).toBe("get-in-touch");

    // 2. Test Get In Touch + Contact Me on public "/" (must show scare overlay AND pause scroll at top)
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('aside[aria-label="Site loader"]')
    ).not.toBeAttached({ timeout: 15000 });

    await page
      .locator("header")
      .getByRole("link", { name: /Get In Touch/i })
      .click();
    const scareOverlay = page.locator('[data-jumpscare-overlay="true"]');
    await expect(scareOverlay).toBeVisible({ timeout: 5000 });
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(80);
    await page.keyboard.press("Escape");
    await expect(scareOverlay).not.toBeVisible({ timeout: 5000 });

    await page
      .locator("#top")
      .getByRole("link", { name: /Contact Me/i })
      .click();
    await expect(scareOverlay).toBeVisible({ timeout: 5000 });
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(80);
    await scareOverlay.click();
    await expect(scareOverlay).not.toBeVisible({ timeout: 5000 });

    // 3. Switch to `first-click` in Admin and verify first click anywhere triggers scare
    await page.goto("/admin?tab=settings&section=appearance", {
      waitUntil: "domcontentloaded",
    });
    const firstClickBtn = page.getByRole("button", {
      name: /Armed First Click/i,
    });
    await firstClickBtn.scrollIntoViewIfNeeded();
    await firstClickBtn.click();

    const publishFirstClick = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/portfolio") &&
        res.request().method() === "PUT"
    );
    await page.getByTestId("brand-portal-save").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Save & Publish$/i })
      .click();
    expect((await publishFirstClick).status()).toBe(200);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('aside[aria-label="Site loader"]')
    ).not.toBeAttached({ timeout: 15000 });
    await page
      .locator("#top")
      .getByRole("link", { name: /View Systems/i })
      .click();
    await expect(scareOverlay).toBeVisible({ timeout: 5000 });
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(80);
    await page.keyboard.press("Escape");

    // 4. Restore Scare Off cleanly via API while keeping E2E state spotless
    await page.goto("/admin?tab=settings&section=appearance", {
      waitUntil: "domcontentloaded",
    });
    const restoreSwitch = page.getByRole("switch", {
      name: /Enable jumpscare Easter egg on public portfolio/i,
    });
    await restoreSwitch.scrollIntoViewIfNeeded();
    await restoreSwitch.click();
    const publishOff = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/portfolio") &&
        res.request().method() === "PUT"
    );
    await page.getByTestId("brand-portal-save").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Save & Publish$/i })
      .click();
    expect((await publishOff).status()).toBe(200);
  });
});
