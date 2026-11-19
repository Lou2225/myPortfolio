import { expect, test } from "@playwright/test";

test.describe("Public Portfolio & Offline Queue E2E", () => {
  test("renders public portfolio without runtime errors and enforces public DTO redaction", async ({
    page,
    request,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // SSR HTML must mount Preloader as a full-viewport curtain (not a navbar strip).
    const ssrRes = await request.get("/");
    expect(ssrRes.status()).toBe(200);
    const ssrHtml = await ssrRes.text();
    expect(ssrHtml).toMatch(/aria-label="Site loader"[^>]*class="[^"]*fixed inset-0/);

    // Simulate an external visitor on a different physical machine so cross-browser
    // same-host recognition from earlier admin E2E tests does not auto-trust this context.
    await page.addInitScript(() => {
      Object.defineProperty(window.screen, "width", { get: () => 1440 });
      Object.defineProperty(window.screen, "height", { get: () => 900 });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Wait for Preloader wipe to finish and hero heading to become interactive.
    const heroHeading = page.locator("h1").first();
    await expect(heroHeading).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator('aside[aria-label="Site loader"]')
    ).not.toBeAttached({ timeout: 10000 });
    await expect(page.locator("#projects")).toBeAttached();
    await expect(page.locator("#contact")).toBeAttached();

    // Scroll down and verify BrandPortal does not trigger scroll-to-top for unregistered visitors.
    await page.locator("#contact").scrollIntoViewIfNeeded();
    const scrollYBeforePortalClick = await page.evaluate(() => window.scrollY);
    expect(scrollYBeforePortalClick).toBeGreaterThan(200);

    const brandPortalCapsule = page
      .locator('[role="status"]')
      .filter({ hasText: /Portfolio Live/i });
    await expect(brandPortalCapsule).toBeVisible();
    await expect(brandPortalCapsule).not.toContainText(/Click orb to scroll top/i);
    await expect(brandPortalCapsule.getByRole("button")).toHaveCount(0);
    await brandPortalCapsule.click();
    await page.waitForTimeout(250);
    const scrollYAfterPortalClick = await page.evaluate(() => window.scrollY);
    expect(scrollYAfterPortalClick).toBeGreaterThan(200);

    // Public portfolio API must never expose messages, analytics, birthDate, or PSGC street/address PII.
    const apiRes = await request.get("/api/portfolio");
    expect(apiRes.status()).toBe(200);
    const dto = (await apiRes.json()) as {
      profile: {
        birthDate?: string;
        contact: Record<string, unknown>;
      };
      projects: Array<{ published?: boolean }>;
      messages?: unknown;
      analytics?: unknown;
    };

    expect(dto.messages).toBeUndefined();
    expect(dto.analytics).toBeUndefined();
    expect(dto.profile.birthDate).toBe("");
    expect(dto.profile.contact.address).toBeUndefined();
    expect(dto.projects.every((p) => p.published !== false)).toBe(true);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("validates contact inputs, queues offline outbox messages, and auto-flushes on reconnect", async ({
    page,
    context,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15000 });

    const contactSection = page.locator("#contact");
    await contactSection.scrollIntoViewIfNeeded();

    const nameInput = page.locator("#contact-name");
    const emailInput = page.locator("#contact-email");
    const subjectInput = page.locator("#contact-subject");
    const messageInput = page.locator("#contact-message");
    const submitBtn = contactSection.getByRole("button", {
      name: /transmit message/i,
    });

    await expect(nameInput).toBeVisible({ timeout: 10000 });

    // Empty submit must stay on form and block dispatch.
    await submitBtn.click();
    await expect(
      page.getByText(/Message Dispatched!/i)
    ).not.toBeVisible();
    await expect(nameInput).toBeVisible();

    // Simulate offline submission -> Saved to Offline Outbox.
    const uniqueSubject = `Offline E2E Subject ${Date.now()}`;
    await context.setOffline(true);

    await nameInput.fill("Offline Etw Visitor");
    await emailInput.fill("offline.e2e@example.com");
    await subjectInput.fill(uniqueSubject);
    await messageInput.fill(
      "Queueing this inquiry while offline so Playwright verifies automatic flush upon reconnect."
    );
    await submitBtn.click();

    await expect(
      page.getByText(/Saved to Offline Outbox/i)
    ).toBeVisible({ timeout: 10000 });

    const outboxBeforeReconnect = await page.evaluate(() =>
      window.localStorage.getItem("lou_offline_contact_outbox")
    );
    expect(outboxBeforeReconnect).toContain(uniqueSubject);

    // Reconnect network -> expect automatic POST /api/contact flush and localStorage outbox drain.
    const flushResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/contact") &&
        res.request().method() === "POST" &&
        res.status() === 200,
      { timeout: 15000 }
    );

    await context.setOffline(false);
    // Ensure Chromium dispatches online notification immediately across platforms.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
    });

    const flushRes = await flushResponsePromise;
    expect(flushRes.status()).toBe(200);

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.localStorage.getItem("lou_offline_contact_outbox")
          ),
        { timeout: 10000 }
      )
      .toBeNull();
  });

  test("filters projects, opens dedicated case-study routes, and serves /offline cleanly", async ({
    page,
    request,
  }) => {
    // Dynamic manifest and sitemap include project case-study routes.
    const manifestRes = await request.get("/manifest.webmanifest");
    expect(manifestRes.status()).toBe(200);
    const manifestJson = (await manifestRes.json()) as {
      short_name?: string;
      background_color?: string;
    };
    expect(manifestJson.short_name).toBeTruthy();
    expect(manifestJson.background_color).toMatch(/^#/);

    const sitemapRes = await request.get("/sitemap.xml");
    expect(sitemapRes.status()).toBe(200);
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).toContain("/projects/capstone-system");

    // Nonexistent or unpublished project route must fail closed with 404.
    const missingProjectRes = await request.get(
      "/projects/nonexistent-draft-system"
    );
    expect(missingProjectRes.status()).toBe(404);

    // Resume proxy must fail closed with 404 when no resume document is configured.
    const resumeRes = await request.get("/api/resume");
    expect(resumeRes.status()).toBe(404);

    // Offline fallback skips Preloader, uses Button controls, and hides home scroll chapters.
    await page.goto("/offline", { waitUntil: "networkidle" });
    await expect(
      page.locator('aside[aria-label="Site loader"]')
    ).not.toBeAttached();
    await expect(
      page.getByRole("heading", { name: /You're Offline/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Retry Connection/i })
    ).toBeVisible();
    await expect(
      page.locator("header").getByRole("link", { name: /Story/i })
    ).not.toBeVisible();

    // Return home via Cached Portfolio control, filter projects, and open a Case Study.
    await page
      .getByRole("main")
      .getByRole("link", { name: /Cached Portfolio/i })
      .click();
    await page.waitForURL("**/", { timeout: 10000 });

    const projectsSection = page.locator("#projects");
    await projectsSection.scrollIntoViewIfNeeded();

    const analyticsSpotlightTab = projectsSection.getByRole("tab", {
      name: /Predictive Business Analytics Intelligence Hub/i,
    });
    await expect(analyticsSpotlightTab).toBeVisible({ timeout: 10000 });
    await analyticsSpotlightTab.click();
    await expect(analyticsSpotlightTab).toHaveAttribute("aria-selected", "true");

    await expect(
      projectsSection.getByRole("heading", {
        name: /Predictive Business Analytics Intelligence Hub/i,
      })
    ).toBeVisible();
    await expect(
      projectsSection.getByRole("heading", {
        name: /Enterprise Group Capstone System/i,
      })
    ).not.toBeVisible();

    // Switch back to Capstone System and also test the Grid View toggle
    const capstoneSpotlightTab = projectsSection.getByRole("tab", {
      name: /Enterprise Group Capstone System/i,
    });
    await capstoneSpotlightTab.click();
    await expect(capstoneSpotlightTab).toHaveAttribute("aria-selected", "true");
    await expect(
      projectsSection.getByRole("heading", {
        name: /Enterprise Group Capstone System/i,
      })
    ).toBeVisible();

    const gridToggleBtn = projectsSection.getByRole("button", {
      name: /Switch to Grid View/i,
    });
    if (await gridToggleBtn.isVisible()) {
      await gridToggleBtn.click();
      await expect(
        projectsSection.getByRole("heading", {
          name: /Predictive Business Analytics Intelligence Hub/i,
        })
      ).toBeVisible();
    }

    await projectsSection
      .getByRole("link", {
        name: /Read full case study for Enterprise Group Capstone System/i,
      })
      .click();

    await page.waitForURL("**/projects/capstone-system", { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: /Enterprise Group Capstone System/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Core Engineering Challenge/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Architecture & Execution/i })
    ).toBeVisible();

    await page
      .getByRole("link", { name: /Back to Selected Systems/i })
      .click();
    await page.waitForURL("**/#projects", { timeout: 10000 });
  });

  test("adapts public portfolio cleanly across desktop, zoomed laptop (125%–200%), mobile, and WCAG 320px reflow without overflow", async ({
    page,
  }) => {
    const viewports = [
      { label: "2560x1440 (50% zoom-out / QHD)", width: 2560, height: 1440 },
      { label: "1920x1080 (100% desktop)", width: 1920, height: 1080 },
      { label: "1366x768 (100% laptop)", width: 1366, height: 768 },
      { label: "1092x614 (125% zoom)", width: 1092, height: 614 },
      { label: "910x512 (150% zoom)", width: 910, height: 512 },
      { label: "683x384 (200% zoom)", width: 683, height: 384 },
      { label: "390x844 (mobile)", width: 390, height: 844 },
      { label: "320x568 (WCAG 400% reflow)", width: 320, height: 568 },
    ] as const;

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('aside[aria-label="Site loader"]')
    ).not.toBeAttached({ timeout: 15000 });

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(120);

      const metrics = await page.evaluate(() => {
        const hero = document.querySelector("#top");
        const ctaLinks = hero
          ? Array.from(hero.querySelectorAll("a, button"))
          : [];
        const clippedCtas = ctaLinks
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              text: el.textContent?.trim() || "",
              rightOverflow: rect.right - window.innerWidth,
              leftOverflow: -rect.left,
            };
          })
          .filter((c) => c.rightOverflow > 2 || c.leftOverflow > 2);

        const storyHeading = document.querySelector("#story h2");
        const storyHeadingPx = storyHeading
          ? parseFloat(getComputedStyle(storyHeading).fontSize)
          : 0;

        const heroHeight = hero ? hero.getBoundingClientRect().height : 0;

        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          clippedCtas,
          storyHeadingPx,
          heroHeight,
        };
      });

      expect(
        metrics.scrollWidth,
        `Horizontal overflow at ${vp.label}`
      ).toBeLessThanOrEqual(metrics.innerWidth);
      expect(
        metrics.clippedCtas,
        `Clipped Hero CTAs at ${vp.label}`
      ).toEqual([]);
      expect(
        metrics.storyHeadingPx,
        `Story heading font size at ${vp.label}`
      ).toBeGreaterThanOrEqual(24);
      if (vp.height >= 1080) {
        expect(
          metrics.heroHeight,
          `Hero height should stay capped without dead vertical void at ${vp.label}`
        ).toBeLessThanOrEqual(880);
      }
    }

    // Verify mobile menu drawer is scrollable on short/zoomed viewports (e.g. 683x384)
    await page.setViewportSize({ width: 683, height: 384 });
    const openMenuBtn = page.getByRole("button", { name: /Open menu/i });
    await expect(openMenuBtn).toBeVisible();
    await openMenuBtn.click();
    const drawerContactLink = page.getByRole("link", {
      name: /Contact Lou Diamond/i,
    });
    await drawerContactLink.scrollIntoViewIfNeeded();
    await expect(drawerContactLink).toBeVisible();
  });
});
