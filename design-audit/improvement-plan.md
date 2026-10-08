# Improvement plan (prioritised backlog)

**Priority:**
- **P0:** blocks a task, accessibility or correctness
- **P1:** major usability, navigation or hierarchy problem
- **P2:** consistency, maintainability or performance
- **P3:** polish

**Class:** Must fix / Should improve / Could explore / Do not change.

**Decision** for this pass: **Implement** (in this slice), **Planned** (with reason), or **Rejected** (with reason).

Each item is a block of fields; `audit-manifest.json` and the coverage script read the `### R-xx` headings.

---

### R-01 Brand tokens, contrast and theme fix
- **Role / area:** Shared. `app/globals.css`, `tailwind.config.ts`, `components/ui/card.tsx`, `app/(auth)/layout.tsx`, `app-shell.tsx`, `contextual-action-bar.tsx`, `reports-charts.tsx`
- **Problem:**
  - Blue primary and white-on-tone badges fail contrast (F-01).
  - The "Needs attention" heading is invisible (F-02).
  - The palette is off-brand (F-27).
  - Decorative gradient and blur (F-30).
  - `dark:` utilities never fire (F-32).
- **Evidence:** axe `color-contrast`, 169 nodes on 16/16 routes; screenshot `admin__overview__laptop-1280.png`.
- **Proposed change:**
  - Monochrome token set with soft status tones (design-system.md).
  - `darkMode: ['selector','[data-theme="dark"]']`.
  - Arial/GI Sans font stack.
  - Remove the gradient and blur.
  - Chart palette from tokens.
- **Why:** WCAG 1.4.3; GIG brand rule.
- **Expected effect:**
  - Users: every label is readable, and the product looks like a Godrej tool.
  - Engineering: one token file controls colour.
- **Skill / guideline:** UI/UX Pro Max P1 contrast; Taste "one accent"; frontend-design palette plan; GIG brand.
- **Accessibility impact:** high, positive.
- **Responsive impact:** none.
- **Business-logic risk:** none.
- **Priority / class:** P0, Must fix. Effort: M. Dependencies: none.
- **Acceptance criteria:** axe `color-contrast` reports 0 nodes on all captured routes at 390 and 1280; no blue hue remains in tokens; `dark:` utilities apply when `data-theme="dark"`.
- **Validation:** `AUDIT_PHASE=after` axe capture; `grep` for `217 91%`; check the browser in dark mode.
- **Decision:** Implement.

### R-02 One status system
- **Role / area:** Shared. `lib/constants/status.ts`, `components/ui/status-badge.tsx`, `components/ui/badge.tsx`, new `components/ui/attention-flag.tsx`; used in `(admin)/ideas/page.tsx`, `ideas/[ideaId]/page.tsx`, `(mentor)/reviews/page.tsx`, `my-ideas/page.tsx`, `screening-row.tsx`, `project-mentor-row.tsx`, `team-management-card.tsx`, `assign-team-member-dialog.tsx`
- **Problem:**
  - 6 status mappings (F-29).
  - Raw `status:` text (F-23).
  - Badge renders a `<div>` (F-37).
  - Amber pills without icons.
- **Evidence:** file:line list in F-29.
- **Proposed change:**
  - Display keys for review-queue and stage states.
  - Soft-tone outlined badge rendered as a `<span>`.
  - `AttentionFlag` for team problems.
  - Stage labels without em dashes.
  - Replace every ad-hoc mapping.
- **Why:** consistent meaning; colour is never the only signal.
- **Expected effect:**
  - Users: the same state looks the same everywhere.
  - Engineering: one place to add a status.
- **Skill / guideline:** Composition (explicit variants); UI/UX Pro Max "colour-only"; Taste "no decorative status dots".
- **Accessibility impact:** positive.
- **Responsive impact:** none.
- **Business-logic risk:** none (display mapping only).
- **Priority / class:** P1, Must fix. Effort: M. Dependencies: R-01.
- **Acceptance criteria:**
  - `grep` finds no `amber-` in app/ or components/.
  - No `REVIEW_STATUS_LABEL` or inline variant ternary in `reviews/page.tsx`.
  - Every `StatusKey` has an icon, a label and a tone (unit test).
- **Validation:** unit test `status-meta.test.ts`; grep; screenshots.
- **Decision:** Implement.

### R-03 Name every control
- **Role / area:** Participant, Mentor, Admin. `idea-wizard.tsx`, `review-form.tsx`, `(admin)/ideas/page.tsx`, `(mentor)/dashboard/page.tsx`, `project-mentor-row.tsx`
- **Problem:**
  - Unnamed buttons, selects and inputs (F-03, F-04).
  - Radio groups have no name (F-09).
  - 24 px unlabeled remove buttons (F-11).
- **Evidence:** axe `button-name`, `label`, `select-name`; 21 `<Label>` without `htmlFor`.
- **Proposed change:**
  - `htmlFor`/`id` on every field.
  - `aria-label` on icon buttons, with 44 px touch targets.
  - Visible labels on filters.
  - `aria-labelledby` on radio groups.
- **Why:** WCAG 1.3.1, 4.1.2.
- **Expected effect:**
  - Users: screen-reader users can complete the forms.
  - Engineering: none.
- **Skill / guideline:** Vercel "form controls need labels"; UI/UX Pro Max P1.
- **Accessibility impact:** high, positive.
- **Responsive impact:** filters gain visible labels and grow slightly taller.
- **Business-logic risk:** none.
- **Priority / class:** P0, Must fix. Effort: S. Dependencies: none.
- **Acceptance criteria:** axe reports 0 `button-name`, `label` and `select-name` violations on /submit, /ideas, /dashboard and /project-mentor.
- **Validation:** after-phase axe capture.
- **Decision:** Implement.

### R-04 Keep the action bar above the mobile nav
- **Role / area:** Shared. `components/layout/contextual-action-bar.tsx`, `app/globals.css`
- **Problem:** the bar is covered by the fixed bottom nav while scrolling (F-14).
- **Evidence:** browser measurement at 375×812 (findings F-14).
- **Proposed change:**
  - `bottom-16` below `lg` plus the safe-area inset.
  - `scroll-padding-bottom` on `html` so focused fields aren't hidden.
- **Why:** WCAG 2.4.11; keeps the primary action reachable.
- **Expected effect:**
  - Users: Save and Submit are always visible on phones.
  - Engineering: none.
- **Skill / guideline:** UI/UX Pro Max "focus not obscured"; Vercel "sticky must not obscure".
- **Accessibility impact:** positive.
- **Responsive impact:** fixes mobile.
- **Business-logic risk:** none.
- **Priority / class:** P0, Must fix. Effort: S. Dependencies: none.
- **Acceptance criteria:** at 375×812 on /submit, the bar's bottom is at or above the nav's top at every scroll position, and `elementFromPoint` at the Submit button returns the button.
- **Validation:** browser measurement (javascript_tool) after the change; screenshot.
- **Decision:** Implement.

### R-05 Enforce two different mentor preferences
- **Role / area:** Participant. `lib/validation/schemas.ts`, `lib/ideas/idea-form-issues.ts`, `idea-wizard.tsx`, `tests/unit/validation-schemas.test.ts`
- **Problem:** the refine checks priorities rather than mentors, and allows 0 or 1 preference even though the UI says "exactly two" (F-16).
- **Evidence:** `schemas.ts:118-125`; DB `uq_idea_mentor_preferences_mentor`.
- **Proposed change:**
  1. In the shared schema (client and server), the two mentors must be different. This matches the DB constraint, so a clear message replaces the raw constraint violation.
  2. A new `ideaMentorPreferencesRequiredSchema` requires both priorities and is used by the submit form.
  3. On the form, a mentor already chosen for the other priority is disabled in the list.
  4. **Not changed:** the server-side submit path (`ideaDraftSchema` / `usp_submit_idea`) still accepts zero preferences, because existing fixtures (`tests/integration/team-membership.test.ts:59`) submit with none. Making preferences mandatory on the server is a product decision; see final-report.md, follow-up F1.
- **Why:** verified functional defect; the brief requires two distinct preferences.
- **Expected effect:**
  - Users: a clear message instead of a raw DB error, and no way to pick the same mentor twice in the form.
  - Engineering: the client rules match the DB.
- **Skill / guideline:** Functional correctness (precedence b).
- **Accessibility impact:** inline error linked through aria-describedby.
- **Responsive impact:** none.
- **Business-logic risk:** low. This tightens validation to the existing DB constraint. Drafts and the server-side count rule are unchanged.
- **Priority / class:** P0, Must fix. Effort: S. Dependencies: none.
- **Acceptance criteria:** unit tests show the same mentor twice is rejected by the shared schema, 1 preference is rejected by the submit-form schema, 2 different mentors are accepted, and a draft with 1 is accepted.
- **Validation:** `npx vitest run tests/unit` (validation-schemas.test.ts, idea-form-issues.test.ts).
- **Decision:** Implement.

### R-06 Inline validation and error summary on submit
- **Role / area:** Participant. `idea-wizard.tsx`, new `components/forms/form-field.tsx`, `components/forms/profile-picker.tsx`
- **Problem:**
  - Only the first error, shown as a toast (F-13).
  - Monolithic form (F-36).
- **Evidence:** `idea-wizard.tsx:178-227`.
- **Proposed change:**
  - Validate every section and collect all issues by field path.
  - Show each error under its field (`aria-invalid`, `aria-describedby`).
  - A focusable `role="alert"` summary that links to each field and receives focus.
  - Five `<section>`s with `h2` headings and a desktop section index.
  - Extract `ProfilePicker` and a `Field` wrapper into their own files.
- **Why:** UI/UX Pro Max "error placement" and "focusable error summary"; Vercel "focus first error".
- **Expected effect:**
  - Users: all problems are visible at once and fixable in place.
  - Engineering: a smaller, testable form.
- **Skill / guideline:** UI/UX Pro Max forms; Composition (decompose monolith).
- **Accessibility impact:** high, positive.
- **Responsive impact:** the section index shows only from `lg`.
- **Business-logic risk:** low. The payload and server actions are unchanged.
- **Priority / class:** P1, Must fix. Effort: M. Dependencies: R-03, R-05.
- **Acceptance criteria:** pressing "Submit idea" on an empty form shows a summary with at least 5 linked errors, moves focus to the summary, and marks each invalid field `aria-invalid` with a visible message; no dialog opens.
- **Validation:** Playwright check in `ui-baseline.spec.ts` (`submit validation` test, read-only: no dialog confirm); manual keyboard walk.
- **Decision:** Implement.

### R-07 Application shell and navigation
- **Role / area:** Shared. `app-shell.tsx`, `sidebar-nav.tsx`, `mobile-bottom-nav.tsx`, `avatar-menu.tsx`, `lib/constants/navigation.ts`
- **Problem:**
  - No skip link (F-07).
  - No `aria-current` or focus styles (F-10).
  - Flat 16-item admin nav (F-21).
  - Mobile labels wrap (F-22).
  - Ambiguous wordmark and header controls (F-31, F-33).
- **Evidence:** `firstTabFocus` = logo on 15/15 routes; screenshots.
- **Proposed change:**
  - Skip link plus `<main id="main" tabIndex=-1>`.
  - `aria-current="page"` and focus rings on nav links.
  - Optional `group` on `NavItem` for admin section headings.
  - Short mobile labels (`mobileLabel`).
  - Text wordmark "**AI**dea".
  - `aria-label` on the avatar trigger.
- **Why:** orientation and keyboard efficiency.
- **Expected effect:**
  - Users: admins reach content in 1 Tab and can scan the nav by stage.
  - Engineering: nav config stays the single source.
- **Skill / guideline:** Vercel (skip link, focus); UI/UX Pro Max navigation; frontend-design (subject-specific identity).
- **Accessibility impact:** positive.
- **Responsive impact:** mobile labels fit on 1 line.
- **Business-logic risk:** none. Hrefs and order are unchanged, and `navigation.test.ts` invariants still hold.
- **Priority / class:** P1, Should improve. Effort: M. Dependencies: R-01.
- **Acceptance criteria:**
  - The first Tab on any authenticated route focuses "Skip to main content".
  - The active nav link has `aria-current="page"`.
  - No bottom-nav label wraps at 360 px.
- **Validation:** after-phase `firstTabFocus`; screenshot at 360; unit nav tests.
- **Decision:** Implement.

### R-08 Participant home: next step and timeline
- **Role / area:** Participant. `app/overview/participant-overview.tsx`, new `components/overview/*`
- **Problem:** no next step; voting link always shown; unlabelled date (F-18); sequential awaits (F-40).
- **Evidence:** `participant__overview__laptop-1280.png`; `participant-overview.tsx:13-80`.
- **Proposed change:**
  - Derive the next step from existing reads, in priority order:
    1. Commit conflict.
    2. A draft exists: "Finish your draft". It explains that drafts can't be reopened yet and links to My Ideas.
    3. No idea and the submission window is open: "Submit your idea by {date}".
    4. Submitted: "Your idea is with a mentor for review".
    5. Voting open: "Cast your vote".
  - Programme timeline from `programs` dates.
  - List of the user's ideas (up to 5) with `StatusBadge`.
  - `Promise.all` for the reads.
- **Why:** answers "what do I do next?" for infrequent users.
- **Expected effect:**
  - Users: the action is obvious on the first screen.
  - Engineering: the home page no longer waits on three queries in sequence.
- **Skill / guideline:** frontend-design (lead with the subject); React `async-parallel`; UI/UX Pro Max hierarchy.
- **Accessibility impact:** positive (headings).
- **Responsive impact:** single column on mobile.
- **Business-logic risk:** low. Read-only queries reuse existing visibility rules (the My Ideas SQL).
- **Priority / class:** P1, Should improve. Effort: M. Dependencies: R-01, R-02.
- **Acceptance criteria:**
  - The H1 is the next-step sentence.
  - The voting link appears only while voting is open.
  - Every date is labelled.
  - The list shows a status for each idea.
- **Validation:** screenshots at 390 and 1280; axe; manual check against seed data.
- **Decision:** Implement.

### R-09 Mentor home: reviews to do
- **Role / area:** Mentor. `app/overview/mentor-overview.tsx`
- **Problem:** the count uses the assignment state and contradicts the queue; nothing is linked (F-19).
- **Evidence:** "Pending reviews 4" on the overview while `/reviews` lists the same assignments as Submitted.
- **Proposed change:**
  - Use `fetchMyReviewQueue` and `filterQueueByTab` (the same source as `/reviews`).
  - Next step is "{n} reviews to start" or "All reviews are done".
  - List of not-started, draft and reopened reviews, linked to `/reviews/[id]`.
  - Per-tab counts linked to `/reviews?tab=`.
- **Why:** one definition of "pending", and one tap to the work.
- **Expected effect:**
  - Users: no false work.
  - Engineering: removes the duplicate query.
- **Skill / guideline:** UI/UX Pro Max dashboards; Composition (reuse the service).
- **Accessibility impact:** positive.
- **Responsive impact:** list on mobile.
- **Business-logic risk:** none (reuses an existing scoped read).
- **Priority / class:** P1, Must fix. Effort: S. Dependencies: R-02.
- **Acceptance criteria:** the overview count equals the number of rows in the `/reviews` not-started + draft + reopened tabs, and each row links to its review.
- **Validation:** compare the overview with `/reviews` tabs for `demo.mentor1`; screenshots.
- **Decision:** Implement.

### R-10 Admin home: decisions first
- **Role / area:** Admin. `app/overview/admin-overview.tsx`, new `components/layout/metric.tsx`
- **Problem:**
  - Invisible heading; warnings are not links (F-02).
  - Equal tiles (F-20).
  - DB action keys in the feed (F-23).
- **Evidence:** `admin__overview__laptop-1280.png`.
- **Proposed change:**
  - The "Needs a decision" list comes first; each item links to its page and uses `AttentionFlag` tone.
  - Pipeline metrics in stage order as a compact `Metric` row (shared by all homes).
  - Readable audit labels (`humanizeAuditAction`).
  - Remove the duplicate pill row.
- **Why:** admins act on exceptions, not totals.
- **Expected effect:**
  - Users: the next decision is one click away.
  - Engineering: one metric component instead of three.
- **Skill / guideline:** frontend-design (avoid big-number tiles); Taste (no 3-col equal cards); UI/UX Pro Max.
- **Accessibility impact:** positive.
- **Responsive impact:** 2-column metrics on mobile.
- **Business-logic risk:** none (same queries).
- **Priority / class:** P1, Must fix. Effort: M. Dependencies: R-01, R-02.
- **Acceptance criteria:**
  - The heading is visible (contrast 4.5:1 or better).
  - Every warning is a link.
  - No `snake_case` action text is rendered.
  - Metrics follow pipeline order.
- **Validation:** screenshot; axe; unit test for `humanizeAuditAction`.
- **Decision:** Implement.

### R-11 Route-level loading, error and not-found states
- **Role / area:** Shared. `app/(admin|mentor|participant)/loading.tsx` and `error.tsx`, `app/overview/loading.tsx` and `error.tsx`, `app/not-found.tsx`
- **Problem:** none exist (F-39).
- **Evidence:** file search returns 0.
- **Proposed change:** skeletons that reuse `loading-skeletons.tsx`; an error boundary with reset; a not-found page.
- **Why:** feedback during slow SQL queries and a way to recover from errors.
- **Expected effect:**
  - Users: an immediate response after navigating, and recovery without a reload.
  - Engineering: streaming.
- **Skill / guideline:** React `async-suspense-boundaries`; UI/UX Pro Max Next.js stack (`loading.tsx`, `error.tsx`).
- **Accessibility impact:** `aria-busy` on skeletons; the error page has a heading.
- **Responsive impact:** none.
- **Business-logic risk:** none.
- **Priority / class:** P1, Must fix. Effort: S. Dependencies: R-12.
- **Acceptance criteria:** files exist; an unknown idea id renders the not-found page with a link back; typecheck passes.
- **Validation:** navigate to `/ideas/00000000-0000-0000-0000-000000000000` as admin; build.
- **Decision:** Implement.

### R-12 Empty states that give direction
- **Role / area:** Shared. `components/layout/empty-state.tsx`, plus the pages that repeat "No active program"
- **Problem:** centred, generic copy (F-24).
- **Proposed change:**
  - Left-aligned layout; the title states the situation and the description gives the next action.
  - A shared `NoActiveProgram` component, phrased per role.
- **Expected effect:**
  - Users: they know what to do.
  - Engineering: 12 copies of one message become one component.
- **Skill / guideline:** frontend-design "emptiness is direction"; GIG left-align.
- **Accessibility impact:** none.
- **Responsive impact:** none.
- **Business-logic risk:** none.
- **Priority / class:** P2, Should improve. Effort: S. Dependencies: none.
- **Acceptance criteria:** `EmptyState` has no `text-center`; "No active program" copy comes from one component.
- **Validation:** grep; screenshots.
- **Decision:** Implement.

### R-13 Valid ARIA on tabs and progress bars
- **Role / area:** Shared. `notification-list.tsx`, `publish-readiness-bar.tsx`, `mentor-directory-row.tsx`, `components/ui/progress.tsx`
- **Problem:** `aria-valid-attr-value` and `aria-progressbar-name` (F-05, F-06).
- **Proposed change:** tabs become a labelled filter group (`TabsList` with `aria-label`) without dangling `aria-controls`; progress bars get an `aria-label`.
- **Accessibility impact:** positive.
- **Responsive impact:** none.
- **Business-logic risk:** none.
- **Priority / class:** P1, Must fix. Effort: S.
- **Acceptance criteria:** axe reports 0 of either rule on /notifications, /screening and /project-mentor.
- **Validation:** after-phase axe.
- **Decision:** Implement.

### R-14 Resume a saved draft
- **Role / area:** Participant. New edit route, My Ideas row link
- **Problem:** drafts can't be reopened (F-17).
- **Proposed change:** `/submit?idea=<id>` loads the draft through a new read in `lib/services/ideas.ts` and pre-fills `IdeaWizard`; My Ideas links each draft.
- **Business-logic risk:** medium. It needs an ownership check on the read, and a review of `saveIdeaDraft` for the existing-id path and for locking after submission.
- **Priority / class:** P1, Must fix. Effort: M.
- **Acceptance criteria:** a saved draft reopens with every field restored; a submitted idea can't be opened for editing.
- **Validation:** new e2e test against a dedicated draft.
- **Decision:** **Planned.** It changes data loading for a protected flow and needs server-action review, outside this safe visual/UX slice. In the meantime, R-08 explains the limitation honestly instead of implying drafts can be resumed.

### R-15 Reduced motion and `transition-all`
- **Role / area:** Shared. `globals.css`, `sidebar-nav.tsx`
- **Problem:** F-08.
- **Proposed change:** a global reduced-motion rule; explicit transition properties.
- **Priority / class:** P2, Must fix. Effort: S.
- **Acceptance criteria:** the media query exists; no `transition-all` in app or components.
- **Validation:** grep; emulate reduced motion in the browser.
- **Decision:** Implement.

### R-16 Card, radius and elevation policy
- **Role / area:** Shared. `card.tsx`, `--radius`
- **Problem:** F-28.
- **Proposed change:** 6 px radius; no card shadow; headings as `h2` (see R-24).
- **Priority / class:** P2, Should improve. Effort: S. Dependencies: R-01.
- **Acceptance criteria:** `Card` has no `shadow`; `--radius` is 0.375rem.
- **Validation:** grep; screenshots.
- **Decision:** Implement.

### R-17 Prioritised mobile cards for tables
- **Role / area:** Shared. `components/ui/responsive-table.tsx`, `reviews/page.tsx`, `my-ideas/page.tsx`
- **Problem:** F-38.
- **Proposed change:**
  - Left-aligned key/value pairs.
  - Columns can be marked `primary` (shown as the card title) or `mobileHidden`.
  - The action column renders as a full-width 44 px link.
- **Priority / class:** P2, Should improve. Effort: S.
- **Acceptance criteria:** at 390, the idea title is the card heading; no empty `<dt>`; the row action is at least 44 px tall.
- **Validation:** screenshot at 390.
- **Decision:** Implement.

### R-18 Consolidate metric and pagination components
- **Role / area:** Shared
- **Problem:** F-35.
- **Proposed change:** a shared `Metric` (R-10). The pagination merge is planned.
- **Priority / class:** P2, Should improve. Effort: S.
- **Acceptance criteria:** no local `StatCard` remains.
- **Validation:** grep.
- **Decision:** Implement (Metric). Pagination is **Planned** (low user impact).

### R-19 Break up the submit form
- **Role / area:** Participant. `idea-wizard.tsx`
- **Problem:** F-36.
- **Proposed change:** extract `ProfilePicker`, `FormField`, and the validation helper `collectIdeaIssues` (pure and unit-tested).
- **Priority / class:** P2, Should improve. Effort: M. Dependencies: R-06.
- **Acceptance criteria:** `idea-wizard.tsx` is shorter, and `collectIdeaIssues` has unit tests.
- **Validation:** vitest.
- **Decision:** Implement.

### R-20 Run the participant home reads in parallel
- **Role / area:** Participant
- **Problem:** F-40.
- **Proposed change:** `Promise.all`.
- **Priority / class:** P2, Should improve. Effort: S.
- **Acceptance criteria:** independent awaits are combined.
- **Validation:** code review.
- **Decision:** Implement (part of R-08).

### R-21 Exclude vendored skill folders from typecheck and lint
- **Role / area:** Engineering. `tsconfig.json`, `eslint.config.mjs`
- **Problem:** F-41.
- **Proposed change:** add `agent-skills`, `skills`, `ui-ux-pro-max-skill`, `claude-marketplace` and `design-audit` to `exclude` and `ignores`.
- **Priority / class:** P2, Must fix. Effort: S.
- **Acceptance criteria:** `npm run typecheck` and `npm run lint` exit 0.
- **Validation:** run both.
- **Decision:** Implement.

### R-22 Remove dead components
- **Role / area:** Shared
- **Problem:** F-34.
- **Priority / class:** P3, Could explore.
- **Decision:** **Planned.** `loading-skeletons` and `skeleton` become used by R-11. The others are kept until the owner confirms they aren't planned (stepper may serve R-14).

### R-23 Fallback for untitled drafts
- **Role / area:** Admin. `(admin)/ideas/page.tsx`
- **Problem:** F-25.
- **Proposed change:** show "Untitled draft" in muted italic-free text.
- **Priority / class:** P2, Should improve. Effort: S.
- **Acceptance criteria:** no empty title row.
- **Validation:** screenshot.
- **Decision:** Implement.

### R-24 Heading hierarchy and decorative icons
- **Role / area:** Shared. `card.tsx`, `empty-state.tsx`, `page-header.tsx`
- **Problem:** F-12.
- **Proposed change:** `CardTitle` renders `h2`; decorative icons get `aria-hidden`.
- **Priority / class:** P2, Should improve. Effort: S.
- **Acceptance criteria:** no h1-to-h3 skips on captured routes.
- **Validation:** heading outline via `read_page`.
- **Decision:** Implement.

### R-25 Copy consistency
- **Role / area:** Shared
- **Problem:** F-26.
- **Proposed change:** sentence case for actions touched in this pass ("Save draft", "Submit review"); stage labels without em dashes.
- **Priority / class:** P3, Could explore. Effort: S.
- **Acceptance criteria:** labels that change in this pass follow sentence case.
- **Validation:** review.
- **Decision:** Implement for touched files only.

### R-26 Explain the disabled review submit
- **Role / area:** Mentor. `review-form.tsx`
- **Problem:** F-15.
- **Proposed change:** list the missing answers next to the disabled Submit (`aria-describedby`).
- **Priority / class:** P2, Should improve. Effort: S.
- **Acceptance criteria:** with an incomplete form, the reason text is visible and linked to the button.
- **Validation:** manual browser check (no submit).
- **Decision:** Implement.

### R-27 GCPL logo and Godrej Signature lockup on sign-in
- **Role / area:** Public. `app/(auth)/layout.tsx`, `public/brand/*`
- **Problem:** there are no brand marks on the only public page. GIG lockup rule (F-27).
- **Proposed change:**
  - Fetch the GCPL logo (`GI-GCPL-new.jpg`) and the Godrej Signature (`GI_Signature_Black_6437d2e3c3.jpg`) from godrejindustries.com/uploads.
  - Crop each to its content and make the background transparent.
  - Place the GCPL logo bottom-left and the Signature bottom-right, at the same height and bottom-aligned, on a white surface.
- **Priority / class:** P2, Should improve. Effort: S.
- **Business-logic risk:** none.
- **Acceptance criteria:** both marks are visible, black on white, same height, in opposite bottom corners, and never recoloured.
- **Validation:** screenshot at 390 and 1280.
- **Decision:** Implement. If the asset fetch fails, it becomes Blocked and the user is asked to upload the files.

---

## Do not change
- Route URLs, nav labels' wording, form field names and server actions (Taste redesign protocol; business-logic safety).
- Workflow status values and the DB schema.
- lucide icons (Taste prefers other libraries, but switching would add no user value).
- The two-column desktop review layout, the URL-driven filters, and the confirm dialogs (all tested as working).
- shadcn/Radix primitives (keep them; restyle with tokens).
