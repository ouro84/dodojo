import { defineConfig, devices } from "@playwright/test";

// Charge .env.local pour que le process Playwright (pas seulement `next dev`)
// connaisse E2E_TEST_EMAIL/E2E_TEST_PASSWORD (compte fixe, ADR-04). Absent en
// CI, où ces variables viennent directement des secrets GitHub Actions.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local absent (CI) — les variables sont déjà dans process.env.
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
