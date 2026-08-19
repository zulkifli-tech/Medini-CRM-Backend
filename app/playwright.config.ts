import { defineConfig, devices } from '@playwright/test';

/**
 * S10 T3 — Playwright browser E2E (production frontend ↔ production backend).
 * Requires: backend running on :3000 + frontend dev server on :5173.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
