import { test, expect } from '@playwright/test';

/**
 * S10 T3 — Browser E2E Journey A: Login → Patient List → Create → View.
 * Requires backend (:3000) + frontend (:5173) running.
 */
test.describe('Journey A — Login → Patients', () => {
  test('login with valid HQ credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'hq');
    await page.fill('#password', 'medini123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('login with wrong password stays on login page (no dashboard redirect)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'hq');
    await page.fill('#password', 'wrongpassword');
    await page.click('button[type="submit"]');
    /* Wrong credentials must NOT reach the dashboard — still on /login */
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/login');
  });

  test('patients page loads after login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'hq');
    await page.fill('#password', 'medini123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/patients');
    await expect(page.locator('text=Patients').first()).toBeVisible();
  });
});
