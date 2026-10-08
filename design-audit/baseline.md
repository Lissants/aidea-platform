# Baseline (before any UI change)

Captured on 2026-10-04 on branch `feature/my-ideas-result-status`, on top of the user's existing uncommitted changes. The app was served by the user's own `next dev` already running on `localhost:3000` against the local SQL Server `aidea` database (seeded demo data, not reset).

## Stack

| Concern | Finding |
|---|---|
| Framework | Next.js 16.3.7 (App Router, Turbopack dev, `output: 'standalone'`) |
| React | ^19.3.0 |
| Rendering | Every page and layout is a server component. Client code sits only in leaf components (about 56 files). Mutations are server actions in `lib/services/*` |
| Routing | Route groups `(auth)`, `(admin)`, `(mentor)`, `(participant)`, plus `/overview`, `/notifications` and `/profile` with their own layouts. `proxy.ts` checks the session cookie |
| Styling | Tailwind 3.4 with HSL CSS variables in `app/globals.css`; shadcn/ui "default" style; `tailwindcss-animate` |
| Components | shadcn on Radix (16 packages), `cmdk`, `sonner` |
| Icons | lucide-react 0.577 |
| Fonts | None loaded. The body uses Tailwind's default `font-sans` stack, even though a comment in `app/layout.tsx` says otherwise |
| State | Local `useState`, server components, URL search params |
| Forms | `react-hook-form` and `zod` on 5 small forms. The main submit form uses raw `useState` with zod checks on submit |
| Tests | Vitest: 5 unit files (50 tests) and 6 integration files (need the `aidea_test` DB). Playwright 1.63: 7 specs |
| Accessibility tooling | None before this audit. `@axe-core/playwright` 4.13 was added for this work |
| Storybook | None |
| Analytics | None |
| Theme | `next-themes` (`attribute="data-theme"`, default "system"). Light and dark tokens exist, but the `dark:` utility variant is broken (F-32) |
| Breakpoints | Tailwind defaults. The layout switches at `lg` (sidebar vs bottom nav) and tables switch at `md` |
| Browser support | No browserslist; Next defaults (modern evergreen) |
| Auth and roles | JWT session cookie. Roles come from `user_roles` on each request. The active role is a cookie, and layout guards run per group |
| Data | MSSQL (`mssql` and `msnodesqlv8`) with stored procedures |

## Routes reviewed (live capture)

| Role | Routes |
|---|---|
| Anonymous | `/sign-in` |
| Participant (`demo.participant1`) | `/overview`, `/my-ideas`, `/submit`, `/notifications` |
| Mentor (`demo.mentor1`) | `/overview`, `/dashboard`, `/reviews`, `/reviews/e1f0d65c-…` |
| Admin (`demo.admin1`) | `/overview`, `/ideas`, `/ideas/1f5d1862-…`, `/review-assignment`, `/screening`, `/project-mentor`, `/roles` |

Each route was captured at **360, 390, 768, 1280 and 1536 px**: 16 routes × 5 = 80 full-page screenshots in `evidence/before/screens/`. Axe and keyboard checks ran at 390 and 1280. The other admin pages (program, qualifier, final presentation, showcase, voting management, mentors, reports, settings, audit) were reviewed only from source code.

**Not reviewed live:**
- Write flows, i.e. actually submitting, assigning or publishing. These were deliberately not exercised on the shared DB.
- The SSO callback.
- `/voting` as an employee voter.
- Dark mode, which was inspected only through code.

## Tooling commands and results (pre-existing state)

| Command | Result | Log |
|---|---|---|
| `npm run typecheck` | **Fails** with 24 TS errors, all in the untracked `ui-ux-pro-max-skill/` (23) and `agent-skills/` (1). App source: 0 errors | `evidence/before/typecheck.log` |
| `npm run lint` | **Crashes**: "could not find plugin react-hooks", caused by the untracked `ui-ux-pro-max-skill/` and `claude-marketplace/` | `evidence/before/lint.log` |
| `npx eslint app components lib types tests scripts proxy.ts` | 0 errors, 6 warnings (`react-hooks/set-state-in-effect`) | `evidence/before/lint-app.log` |
| `npx vitest run tests/unit` | **50/50 passed** | `evidence/before/unit.log` |
| Integration tests | Not run. They need a separate `aidea_test` database; not attempted, to avoid touching DB state | none |
| `npm run build` | Not run before the changes. The production build writes `.next/`, which the user's running dev server also uses. Run once after the changes, see final-report.md | none |
| `AUDIT_PHASE=before npx playwright test ui-baseline` | 4/4 passed (2.4 min) | `evidence/before/playwright.log`, `results-*.json` |

## Baseline evidence summary

- **Horizontal overflow:** 0 of 80 captures.
- **Console errors:** 0 of 80.
- **Axe violations** (390 and 1280, WCAG 2.0/2.1/2.2 A+AA):

| Rule | Impact | Nodes | Routes |
|---|---|---|---|
| color-contrast | serious | 169 | all 16 |
| select-name | critical | 12 | /ideas, /dashboard, /project-mentor |
| button-name | critical | 6 | /submit |
| aria-progressbar-name | serious | 4 | /screening, /project-mentor |
| label | critical | 2 | /submit |
| aria-valid-attr-value | critical | 2 | /notifications |

- **First Tab:** focuses the "AIdea" logo on all 15 authenticated routes (no skip link). On `/sign-in` it focuses the email input.
- **Mobile action bar** (browser, 375×812, `/submit`, scrollY 400): the bar spans y 751–812 and the bottom nav y 748–812, so they overlap completely. A tap at the "Submit idea" position hits "More".
- **Admin "Needs attention" heading:** visually unreadable (white text) in `admin__overview__laptop-1280.png`.

## Pre-existing problems not caused by this work
- The typecheck and lint failures above (untracked folders at the repo root).
- `e2e/example.spec.ts` is Playwright boilerplate outside `testDir`.
- `.github/workflows/playwright.yml` runs e2e without a database, so it can't pass in CI.
- `DevRoleSwitcher` checks for `demo@` emails, but the seed uses `demo.<role>@`, so it never shows for seeded users. Inferred from code; not changed.
- `npm i` warns that `msnodesqlv8`'s install script isn't covered by `allowScripts`. The existing build was unaffected (the dev server kept serving).
