/**
 * REQUIRES: a real Supabase project, `npm run seed`, and at least one
 * idea already routed to demo.mentor1@godrejcp.com with a pending review
 * (seed this via the app itself: sign in as a participant, submit an idea
 * preferring that mentor). Could not be executed in this sandbox — see
 * the final report for why (Playwright browser download blocked).
 */
import { test, expect } from '@playwright/test';
import { signIn, DEMO_USERS } from './helpers/auth';

test('a mentor can submit a review for an assigned idea', async ({ page }) => {
  await signIn(page, DEMO_USERS.mentorHighCapacity);
  await page.goto('/reviews');
  await page.getByText('Waiting for Review').first().click();

  await page.getByLabel('Desirability').check();
  await page.getByLabel('Viability').check();
  await page.getByLabel('Realistic implementation').check();
  await page.getByLabel(/recommend/i).first().check();
  await page.getByLabel(/comment/i).fill('Clear articulation of desirability, viability, and feasibility.');

  await page.getByRole('button', { name: /submit review/i }).click();
  await expect(page.getByText(/review submitted/i)).toBeVisible();

  // Once submitted, the review is read-only until an admin reopens it.
  await expect(page.getByRole('button', { name: /submit review/i })).toHaveCount(0);
});

/**
 * demo.mentor3@godrejcp.com is seeded with max_capacity = 2
 * (supabase/seed.sql). Rather than driving 10 live submissions to force an
 * overflow (slow and flaky), this asserts against seed/fixture state: the
 * scenario requires 3+ ideas whose Preferred Mentor 1 is Karan Mentor
 * (mentorLowCapacity) already submitted before this test runs, so the 3rd
 * one lands in Routing Required. Seed that fixture state via the app (3
 * participant accounts, each preferring Karan Mentor first) before running
 * this spec, or extend supabase/seed.sql with pre-submitted ideas that
 * reach this state directly.
 */
test('mentor capacity overflow surfaces as Routing Required for an admin', async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/review-assignment');
  await expect(page.getByText('Routing Required').first()).toBeVisible();
});

test('an admin can view a specific mentor\'s queue from the Mentor Directory', async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/mentors');
  await page.getByRole('link', { name: 'View queue' }).first().click();
  await expect(page).toHaveURL(/\/review-assignment\?mentor=/);
});
