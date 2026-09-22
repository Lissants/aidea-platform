import type { Page } from '@playwright/test';

/**
 * Every scenario in this suite that needs a signed-in session requires a
 * REAL Supabase project with `npm run seed` already run against it (see
 * LOCAL_SETUP.md) — these tests drive actual Supabase Auth via the sign-in
 * form, there is no mocked auth layer for e2e. Credentials below match
 * scripts/seed.ts / supabase/seed.sql exactly.
 */
export const DEMO_PASSWORD = 'AideaDemo!2026';

export const DEMO_USERS = {
  admin: 'demo.admin1@godrejcp.com',
  mentorHighCapacity: 'demo.mentor1@godrejcp.com',
  mentorLowCapacity: 'demo.mentor3@godrejcp.com', // seeded with max_capacity = 2, used for routing-overflow scenarios
  participant1: 'demo.participant1@godrejcp.com',
  participant2: 'demo.participant2@godrejcp.com',
  voter1: 'demo.voter1@godrejcp.com',
  voter2: 'demo.voter2@godrejcp.com',
} as const;

export async function signIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 });
}
