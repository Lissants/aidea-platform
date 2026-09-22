/**
 * REQUIRES: a real Supabase project, `npm run seed`, at least one idea with
 * a submitted review awaiting a screening decision, and (for the qualifier
 * scenarios) at least one idea already passed through screening. Could not
 * be executed in this sandbox — see the final report for why (Playwright
 * browser download blocked by the sandbox's network allowlist).
 */
import { test, expect } from '@playwright/test';
import { signIn, DEMO_USERS } from './helpers/auth';

test('admin records a screening decision, which stays hidden from the participant until published', async ({ page, browser }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/screening');
  const firstRow = page.getByRole('row').nth(1);
  await firstRow.click();

  await page.getByLabel(/pass to qualifier/i).check();
  await page.getByRole('button', { name: 'Save decision' }).click();
  await expect(page.getByText(/decision saved/i)).toBeVisible();

  // Not yet published — a participant must see no screening outcome at all.
  const participantContext = await browser.newContext();
  const participantPage = await participantContext.newPage();
  await signIn(participantPage, DEMO_USERS.participant1);
  await participantPage.goto('/my-ideas');
  await expect(participantPage.getByText(/screening/i).filter({ hasText: /pass|not pass/i })).toHaveCount(0);
  await participantContext.close();

  // Publish, typing the required confirmation text.
  await page.goto('/screening');
  await page.getByRole('button', { name: 'Publish Screening Decisions' }).click();
  await page.getByLabel(/type publish to confirm/i).fill('PUBLISH');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(/published/i)).toBeVisible();
});

test('participant only sees the pass/fail decision after publication, never the internal reason', async ({ page }) => {
  await signIn(page, DEMO_USERS.participant1);
  await page.goto('/my-ideas');
  // A published screening decision shows a plain status badge...
  await expect(page.getByText(/Passed Screening|Not Passed/i).first()).toBeVisible();
  // ...and never the admin-only internal_reason field.
  await expect(page.getByText(/internal reason/i)).toHaveCount(0);
});

test('admin finalizes and publishes a qualifier result', async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/qualifier');
  const firstRow = page.getByRole('row').nth(1);
  await firstRow.click();

  await page.getByLabel(/final score/i).fill('82');
  await page.getByLabel(/overall comment/i).fill('Strong desirability and viability; recommend building.');
  await page.getByLabel('Build').check();
  await page.getByRole('button', { name: 'Finalize' }).click();
  await expect(page.getByText(/finalized/i)).toBeVisible();

  await page.goto('/qualifier');
  await page.getByRole('button', { name: 'Publish Qualifier Results' }).click();
  await page.getByLabel(/type publish to confirm/i).fill('PUBLISH');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(/published/i)).toBeVisible();
});

test('participant never sees the qualifier score or comment, only the Build/No Build outcome', async ({ page }) => {
  await signIn(page, DEMO_USERS.participant1);
  await page.goto('/my-ideas');
  await expect(page.getByText(/Build|No Build/i).first()).toBeVisible();
  await expect(page.getByText('82')).toHaveCount(0);
  await expect(page.getByText(/Strong desirability and viability/i)).toHaveCount(0);
});
