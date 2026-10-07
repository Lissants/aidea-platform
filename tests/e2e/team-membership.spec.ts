/**
 * Team membership after approval, driven through the real UI.
 *
 * REQUIRES: the local SQL Server `aidea` database, migrated (npm run db:migrate)
 * and seeded (npm run db:seed). Each run creates its own throwaway employees
 * and ideas directly in the database (unique emails per run), so it never
 * touches the demo accounts' ideas. Business rules themselves are covered in
 * tests/integration/team-membership.test.ts; this spec checks the screens:
 *  - participant on a Build idea and another in-progress idea sees the banner,
 *    with a commit button only on the Build idea; the commit dialog stays
 *    disabled until the team name is typed; committing clears the banner;
 *  - admin removes a member (reason required) and adds a replacement.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, DEMO_USERS, signIn } from './helpers/auth';
import { runSql, type SqlStep } from './helpers/db-exec';

const PROGRAM = '66666666-6666-6666-6666-666666666001';
const run = Date.now().toString(36);

type Person = { id: string; email: string; name: string };
const person = (label: string): Person => ({
  id: randomUUID(),
  email: `e2e.${label}.${run}@test.local`,
  name: `E2E ${label} ${run}`,
});

const leader = person('leader');
const memberB = person('b');
const memberC = person('c');
const replacement = person('r');
const ideaOne = { id: randomUUID(), title: `Commit test one ${run}`, team: `Team One ${run}` };
const ideaTwo = { id: randomUUID(), title: `Commit test two ${run}`, team: `Team Two ${run}` };

const createPerson = (p: Person, hash: string): SqlStep[] => [
  { sql: 'INSERT INTO users (id, email, password_hash) VALUES (@id, @email, @hash)', params: { ...p, hash } },
  {
    sql: 'INSERT INTO profiles (id, email, full_name, active) VALUES (@id, @email, @name, 1)',
    params: { id: p.id, email: p.email, name: p.name },
  },
  {
    sql: `INSERT INTO user_roles (user_id, role_id) SELECT @id, id FROM roles WHERE name IN ('participant', 'employee_voter')`,
    params: { id: p.id },
  },
];

/** A submitted idea led by `leader` whose screening Pass (and, with `build`, qualifier Build) is already published. */
const createApprovedIdea = (idea: typeof ideaOne, members: Person[], build = false): SqlStep[] => [
  {
    sql: `INSERT INTO ideas (id, program_id, team_name, team_leader_id, idea_title, problem_opportunity,
                             proposed_solution, status, locked, created_by)
          VALUES (@id, @program, @team, @leader, @title, N'Stock-outs happen without warning across warehouses.',
                  N'Forecast demand and flag shortages a week ahead.', 'submitted', 1, @leader)`,
    params: { id: idea.id, program: PROGRAM, team: idea.team, leader: leader.id, title: idea.title },
  },
  ...members.map((m, i) => ({
    sql: 'INSERT INTO idea_team_members (idea_id, profile_id, member_order) VALUES (@idea, @profile, @order)',
    params: { idea: idea.id, profile: m.id, order: i + 1 },
  })),
  {
    sql: `INSERT INTO screening_decisions (idea_id, decision, decided_at, published, published_at)
          VALUES (@id, 'pass_to_qualifier', SYSDATETIMEOFFSET(), 1, SYSDATETIMEOFFSET())`,
    params: { id: idea.id },
  },
  ...(build
    ? [
        {
          sql: `INSERT INTO qualifier_assessments (idea_id, final_score, build_decision, status, finalized_at, published, published_at)
                VALUES (@id, 80, 'build', 'finalized', SYSDATETIMEOFFSET(), 1, SYSDATETIMEOFFSET())`,
          params: { id: idea.id },
        },
      ]
    : []),
];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  runSql([
    ...[leader, memberB, memberC, replacement].flatMap((p) => createPerson(p, hash)),
    ...createApprovedIdea(ideaOne, [memberB, memberC], true),
    ...createApprovedIdea(ideaTwo, [memberB, memberC]),
  ]);
});

test('participant on a Build idea must type the team name to commit to it', async ({ page }) => {
  await signIn(page, leader.email);
  await page.goto('/my-ideas');

  await expect(page.getByText('Choose the idea you will commit to')).toBeVisible();
  const twoRow = page.getByRole('alert').locator('div.rounded-md', { hasText: ideaTwo.title });
  await expect(twoRow.getByRole('button', { name: 'Commit to this idea' })).toHaveCount(0);
  await expect(twoRow.getByText('Not Build · still in progress')).toBeVisible();
  const oneRow = page.getByRole('alert').locator('div.rounded-md', { hasText: ideaOne.title });
  await oneRow.getByRole('button', { name: 'Commit to this idea' }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText(ideaTwo.title)).toBeVisible();
  await expect(dialog.getByText(/you are its team leader/i)).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Commit and leave the other ideas' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/to confirm/).fill('wrong team');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/to confirm/).fill(ideaOne.team);
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText(`You are now committed to "${ideaOne.title}"`)).toBeVisible();
  await expect(page.getByText('Choose the idea you will commit to')).toBeHidden();
});

test('admin removes a member with a reason and adds a replacement', async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await page.goto(`/ideas/${ideaTwo.id}`);

  await expect(page.getByText('Leader vacant. Assign a new team leader.')).toBeVisible();

  const memberRow = page.locator('div.rounded-md.border', { hasText: memberC.name });
  await memberRow.getByRole('button', { name: 'Remove' }).click();
  const dialog = page.getByRole('alertdialog');
  const remove = dialog.getByRole('button', { name: 'Remove' });
  await expect(remove).toBeDisabled();
  await dialog.getByLabel(/Reason/).fill('Resigned from the company');
  await remove.click();
  await expect(page.getByText(`${memberC.name} removed from the team`)).toBeVisible();

  await page.getByRole('button', { name: 'Add replacement member' }).click();
  const add = page.getByRole('dialog');
  await add.getByLabel('Employee').fill(replacement.name);
  await add.getByRole('button', { name: new RegExp(replacement.name) }).click();
  await add.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByText(`${replacement.name} added to the team`)).toBeVisible();
  await expect(page.locator('div.rounded-md.border', { hasText: replacement.name })).toBeVisible();
});
