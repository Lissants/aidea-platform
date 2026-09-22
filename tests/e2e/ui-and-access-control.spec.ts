/**
 * REQUIRES: a real Supabase project + `npm run seed` for the signed-in
 * cases; the unauthenticated-redirect cases need no data at all. Could not
 * be executed in this sandbox — see the final report (Playwright browser
 * download blocked by the sandbox's network allowlist).
 */
import { test, expect, devices } from '@playwright/test';
import { signIn, DEMO_USERS } from './helpers/auth';

test('dark mode toggles and persists across a reload', async ({ page }) => {
  await signIn(page, DEMO_USERS.participant1);
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark').catch(async () => {
    // next-themes may set `class="dark"` instead of a data attribute,
    // depending on ThemeProvider config — accept either.
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/).catch(async () => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test('an unauthenticated visitor is redirected away from a protected route (desktop)', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('a participant cannot reach an admin-only route', async ({ page }) => {
  await signIn(page, DEMO_USERS.participant1);
  await page.goto('/audit');
  await expect(page).toHaveURL(/\/access-denied/);
});

test.describe('mobile viewport', () => {
  test.use({ ...devices['iPhone 13'] });

  test('an unauthenticated visitor is redirected away from a protected route (mobile)', async ({ page }) => {
    await page.goto('/my-ideas');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('a participant cannot reach an admin-only route on mobile', async ({ page }) => {
    await signIn(page, DEMO_USERS.participant1);
    await page.goto('/roles');
    await expect(page).toHaveURL(/\/access-denied/);
  });
});
