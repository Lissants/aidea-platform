import { test, expect } from '@playwright/test';

/**
 * Smoke test scaffold for later phases — verifies the sign-in page renders
 * both auth methods. Requires a running dev server with real Supabase env
 * vars configured to go further than this.
 */
test('sign-in page renders both auth tabs', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByText('Email & password')).toBeVisible();
  await expect(page.getByText('Magic link')).toBeVisible();
});
