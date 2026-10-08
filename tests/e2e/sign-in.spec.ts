import { test, expect } from '@playwright/test';

/**
 * Smoke test — verifies the sign-in page renders the email + password form.
 * When the MICROSOFT_* env vars are configured, "Sign in with Microsoft" is
 * the main button and the password form sits behind "Sign in with password
 * instead"; without them the form shows straight away.
 */
test('sign-in page renders the email & password form', async ({ page }) => {
  await page.goto('/sign-in');
  const passwordToggle = page.getByRole('button', { name: 'Sign in with password instead' });
  if (await page.getByRole('link', { name: 'Sign in with Microsoft' }).isVisible()) {
    await expect(page.getByLabel('Work email')).toBeHidden();
    await passwordToggle.click();
  } else {
    await expect(passwordToggle).toHaveCount(0);
  }
  await expect(page.getByLabel('Work email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('session-error page explains the Microsoft failure reason', async ({ page }) => {
  await page.goto('/session-error?reason=sso_tenant');
  await expect(page.getByText('Sign in with your Godrej Microsoft work account')).toBeVisible();
  await page.goto('/session-error?reason=unknown');
  await expect(page.getByText('Your sign-in could not be completed')).toBeVisible();
});
