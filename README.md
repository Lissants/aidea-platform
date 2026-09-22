# AIdea Submission Platform

**AI Innovation Challenge** — an internal Godrej Industries Group workflow tool for submitting, reviewing, screening, qualifying, mentoring, showcasing, and voting on employee AI innovation ideas end-to-end.

## What it does

Employees submit AI innovation ideas as a team. Each idea is routed to a mentor for review, screened by admins, assessed at a "qualifier" gate (Build / No Build), assigned a project mentor if it moves to build, presented at a final round (winner / runner-up), and — if selected — published to a public Project Showcase where every employee can vote for their favorite. Every publish step (screening result, qualifier result, mentor assignment, final result, showcase entry, voting result) is a deliberate, audited action separate from saving or finalizing a decision, so nothing reaches a participant before an admin explicitly publishes it.

## Feature summary

- **Participant**: idea submission wizard (team, problem/solution, business impact, support needs, mentor preference), My Ideas dashboard, Project Showcase, voting, notifications.
- **Mentor**: reviewer dashboard, structured review form (desirability / viability / realistic implementation + recommendation), My Reviews queue.
- **Admin**: Review Assignment (routing + manual reassignment), Screening, Qualifier, Project Mentor Assignment, Final Presentation — each with Save → Finalize → Publish as three distinct steps; Showcase Content curation; Voting Management (schedule voting, live turnout, publish results); Idea Management (search/filter/export/drill-in); Program Configuration (cycle dates, eligibility text, FAQ, resource files); Mentor Directory (capacity management); Role Management (grant/revoke roles, audited); Reports (funnel, workload, turnout, winners); Audit Log viewer; CSV exports.
- **Cross-cutting**: Supabase Auth (email/password + magic link, company-domain gated), row-level security as the real authorization boundary, an in-app notification center, a pluggable email-adapter stub, dark/light/system theme.

## Tech stack

Next.js 14 (App Router, Server Components/Actions), TypeScript (strict), Tailwind CSS + shadcn/ui, Supabase (Postgres + Auth + Storage + RLS), Zod, React Hook Form, next-themes, Lucide icons, Recharts, Sonner, Vitest, Playwright.

## Quick start

See **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** for the full walkthrough (Supabase project creation, migrations, seeding, running the dev server). In short:

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's values
# apply supabase/migrations/*.sql to that project, then:
npm run seed
npm run dev
```

## Demo credentials

Seeded by `npm run seed` (see `scripts/seed.ts` / `supabase/seed.sql`) — **these are fake, local-development-only accounts**, never used in a real deployment:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `demo.admin1@godrejcp.com` | `AideaDemo!2026` |
| Mentor | `demo.mentor1@godrejcp.com` | `AideaDemo!2026` |
| Mentor (low capacity, for routing-overflow testing) | `demo.mentor3@godrejcp.com` | `AideaDemo!2026` |
| Participant | `demo.participant1@godrejcp.com` | `AideaDemo!2026` |
| Employee voter | `demo.voter1@godrejcp.com` | `AideaDemo!2026` |

## Other documentation

- **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** — local development setup end to end.
- **[VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)** — deploying to Vercel.
- **[COMPANY_SERVER_DEPLOYMENT.md](./COMPANY_SERVER_DEPLOYMENT.md)** — self-hosted / company-server deployment with Docker + Nginx.
- **[SECURITY.md](./SECURITY.md)** — RLS approach, auth model, publication gating, known limitations.
- **[ASSUMPTIONS.md](./ASSUMPTIONS.md)** — every deviation from spec and every assumption made, across all build phases.
- **[docs/ERD.md](./docs/ERD.md)** — database entity-relationship diagram.
- **[docs/WORKFLOW.md](./docs/WORKFLOW.md)** — idea lifecycle workflow diagram.

## Testing

```bash
npm run test        # unit + integration (Vitest)
npm run test:e2e     # end-to-end (Playwright) — requires a live Supabase project + npm run seed, see tests/e2e file headers
npm run typecheck
npm run lint
npm run build
```
