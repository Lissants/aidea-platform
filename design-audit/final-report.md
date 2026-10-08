# Final report

Branch `feature/my-ideas-result-status`. Nothing has been committed. This work sits on top of the uncommitted changes that were already present. Some of those files were not touched by this work:

- `lib/services/ideas.ts`
- `lib/services/idea-management.ts`
- `types/database.ts`
- `components/ideas/idea-detail-readonly.tsx`
- `components/layout/confirm-dialog.tsx`
- `app/api/profiles/search/route.ts`
- `.gitignore`
- `db/migrations/0009_team_membership.sql`
- `lib/services/team-membership.ts`
- the team-membership tests

Two files that were already untracked were edited only to swap amber styling for tokens: `team-management-card.tsx` and `assign-team-member-dialog.tsx`. `commit-idea-panel.tsx` was likewise edited only to use the warning Alert variant.

## Changes made, by recommendation

| ID | Change | Files |
|---|---|---|
| R-01 | Monochrome GIG tokens (light and dark) with soft status tones; GI Sans/Arial stack; `darkMode` selector fix; 6 px radius; no card or button shadows; gradient and blur removed; monochrome charts | `app/globals.css`, `tailwind.config.ts`, `components/ui/{card,button,alert}.tsx`, `app/(auth)/layout.tsx`, `components/admin/reports-charts.tsx` |
| R-02 | One status vocabulary: display keys for review and stage states; soft badge as `<span>`; quiet "N/A"; `AttentionFlag`; 6 ad-hoc mappings replaced | `lib/constants/status.ts`, `lib/ideas/stage.ts`, `components/ui/{badge,status-badge,attention-flag}.tsx`, `(admin)/ideas/**`, `(mentor)/reviews/page.tsx`, `my-ideas/page.tsx`, `project-mentor-row.tsx`, `team-management-card.tsx`, `assign-team-member-dialog.tsx`, `commit-idea-panel.tsx`, `screening-row.tsx` |
| R-03 | Every control named: labelled filters (admin ideas, mentor dashboard), project-mentor select, review radio groups (`aria-labelledby`), 44 px remove buttons with `aria-label` | as listed, plus `components/ui/{input,textarea,select}.tsx` (touch height, focus ring, invalid state) |
| R-04 | Action bar sits above the mobile nav and respects the safe area; `scroll-padding` keeps focused fields visible | `contextual-action-bar.tsx`, `mobile-bottom-nav.tsx`, `globals.css` |
| R-05 | Different mentors required (shared schema); both priorities required on the submit form; a mentor taken by the other priority is disabled | `lib/validation/schemas.ts`, `lib/ideas/idea-form-issues.ts`, `idea-wizard.tsx` |
| R-06, R-19 | Submit form: 5 headed sections, inline errors (`aria-invalid` and `aria-describedby`), focusable linked error summary, desktop section index, "draft saved at" status. Decomposed from 609 to 424 lines | `components/forms/{idea-wizard,idea-form-parts,profile-picker,form-field}.tsx`, `lib/ideas/idea-form-issues.ts` |
| R-07 | Skip link and `main#main`; "**AI**dea" wordmark; grouped admin sidebar; `aria-current`; short mobile labels; More sheet as a 48 px list; theme options in the account menu on phones; avatar trigger named | `app-shell.tsx`, `sidebar-nav.tsx`, `mobile-bottom-nav.tsx`, `avatar-menu.tsx`, `lib/constants/navigation.ts` |
| R-08, R-20 | Participant home: next-step H1, labelled programme timeline, recent ideas with status, voting shown only when open; parallel reads; shared `fetchMyIdeas` (also used by My Ideas) | `app/overview/participant-overview.tsx`, `components/overview/*`, `lib/overview/next-step.ts`, `lib/ideas/my-ideas.ts` |
| R-09 | Mentor home: counts from the My Reviews source, linked to tabs; "To finish" list linking to each review | `app/overview/mentor-overview.tsx` |
| R-10, R-18 | Admin home: decisions first, each item linked; pipeline metric row; voting status badge; readable audit labels; pill row removed; shared `MetricRow` | `app/overview/admin-overview.tsx`, `components/layout/metric.tsx`, `lib/audit/labels.ts` |
| R-11 | `loading.tsx` and `error.tsx` for admin, mentor, participant and overview; `app/not-found.tsx` | `app/**/loading.tsx`, `app/**/error.tsx`, `components/layout/{loading-skeletons,route-error}.tsx` |
| R-12 | Left-aligned `EmptyState`; one `NoActiveProgram` replacing 12 copies; specific empty copy | `components/layout/{empty-state,no-active-program}.tsx`, 11 pages |
| R-13 | Notification filter changed from dangling tabs to a pressed-button group; progress bars named | `notification-list.tsx`, `publish-readiness-bar.tsx`, `mentor-directory-row.tsx`, `ui/progress.tsx` |
| R-15 | Reduced-motion rule; `transition-all` removed | `globals.css`, `sidebar-nav.tsx`, `ui/tabs.tsx`, `stepper.tsx` |
| R-16, R-24 | Card policy (border, no shadow); `CardTitle` renders `h2`; decorative icons `aria-hidden` | `ui/card.tsx` and others |
| R-17 | Mobile cards: title row, left-aligned label/value pairs, hidden secondary columns, full-width 44 px action row | `ui/responsive-table.tsx`, `reviews/page.tsx`, `my-ideas/page.tsx`, `dashboard/page.tsx` |
| R-21 | Vendored skill folders excluded from tsc and eslint | `tsconfig.json`, `eslint.config.mjs` |
| R-23 | "Untitled draft" fallback | admin ideas, My Ideas, overview |
| R-25 | Sentence-case labels; no em dashes in status, stage or voting copy; "Save draft" and "Submit review" consistent | touched files |
| R-26 | Review form lists what's missing next to the disabled Submit button | `review-form.tsx` |
| R-27 | GCPL logo and Godrej Signature lockup on public pages (cropped, transparent PNGs; inverted in dark mode) | `app/(auth)/layout.tsx`, `public/brand/*` |
| Review page | Idea title as H1, back link, spacer hack removed | `(mentor)/reviews/[assignmentId]/page.tsx` |

### Tooling and tests added
- `tests/e2e/ui-baseline.spec.ts`: an evidence-capture spec that is read-only and only runs with `AUDIT_PHASE` set. It records screenshots, overflow, axe, first Tab, submit validation, the mobile action bar and dark mode.
- `@axe-core/playwright` devDependency.
- `npm run audit:design` and `npm run audit:capture`.
- `scripts/validate-design-audit.ts` with `tests/unit/design-audit-manifest.test.ts` (coverage rules plus negative cases).
- New unit tests: `status-meta.test.ts`, `idea-form-issues.test.ts`, `next-step.test.ts`, plus additions to `validation-schemas.test.ts`.
- Fixed the pre-existing loading failure of `tests/e2e/ui-and-access-control.spec.ts`. It used a WebKit device descriptor inside a describe block; it now uses only the viewport and touch settings.

## Before and after

| Measure | Before | After |
|---|---|---|
| axe violations (16 routes × 390/1280) | 195 nodes: color-contrast 169, select-name 12, button-name 6, aria-progressbar-name 4, label 2, aria-valid-attr-value 2 | **0** |
| axe in dark mode (overview 390/1280, submit 1280) | not measured | **0** |
| Horizontal overflow (80 captures) | 0 | 0 |
| Console errors (80 captures) | 0 | 0 |
| First Tab on authenticated pages | Logo (no skip link) | "Skip to main content" (30/30) |
| Mobile Submit button at 375×812, scrolled | Covered by the nav; tap lands on "More" | Bar bottom 748 = nav top 748; tap reaches Submit |
| Submit with empty form | One toast, first error only | Focused summary with 7 linked issues, 8 fields `aria-invalid`, no dialog |
| Mentor home (demo.mentor1) | "Pending reviews 4" | "All your reviews are done": 0 not started, 4 completed (matches My Reviews) |
| Admin "Needs attention" heading | Unreadable (white on near-white) | "3 items need your decision", each item a link |
| Status mapping implementations | 6 | 1 |
| `idea-wizard.tsx` | 609 lines | 424 lines (plus extracted parts) |

Screenshot pairs: `evidence/before/screens/<role>__<route>__<viewport>.png` against the same path under `evidence/after/screens/`. Most informative pairs:
- `participant__overview__laptop-1280`
- `mentor__overview__mobile-390`
- `admin__overview__laptop-1280`
- `admin__ideas__mobile-390`
- `participant__submit__mobile-390`
- `mentor__reviews__mobile-390`
- `anonymous__sign-in__mobile-390`

After-only: `participant__submit-validation__laptop-1280.png`, `participant__submit-scrolled__mobile-375.png`, `participant__*-dark__*.png`.

## Commands and results (after)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 (before: exit 2, 24 errors in vendored folders) |
| `npm run lint` | exit 0: 0 errors, 6 warnings (the same 6 `set-state-in-effect` warnings as before) (before: crash) |
| `npx vitest run tests/unit` | **9 files, 81 tests passed** (before: 5 files, 50 tests) |
| `npm run audit:design` | Coverage check passed: 88 items, 27 recommendations, 41 findings, 20 critical components |
| `npm run build` | exit 0. 3 Turbopack "dynamic filesystem access" warnings come from the file-storage helper (`Invalid file key` code), which this work did not touch. There is no before build to compare against |
| `AUDIT_PHASE=after npx playwright test ui-baseline --workers=1` | 6/6 passed |
| `npx playwright test tests/e2e/sign-in.spec.ts` | 1/1 passed |
| `ui-and-access-control.spec.ts` | Before the spec fix: failed to load (pre-existing Playwright error). With the fix (verified through a temporary copy, then applied to the spec): 5/5 passed. Covers dark-mode persistence and participant denial on admin routes, desktop and mobile |
| Integration tests (`tests/integration`) | **Not run.** They need the separate `aidea_test` DB |
| Write-path e2e specs (participant-idea, reviewer-and-routing, admin-decisions, team-membership, voting) | **Not run.** They change the shared local DB; needs your approval. Note: `participant-idea.spec.ts` is already stale (it clicks "Next" buttons from an older multi-step form) and will fail regardless |

Logs are in `design-audit/evidence/after/*.log`.

## Accessibility results
- **Automated:** 0 axe WCAG 2.0/2.1/2.2 A/AA violations on all captured routes and states, light and dark.
- **Keyboard:**
  - The skip link comes first.
  - Every interactive element has a visible 2 px focus ring.
  - The error summary takes focus and links to each field.
  - The route error boundary moves focus to its heading.
  - Radix dialogs keep their focus trap (unchanged).
- **Semantics:**
  - One `h1` per page, with `h2` sections below.
  - Landmarks: `nav[aria-label=Main]` (sidebar and bottom nav), `main#main`, `role=search` filter forms.
  - `aria-current` on navigation; `aria-pressed` on the notification filter.
- **Unable to verify:**
  - Real screen-reader output (NVDA/VoiceOver). The accessibility tree and axe were used instead.
  - Physical touch behaviour.
  - 200% zoom was not measured. No fixed-width containers were introduced, but this is untested.

## Responsive results
- 360, 390, 768, 1280 and 1536 px: no overflow.
- Mobile nav labels fit on one line.
- Filters are two per row on phones.
- Tables become prioritised cards.
- The action bar is never covered.
- The submit section index shows from `lg` only.
- Known compromise: the 7-step timeline uses 7 columns only from `xl`; below that it wraps to 2 columns.

## Status of P0 and P1 items

| ID | Priority | Outcome |
|---|---|---|
| R-01 | P0 | Implemented and verified (axe 0; dark mode verified) |
| R-03 | P0 | Implemented and verified (axe 0) |
| R-04 | P0 | Implemented and verified (results-submit-form.json) |
| R-05 | P0 | Implemented and verified (unit tests). The server-side count requirement is **planned, pending your decision**: see F1 |
| R-02 | P1 | Implemented and verified (unit test; grep finds no amber) |
| R-06 | P1 | Implemented and verified (Playwright validation check) |
| R-07 | P1 | Implemented and verified (first Tab; screenshots) |
| R-08 | P1 | Implemented and verified (screenshots; unit tests) |
| R-09 | P1 | Implemented and verified (counts match My Reviews) |
| R-10 | P1 | Implemented and verified (screenshot; unit test) |
| R-11 | P1 | Implemented. Typecheck and build pass. Loading UI was seen during capture. The error boundary was **not triggered live**: forcing a server error on the shared DB wasn't safe |
| R-13 | P1 | Implemented and verified (axe 0) |
| R-14 | P1 | **Planned.** Needs a draft-edit route and server-action review (ownership and post-submit lock). Meanwhile the participant home says drafts aren't reviewed until submitted, and the form says "Keep this page open to keep editing" after a save, so it doesn't promise resumable drafts |

## Remaining risks
- **Visible regression risk:**
  - Label and copy changes (sentence case, "Not started"/"In progress" tabs) and the reordered submit form (idea first, then team) change what returning users see.
  - e2e text selectors are case-insensitive, so the existing specs are unaffected by casing.
- **Brand assets:** GI Sans renders only where it is installed (it is on this machine). Elsewhere the fallback is Arial. No font files were added because licensing is unknown.
- **Validation behaviour:** choosing the same mentor twice is now rejected on the server for drafts too. Before, this failed later on a DB constraint, so this is an earlier failure, not a new one.

## Recommended follow-up
1. **F1 (product decision):** require two preferences at submit on the server (`ideaDraftSchema`) and update the team-membership integration fixture.
2. **R-14:** resumable drafts.
3. **E2E with DB approval:** run the write-path specs against a disposable seeded DB, and repair the stale `participant-idea.spec.ts`.
4. **R-22:** remove confirmed-dead components (`ui/breadcrumb`, `command`, `form`, `popover`, `tooltip`, `coming-soon`); `stepper` may serve R-14.
5. **Pagination:** consolidate the two pagination implementations, and move remaining admin pages (qualifier, final presentation, roles) onto the new list and filter patterns.
6. **CI:** the Playwright workflow needs a DB service; add `npm run audit:design` to CI.
7. **Accessibility checks still to do:** a 200% zoom pass and a real screen-reader pass (NVDA and VoiceOver).
