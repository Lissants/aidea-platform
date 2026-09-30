import { test, expect } from '@playwright/test';

/**
 * Smoke test — verifies the sign-in page renders the email + password form.
 * The "Sign in with Microsoft" button only renders when the MICROSOFT_* env
 * vars are configured, so it isn't asserted here.
 */
test('sign-in page renders the email & password form', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByLabel('Work email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
