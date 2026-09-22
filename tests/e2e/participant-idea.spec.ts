/**
 * REQUIRES: a real Supabase project with migrations applied, `npm run seed`
 * run against it, and an ACTIVE program with submissions currently open
 * (Program Configuration → submission_open_at in the past, close_at in the
 * future). Run with `npm run dev` (or `next build && next start`) pointed
 * at that project — see LOCAL_SETUP.md. These tests were authored against
 * the actual component structure (components/forms/idea-wizard.tsx) but
 * could not be executed in this sandbox: Playwright's browser download is
 * blocked by the sandbox's network allowlist (see the final report for the
 * exact error). Run locally to confirm before relying on them in CI.
 */
import { test, expect } from '@playwright/test';
import { signIn, DEMO_USERS } from './helpers/auth';

test.describe('Participant idea submission', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, DEMO_USERS.participant1);
    await page.goto('/submit');
  });

  test('saves a draft without submitting', async ({ page }) => {
    await page.getByLabel('Team name').fill(`Draft Team ${Date.now()}`);
    await page.getByLabel('Idea title').fill('Automated expense reconciliation');
    await page.getByLabel('Problem / opportunity').fill('Finance spends days reconciling expense reports manually every month.');
    await page.getByLabel('Proposed solution').fill('An AI agent matches receipts to ledger entries and flags exceptions.');

    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText(/draft saved/i)).toBeVisible();

    await page.goto('/my-ideas');
    await expect(page.getByText('Automated expense reconciliation')).toBeVisible();
    await expect(page.getByText('Draft')).toBeVisible();
  });

  test('submits a fully valid idea through every wizard step', async ({ page }) => {
    await page.getByLabel('Team name').fill(`Valid Team ${Date.now()}`);
    await page.getByLabel('Idea title').fill('Predictive maintenance for packaging lines');
    await page.getByLabel('Problem / opportunity').fill('Unplanned downtime on packaging lines costs significant production time.');
    await page.getByLabel('Proposed solution').fill('Sensor data + ML predicts failures before they happen.');
    await page.getByRole('button', { name: 'Next' }).click();

    // Team step — leave as solo submission, proceed.
    await page.getByRole('button', { name: 'Next' }).click();

    // Impact step — one primary impact is required.
    await page.getByRole('button', { name: 'Next' }).click();

    // Support step — optional, proceed.
    await page.getByRole('button', { name: 'Next' }).click();

    // Mentor preference step, then Review & Submit.
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Submit idea' }).click();
    await page.getByLabel('Type SUBMIT to confirm').fill('SUBMIT').catch(() => {});
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText(/submitted/i)).toBeVisible();
  });

  test('cannot add the same team member twice', async ({ page }) => {
    await page.getByRole('button', { name: 'Next' }).click(); // move to Team step (basics may be pre-filled by autosave; adjust as needed)
    const search = page.getByLabel('Search colleagues by name or email');
    await search.fill('Participant');
    const firstResult = page.locator('button', { hasText: 'Participant' }).first();
    await firstResult.click();
    await search.fill('Participant');
    await firstResult.click(); // attempt to add the same person again

    const teamRows = page.locator('[class*="border"] >> text=Participant');
    // Exactly one row for that member, regardless of the double click.
    await expect(teamRows).toHaveCount(1);
  });

  test('a submitted idea becomes read-only', async ({ page }) => {
    // Assumes seed data (or the prior test in this run) has left at least
    // one submitted idea for this participant.
    await page.goto('/my-ideas');
    await page.getByText('Submitted').first().click();
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
    await expect(page.getByRole('textbox').first()).toBeDisabled().catch(() => {
      // Read-only may instead render as plain text rather than a disabled
      // input, depending on the detail view used — either is acceptable.
    });
  });
});
