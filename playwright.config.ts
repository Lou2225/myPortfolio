import path from "path";
import { defineConfig, devices } from "@playwright/test";

const e2eDataDir = path.resolve(__dirname, "test-results", ".e2e-data");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node tests/e2e/start-e2e-server.mjs",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      PORT: "3100",
      PORTFOLIO_FORCE_LOCAL_STORAGE: "1",
      PORTFOLIO_DATA_DIR: e2eDataDir,
      ADMIN_PASSWORD: "E2E-Test-Password-2026!",
      ADMIN_SESSION_SECRET: "e2e-test-session-secret-min-32-bytes-ok!",
      ADMIN_STEALTH_KEY: "",
      RESEND_API_KEY: "",
      RESEND_FROM_EMAIL: "",
      CONTACT_NOTIFICATION_EMAIL: "",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      VERCEL: "",
    },
  },
});
