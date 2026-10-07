/**
 * Full journey through the real UI: participant submits → mentor recommends
 * Pass → admin screening Pass (published) → qualifier Build (published) →
 * final presentation draft (no winner published) → the idea is a voting
 * candidate → admin publishes site-wide voting → employees vote → admin
 * publishes results → voters see them.
 *
 * REQUIRES: the local SQL Server `aidea` database migrated through 0011 and
 * seeded (demo.admin1), plus `npm run dev` on :3000. Each run creates its
 * own throwaway users and a temporary "E2E Program <run>" that becomes the
 * newest active program, so every Publish button only touches this run's
 * rows. While the run lasts the app shows that program; afterAll deletes
 * everything it created and the real program is active again.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, DEMO_USERS, signIn } from './helpers/auth';
import { runSql, type SqlStep } from './helpers/db-exec';

const run = Date.now().toString(36);
const runStartedAt = new Date().toISOString();
const PROGRAM = randomUUID();

type Person = { id: string; email: string; name: string };
const person = (label: string): Person => ({
  id: randomUUID(),
  email: `e2e.${label}.${run}@test.local`,
  name: `E2E ${label} ${run}`,
});

const leader = person('leader');
const mentorA = person('mentora');
const mentorB = person('mentorb');
const voter = person('voter');
const voter2 = person('voterb');
const people = [leader, mentorA, mentorB, voter, voter2];

const IDEA_TITLE = `E2E Shelf Gap Detector ${run}`;
const QUALIFIER_COMMENT = 'Strong business case with a clear pilot plan.';

const createPerson = (p: Person, hash: string, roles: string[]): SqlStep[] => [
  { sql: 'INSERT INTO users (id, email, password_hash) VALUES (@id, @email, @hash)', params: { ...p, hash } },
  {
    sql: 'INSERT INTO profiles (id, email, full_name, active) VALUES (@id, @email, @name, 1)',
    params: { id: p.id, email: p.email, name: p.name },
  },
  {
    sql: `INSERT INTO user_roles (user_id, role_id) SELECT @id, id FROM roles WHERE name IN (${roles.map((r) => `'${r}'`).join(', ')})`,
    params: { id: p.id },
  },
];

const createMentorProfile = (p: Person): SqlStep => ({
  sql: "INSERT INTO mentor_profiles (profile_id, expertise, max_capacity) VALUES (@id, N'Retail analytics', 5)",
  params: { id: p.id },
});

/** `YYYY-MM-DDTHH:mm` in the browser's (= this machine's) local time, for datetime-local inputs. */
function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function confirmPublish(page: Page) {
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Type PUBLISH to confirm').fill('PUBLISH');
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

test.beforeAll(async () => {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  runSql([
    {
      sql: `INSERT INTO programs (id, title, description, submission_open_at, submission_close_at, status)
            VALUES (@id, @title, N'Temporary program for the final-presentation-to-voting e2e run.',
                    DATEADD(day, -1, SYSDATETIMEOFFSET()), DATEADD(day, 7, SYSDATETIMEOFFSET()), 'active')`,
      params: { id: PROGRAM, title: `E2E Program ${run}` },
    },
    ...createPerson(leader, hash, ['participant', 'employee_voter']),
    ...createPerson(mentorA, hash, ['mentor', 'employee_voter']),
    ...createPerson(mentorB, hash, ['mentor', 'employee_voter']),
    ...createPerson(voter, hash, ['employee_voter']),
    ...createPerson(voter2, hash, ['participant', 'employee_voter']),
    createMentorProfile(mentorA),
    createMentorProfile(mentorB),
  ]);
});

test.afterAll(() => {
  const ids = people.map((p) => `'${p.id}'`).join(', ');
  const programIdeas = 'SELECT id FROM ideas WHERE program_id = @program';
  runSql([
    {
      sql: `DELETE FROM votes WHERE idea_id IN (${programIdeas}) OR voter_id IN (${ids})
              OR voting_period_id IN (SELECT id FROM voting_periods WHERE program_id = @program)`,
      params: { program: PROGRAM },
    },
    { sql: `DELETE FROM reviews WHERE idea_id IN (${programIdeas})`, params: { program: PROGRAM } },
    {
      sql: `DELETE FROM audit_logs WHERE program_id = @program OR actor_id IN (${ids})
              OR entity_id IN (${programIdeas}) OR entity_id IN (SELECT id FROM voting_periods WHERE program_id = @program)`,
      params: { program: PROGRAM },
    },
    // Publishing voting notifies every active profile, demo and real users included.
    {
      sql: `DELETE FROM notifications
             WHERE created_at >= @since AND type IN ('voting_opened', 'voting_result_published')`,
      params: { since: runStartedAt },
    },
    { sql: 'DELETE FROM ideas WHERE program_id = @program', params: { program: PROGRAM } },
    { sql: 'DELETE FROM programs WHERE id = @program', params: { program: PROGRAM } },
    { sql: `DELETE FROM users WHERE id IN (${ids})` },
  ]);
});

test('1. participant submits an idea with two preferred mentors', async ({ page }) => {
  await signIn(page, leader.email);
  await page.goto('/submit');

  await page.getByLabel('Idea Title').fill(IDEA_TITLE);
  await page.getByLabel('Problem / Opportunity').fill('Empty shelves go unnoticed for hours in modern trade stores.');
  await page.getByLabel('Proposed Solution & AI Use').fill('Computer vision on store photos flags shelf gaps for the sales rep.');
  await page.getByLabel('Target Users / Beneficiaries').fill('Field sales reps');

  await page.getByLabel('Team Name').fill(`Team Shelf ${run}`);
  await page.getByLabel('Team Leader').fill(leader.name);
  await page.getByRole('list', { name: 'Matching colleagues' }).getByRole('button', { name: new RegExp(leader.name) }).click();

  await page.getByLabel('Impact Type').click();
  await page.getByRole('option', { name: 'Revenue growth' }).click();
  await page.getByLabel('How will the Idea Create this Impact?').fill('Fewer lost sales from out-of-stock shelves.');
  await page.getByLabel('What Measurable Result would Show Success?').fill('2% uplift in sell-through');

  await page.getByLabel('Mentor Priority 1').click();
  await page.getByRole('option', { name: new RegExp(`^${mentorA.name}`) }).click();
  await page.getByLabel('Mentor Priority 2').click();
  await page.getByRole('option', { name: new RegExp(`^${mentorB.name}`) }).click();

  await page.getByRole('button', { name: 'Submit idea' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit idea' }).click();

  await expect(page.getByText('Idea submitted')).toBeVisible();
  await page.waitForURL('**/my-ideas');
  await expect(page.getByRole('cell', { name: IDEA_TITLE, exact: true })).toBeVisible();
});

test('2. the priority-1 mentor recommends Pass', async ({ page }) => {
  await signIn(page, mentorA.email);
  await page.goto('/reviews');
  await page.getByRole('link', { name: `Start review of ${IDEA_TITLE}` }).click();

  for (const group of ['Desirability', 'Viability', 'Realistic Implementation']) {
    await page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: 'Yes' }).click();
  }
  await page.getByRole('radiogroup', { name: 'Recommendation' }).getByRole('radio', { name: 'Pass', exact: true }).click();
  await page.getByLabel(/Reviewer comment/).fill('Clear problem, credible data source, feasible pilot.');

  await page.getByRole('button', { name: 'Submit review' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit review' }).click();
  await expect(page.getByText('Review submitted')).toBeVisible();
});

test('3. admin passes screening, hidden from the team until published', async ({ page, browser }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/screening');
  await expect(page.getByRole('heading', { name: IDEA_TITLE })).toBeVisible();
  await page.getByRole('radio', { name: 'Pass to Idea Qualifier' }).click();
  await page.getByRole('button', { name: 'Save decision' }).click();
  await expect(page.getByText('Screening decision saved')).toBeVisible();

  // Saved is not published: the qualifier queue only shows published passes.
  await page.goto('/qualifier');
  await expect(page.getByRole('heading', { name: IDEA_TITLE })).toHaveCount(0);

  const leaderContext = await browser.newContext();
  const leaderPage = await leaderContext.newPage();
  await signIn(leaderPage, leader.email);
  await leaderPage.goto('/notifications');
  await expect(leaderPage.getByText('Your idea passed screening', { exact: true })).toHaveCount(0);

  await page.goto('/screening');
  await page.getByRole('button', { name: 'Publish All Screening Results' }).click();
  await confirmPublish(page);
  await expect(page.getByText(/Published 1 record/)).toBeVisible();

  await leaderPage.reload();
  await expect(leaderPage.getByText('Your idea passed screening', { exact: true })).toBeVisible();
  await leaderContext.close();
});

test('4. qualifier Build only reaches final presentation once published', async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/qualifier');
  await expect(page.getByRole('heading', { name: IDEA_TITLE })).toBeVisible();
  await page.getByLabel(/Final score/).fill('82');
  await page.getByRole('radio', { name: 'Build', exact: true }).click();
  await page.getByLabel(/Overall comment/).fill(QUALIFIER_COMMENT);
  await page.getByRole('button', { name: 'Finalize Assessment' }).click();
  await expect(page.getByText('Assessment finalized')).toBeVisible();

  await page.goto('/final-presentation');
  await expect(page.getByRole('heading', { name: IDEA_TITLE })).toHaveCount(0);

  await page.goto('/qualifier');
  await page.getByRole('button', { name: 'Publish All Qualifier Results' }).click();
  await confirmPublish(page);
  await expect(page.getByText(/Published 1 record/)).toBeVisible();

  await page.goto('/final-presentation');
  await expect(page.getByRole('heading', { name: IDEA_TITLE })).toBeVisible();
});

test('5. a draft final presentation makes the idea a voting candidate', async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/voting-management');
  await expect(page.getByRole('list', { name: 'Voting candidates' })).toHaveCount(0);
  await expect(page.getByText('No ideas have reached final presentation yet.').first()).toBeVisible();

  await page.goto('/final-presentation');
  await page.getByLabel(/Final score/).fill('74');
  await page.getByRole('button', { name: 'Save Draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();

  await page.goto('/voting-management');
  await expect(page.getByRole('list', { name: 'Voting candidates' }).getByText(IDEA_TITLE)).toBeVisible();
});

test('6. admin schedules and publishes site-wide voting', async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/voting-management');

  // Nothing to publish until a period exists.
  await expect(page.getByRole('button', { name: 'Publish voting' })).toBeDisabled();

  const now = Date.now();
  await page.getByLabel('Opens at').fill(localInput(new Date(now - 5 * 60_000)));
  await page.getByLabel('Closes at').fill(localInput(new Date(now + 24 * 60 * 60_000)));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Voting period saved')).toBeVisible();

  // Saved is not published: voters still see nothing.
  const voterPage = await page.context().browser()!.newPage();
  await signIn(voterPage, voter.email);
  await voterPage.goto('/voting');
  await expect(voterPage.getByText("Voting isn't open right now")).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Publish voting' }).click();
  await confirmPublish(page);
  await expect(page.getByText(/Voting published/)).toBeVisible();
  await expect(page.getByText('Voting is published to every employee.')).toBeVisible();

  await voterPage.reload();
  await expect(voterPage.getByText(IDEA_TITLE)).toBeVisible();
  await voterPage.close();
});

test('7. employees vote once; the team cannot vote for itself', async ({ page, browser }) => {
  await signIn(page, voter.email);
  await page.goto('/voting');
  await expect(page.getByText(IDEA_TITLE)).toBeVisible();
  // Voters never see judging data.
  await expect(page.getByText('82')).toHaveCount(0);
  await expect(page.getByText(QUALIFIER_COMMENT)).toHaveCount(0);

  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: 'Cast vote' }).click();
  await expect(page.getByText('Vote cast — thank you!')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Vote already cast' })).toBeDisabled();

  const leaderContext = await browser.newContext();
  const leaderPage = await leaderContext.newPage();
  await signIn(leaderPage, leader.email);
  await leaderPage.goto('/voting');
  await leaderPage.getByRole('radio').first().click();
  await leaderPage.getByRole('button', { name: 'Cast vote' }).click();
  await expect(leaderPage.getByText("You cannot vote for your own team's idea")).toBeVisible();
  await leaderContext.close();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, voter2.email);
  await otherPage.goto('/notifications');
  await expect(otherPage.getByText('Voting is open', { exact: true }).first()).toBeVisible();
  await otherContext.close();
});

test('8. admin sees live turnout and publishes results; voters see them', async ({ page, browser }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto('/voting-management');
  await expect(page.getByText('1 total vote(s) cast so far.')).toBeVisible();

  // Close the window without waiting a day.
  runSql([
    {
      sql: `UPDATE voting_periods SET opens_at = DATEADD(hour, -2, SYSDATETIMEOFFSET()),
                                      closes_at = DATEADD(minute, -1, SYSDATETIMEOFFSET())
             WHERE program_id = @program`,
      params: { program: PROGRAM },
    },
  ]);
  await page.reload();
  await page.getByRole('button', { name: 'Publish Favorite Project' }).click();
  await confirmPublish(page);
  await expect(page.getByText('Favorite Project results published')).toBeVisible();

  const voterContext = await browser.newContext();
  const voterPage = await voterContext.newPage();
  await signIn(voterPage, voter.email);
  await voterPage.goto('/voting');
  await voterPage.getByRole('link', { name: 'See results' }).click();
  const results = voterPage.getByRole('list', { name: 'Voting results' });
  await expect(results.getByText(IDEA_TITLE)).toBeVisible();
  await expect(results.getByText('100%')).toBeVisible();
  await voterContext.close();
});
