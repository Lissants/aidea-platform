# AIdea Submission Platform

**AI Innovation Challenge** — an internal Godrej Industries Group workflow tool for submitting, reviewing, screening, qualifying, mentoring, showcasing, and voting on employee AI innovation ideas end-to-end.

## What it does

Employees submit AI innovation ideas as a team. Each idea is routed to a mentor for review, screened by admins, assessed at a "qualifier" gate (Build / No Build), assigned a project mentor if it moves to build, presented at a final round (winner / runner-up), and — if selected — published as a voting candidate where every employee can vote for their favorite. Every publish step (screening result, qualifier result, mentor assignment, final result, showcase entry, voting result) is a deliberate, audited action separate from saving or finalizing a decision, so nothing reaches a participant before an admin explicitly publishes it.

## Feature summary

- **Participant**: idea submission wizard, My Ideas (each idea's screening, qualifier and project-mentor results, plus the final presentation deck upload once the idea is a Build), Favorite Project voting and its results, Mentor Profile directory, notifications. The wizard collects:
  - **Team & idea information**: team name, a required **Team Leader** (any colleague, picked by name/email search), up to **5 team members**, idea title, problem/opportunity, proposed solution and target users.
  - **Business impact**: a primary and an optional secondary impact (Revenue growth, Time efficiency, Cost Optimization, Governance Excellence), each with an explanation and an optional measurable result.
  - **Support needed** (optional): tools, budget (IDR) and/or data access, with guidance text for each.
  - **Preferred mentors**: first and second choice (must differ), used to route the idea for review.

  **Save draft** works at any point, even with empty sections. The full validation runs only on **Submit idea**. Anyone can be on several ideas until screening; a person on two or more ideas that pass screening must commit to one and is dropped from the others.
- **Mentor**: Idea Dashboard and My Reviews queue (with each idea's published screening, qualifier and project-mentor status), structured review form (desirability / viability / realistic implementation + recommendation), Mentor Profile.
- **Admin**: Review Assignment (routing + manual reassignment), Screening, Qualifier, Project Mentor Assignment, Final Presentation — each with Save → Finalize → Publish as three distinct steps; Showcase Content curation; Voting Management (candidates come automatically from the final presentation stage; schedule, **publish voting**, live turnout, publish results); Idea Management (search/filter/export/drill-in); Program Configuration (cycle dates, eligibility text, FAQ, resource files); Mentor Directory (capacity management); Mentor Profile editing (photo, title, expertise); User Management (add users with a temporary password, change tier, reset password, deactivate/reactivate, delete; all audited); team changes on submitted ideas (remove a member, assign a replacement or new leader); Reports (funnel, workload, turnout, winners); Audit Log viewer; CSV exports.
- **Developer** (top role): everything an Admin can do, plus managing Admin and Developer accounts and bulk-deleting test ideas from Idea Management (for clearing test data before UAT). See [SECURITY.md](./SECURITY.md#user-management-and-the-developer-role).
- **Cross-cutting**: email/password sign-in plus optional Microsoft Entra ID SSO (company-domain gated), server-side row-level authorization, forced password change for new and reset accounts, an in-app notification center, a pluggable email-adapter stub, a monochrome GIG-branded UI with dark/light/system theme.

## Tech stack

Next.js 16 (App Router, Server Components/Actions, Turbopack) on React 19 and Node.js ≥ 20.12, TypeScript (strict), Tailwind CSS + shadcn/ui, Microsoft SQL Server 2019 (`mssql` with the `msnodesqlv8` or `tedious` driver; T-SQL migrations and stored procedures in `db/`), `jose` sessions, `bcryptjs`, `@azure/msal-node`, Zod, React Hook Form, next-themes, Lucide icons, Recharts, Sonner, Vitest, Playwright.

## Choose your path

| I want to… | Read |
| --- | --- |
| Code on my own laptop | **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** |
| Replicate the reference setup: a Windows PC with SQL Server 2019 that colleagues open by IP over the LAN (dev or production, as a Windows service) | **[SELF_HOSTING_WINDOWS.md](./SELF_HOSTING_WINDOWS.md)** ⭐ |
| Deploy on a Linux server with Docker + Nginx | **[COMPANY_SERVER_DEPLOYMENT.md](./COMPANY_SERVER_DEPLOYMENT.md)** |

## Quick start

In short, against a local SQL Server 2019 instance on Windows:

```bash
npm install
sqlcmd -S . -E -C -Q "IF DB_ID('aidea') IS NULL CREATE DATABASE aidea"
cp .env.example .env.local   # the defaults work for a local default instance
npm run db:reset             # migrations + demo seed
npm run dev
```

To open the dev server from another device on your network, start it with `npm run dev -- -H 0.0.0.0` and browse to `http://<this PC's IP>:3000`. The PC's own IP addresses are allowed automatically; nothing machine-specific is stored in the repo. See [SELF_HOSTING_WINDOWS.md §5](./SELF_HOSTING_WINDOWS.md#5-find-your-ip-address-and-add-it-to-the-config).

## Demo credentials

Seeded by `npm run db:seed` / `npm run db:reset` (see `scripts/seed.ts` / `db/seed.sql`) — **these are fake, local-development-only accounts**, never used in a real deployment:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `demo.admin1@godrejcp.com` | `AideaDemo!2026` |
| Mentor | `demo.mentor1@godrejcp.com` | `AideaDemo!2026` |
| Mentor (low capacity, for routing-overflow testing) | `demo.mentor3@godrejcp.com` | `AideaDemo!2026` |
| Participant | `demo.participant1@godrejcp.com` | `AideaDemo!2026` |
| Employee voter | `demo.voter1@godrejcp.com` | `AideaDemo!2026` |

The seed also creates the four real platform **Developer** accounts (see `scripts/seed.ts`). Their initial password is hard-coded there, so change it right after the first sign-in.

## Other documentation

- **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** — local development setup end to end.
- **[SELF_HOSTING_WINDOWS.md](./SELF_HOSTING_WINDOWS.md)** — step-by-step self-hosting on a Windows PC: SQL Server 2019, LAN access by IP, Windows Firewall, running as a Windows service, backups, upgrades and troubleshooting.
- **[COMPANY_SERVER_DEPLOYMENT.md](./COMPANY_SERVER_DEPLOYMENT.md)** — self-hosted / company-server deployment with Docker + Nginx against SQL Server.
- **[VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)** — obsolete since the SQL Server migration (kept for history).
- **[SECURITY.md](./SECURITY.md)** — server-side authorization, auth model, uploads, publication gating, known limitations.
- **[ASSUMPTIONS.md](./ASSUMPTIONS.md)** — every deviation from spec and every assumption made, across all build phases.
- **[docs/ERD.md](./docs/ERD.md)** — database entity-relationship diagram.
- **[docs/WORKFLOW.md](./docs/WORKFLOW.md)** — idea lifecycle workflow diagram.
- **[design-audit/README.md](./design-audit/README.md)** — the UI/UX and accessibility audit behind the Godrej redesign, and its design system.

## Testing

```bash
npm run test        # unit + integration (Vitest) — integration tests use a throwaway aidea_test database
npm run test:e2e     # end-to-end (Playwright) — requires npm run db:reset + a running dev server, see tests/e2e file headers
npm run typecheck
npm run lint
npm run build
npm run audit:design   # validates design-audit/audit-manifest.json
npm run audit:capture  # re-captures the UI baseline screenshots (Playwright)
```

`.github/workflows/playwright.yml` runs Playwright on pushes and PRs to `main`. The runner has no SQL Server, so the database-backed e2e specs fail there; run them locally against a seeded `aidea` database.
