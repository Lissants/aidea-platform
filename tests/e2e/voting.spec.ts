/**
 * REQUIRES: a real Supabase project, `npm run seed`, an open voting_period
 * (Voting Management → opens_at in the past, closes_at in the future), and
 * at least one showcased project NOT submitted by demo.voter1's own team
 * (employee voters have no team anyway, but the same idea should also be
 * used for the "own project" block test with a participant account that
 * IS on that idea's team). Could not be executed in this sandbox — see
 * the final report (Playwright browser download blocked).
 */
import { test, expect } from '@playwright/test';
import { signIn, DEMO_USERS } from './helpers/auth';

test('an employee can vote exactly once', async ({ page }) => {
  await signIn(page, DEMO_USERS.voter1);
  await page.goto('/voting');
  await page.getByRole('button', { name: /vote/i }).first().click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/vote recorded|thank you for voting/i)).toBeVisible();
});

test('an employee cannot vote for their own team\'s project', async ({ page }) => {
  // demo.participant1 is on a team with a showcased idea — the Vote button
  // for that specific card must be absent or disabled for them.
  await signIn(page, DEMO_USERS.participant1);
  await page.goto('/voting');
  const ownProjectCard = page.getByText('Automated expense reconciliation').locator('..');
  await expect(ownProjectCard.getByRole('button', { name: /vote/i })).toHaveCount(0);
});

test('a vote cannot be changed once cast', async ({ page }) => {
  await signIn(page, DEMO_USERS.voter1);
  await page.goto('/voting');
  // Having already voted in the previous test, every Vote button should
  // now be gone/disabled and a "you already voted" state shown instead.
  await expect(page.getByText(/already voted/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^vote$/i })).toHaveCount(0);
});

test('live vote counts are visible only to admins, never to voters', async ({ page }) => {
  await signIn(page, DEMO_USERS.voter1);
  await page.goto('/voting');
  await expect(page.getByText(/\d+ votes?$/i)).toHaveCount(0);

  await page.goto('/results');
  // Before results_published, the participant-facing Results page must
  // show nothing at all — never a live count.
  await expect(page.getByText(/aren't published yet/i)).toBeVisible();
});

test('an admin can see live turnout before results are published', async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/voting-management');
  await expect(page.getByText(/live turnout/i)).toBeVisible();
  await expect(page.getByText(/total vote\(s\) cast so far/i)).toBeVisible();
});
