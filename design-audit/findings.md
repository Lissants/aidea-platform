# Findings

Every finding below is backed by repository evidence (file:line), by the captured run in `design-audit/evidence/before/`, or by both. The captured run includes the screenshots, `results-*.json` (axe, overflow, console errors, first-Tab focus) and the logs. Severity uses the backlog scale:

- **P0**: blocks task completion, accessibility, security or correctness
- **P1**: major usability, hierarchy or responsive problem
- **P2**: consistency, maintainability or performance
- **P3**: polish

Visual preference is never presented here as a usability failure. Where a finding is a matter of taste or brand compliance, it says so.

Viewport shorthand: 360 = narrow mobile, 390 = standard mobile, 768 = tablet, 1280 = laptop, 1536 = wide desktop.

---

## Part A: Findings by skill lens

Each skill was applied on its own first. Part B merges the results into one deduplicated list (F-xx).

### A1. Vercel Web Interface Guidelines
Rules were fetched from `vercel-labs/web-interface-guidelines/command.md` on 2026-10-04.

| Area | Status | Evidence | Finding |
|---|---|---|---|
| Icon-only buttons have `aria-label` | Fail | 4 remove buttons in `components/forms/idea-wizard.tsx:268,305,386,488`; axe `button-name` ×3 on /submit | F-03, F-11 |
| Form controls have labels | Fail | axe `label` and `select-name` (12 nodes) on /submit, /ideas, /dashboard, /project-mentor; 21 `<Label>` without `htmlFor` | F-03, F-04 |
| `<button>` for actions, `<a>` for navigation | Pass | No `div onClick` found (grep); navigation uses `next/link` | none |
| Decorative icons `aria-hidden` | Partial | `StatusBadge` icons are hidden; icons in nav, cards and empty states are not (e.g. `empty-state.tsx:22`) | F-12 |
| Async updates `aria-live` | Pass | Sonner toasts use a live region | none |
| Heading hierarchy + skip link | Fail | `CardTitle` is an `h3` directly under the page `h1` (`components/ui/card.tsx:22`); no skip link (first Tab lands on the logo on 15/15 authenticated routes) | F-07, F-12 |
| Visible focus on every interactive element | Partial | Primitives use `focus-visible:ring`; hand-styled links (`admin-overview.tsx:195-212`, `reviews/page.tsx:79`, `mobile-bottom-nav.tsx:29`) do not | F-10 |
| Sticky UI does not obscure focus | Fail | On mobile the sticky action bar renders under the fixed bottom nav (browser measurement below) | F-14 |
| Inline errors; focus first error on submit | Fail | `idea-wizard.tsx:217-227` shows only the first error, as a toast | F-13 |
| Submit enabled until request starts | Partial | Review form disables Submit until complete, with no explanation (`review-form.tsx:182`) | F-15 |
| Placeholders end with `…` | Partial | Most do; "Enter a concise idea title" does not | F-26 |
| Warn before leaving with unsaved changes | Fail | Neither form guards navigation | F-17 (noted) |
| `prefers-reduced-motion` honoured | Fail | 0 occurrences in the repo | F-08 |
| No `transition: all` | Fail | `sidebar-nav.tsx:27` uses `transition-all` | F-08 |
| `tabular-nums` on number columns | Fail | Stat values and tables do not use it | F-28 |
| Long content handled | Partial | Long titles wrap; an untitled draft renders a blank title (`(admin)/ideas/page.tsx:105`, screenshot `admin__ideas__mobile-390.png`) | F-25 |
| URL reflects state | Pass | Filters, tabs and pagination are all in query params | none |
| Destructive actions confirmed | Pass | `ConfirmDialog` is used for submit, publish and remove | none |
| `color-scheme`, `theme-color` | Unable to verify / Fail | `next-themes` sets `data-theme` only; no `theme-color` meta | F-32 |
| Native `<select>` explicit bg/colour | Pass | `bg-background` is set on all native selects | none |
| `Intl` date formatting | Pass | `formatDate` and `toLocaleDateString('en-IN')` | none |
| Hydration safety | Pass | 0 hydration warnings in console capture | none |
| Copy: specific button labels | Partial | "Apply", "Open" and "Submit" are generic in places | F-26 |
| Copy: errors include next step | Fail | Empty states and the DB-constraint error give no direction | F-16, F-24 |

### A2. Vercel React Best Practices
| Rule | Status | Evidence | Finding |
|---|---|---|---|
| `async-parallel` | Partial | `admin-overview.tsx:56` correctly uses `Promise.all`. `participant-overview.tsx:13-28` awaits program, then count, then conflicts, in sequence | F-40 |
| `async-suspense-boundaries` | Fail | 0 `Suspense` boundaries and 0 `loading.tsx` files, so pages block until every query finishes | F-39 |
| `server-serialization` | Pass | Only `role` crosses into `SidebarNav` and `MobileBottomNav` (the comment at `sidebar-nav.tsx:12` explains why) | none |
| `server-cache-react` | Pass | `getCurrentUser` is wrapped in `cache()` (`lib/auth/session.ts`) | none |
| `rerender-no-inline-components` | Pass | No components are defined inside render; `ProfilePicker` and `RequiredMark` are module-level | none |
| `rerender-derived-state-no-effect` | Partial | `theme-toggle.tsx:17` uses a mounted-flag effect (lint warns) | F-33 |
| `bundle-barrel-imports` | Pass | lucide-react is tree-shaken by Next by default; no internal barrels | none |
| `bundle-dynamic-imports` | Not applicable | `recharts` is only used on `/reports` (an admin page), so the cost is already scoped by route | none |
| `rendering-conditional-render` | Partial | `&&` with numbers is not used dangerously; no `0`-render bugs were seen | none |
| Hydration risk | Pass | 0 console errors across 80 route/viewport captures | none |

### A3. Vercel Composition Patterns
| Rule | Status | Evidence | Finding |
|---|---|---|---|
| Avoid boolean props | Pass | The worst case is `ConfirmDialog` (`open`, `destructive`, `confirmDisabled`), which is acceptable | none |
| Explicit variants over modes | Fail | Status rendering is done ad hoc in 6 places instead of through explicit variants (see F-29) | F-29 |
| Monolithic components | Fail | `idea-wizard.tsx` is 609 lines: 8 `useState` hooks, 5 sections, inline picker and validation | F-36 |
| Children over render props | Partial | `ResponsiveTable` takes `cell` render functions (appropriate, because data flows back) and an optional `mobileCard` that nobody uses | F-38 |
| Generic components hiding product variants | Fail | `Card` and `CardTitle` serve as stat tile, panel, list row and alert. Three stat-card copies exist (`admin-overview.tsx:27`, `participant-overview.tsx:47`, `mentor-overview.tsx:30`) | F-35 |
| React 19: no `forwardRef` | Partial | shadcn primitives (`button.tsx`, `card.tsx`) still use `forwardRef`. It works under React 19.3; migration is optional | none (documented, not changed) |

### A4. Anthropic frontend-design
| Check | Status | Evidence | Finding |
|---|---|---|---|
| Aesthetic direction tied to the subject | Fail | Default shadcn slate/blue with a lightbulb-in-blue-tile mark (`app-shell.tsx:20-26`) that could belong to any AI tool | F-27, F-31 |
| Typography intentional | Fail | Tailwind's default `font-sans` stack, with no display role. The `layout.tsx` comment claims a stack in globals.css that does not exist | F-27 |
| Generated-UI tells | Fail | "SaaS-card kit": the same `rounded-xl border shadow-sm` on every Card (`card.tsx:8`), the same tile grid on all three homes, solid pill badges | F-28 |
| Hero/first screen is the subject's most characteristic thing | Fail | The participant first screen is "Welcome, Sara" plus 3 equal cards, with no idea status or next step (`participant__overview__laptop-1280.png`) | F-18 |
| Copy written from the user's perspective | Fail | DB vocabulary shown to users: "team_leader_assigned on idea" (`admin-overview.tsx:181`), "status: submitted" (`ideas/[ideaId]/page.tsx:57`) | F-23 |
| Motion: one deliberate moment | Pass (absent) | No decorative motion exists, so nothing needs removing | none |
| Quality floor (focus, reduced motion, contrast) | Fail | See A1 and A5 | F-01, F-07, F-08 |

### A5. UI/UX Pro Max
Queries are logged in README.md.

| Priority / rule | Status | Evidence | Finding |
|---|---|---|---|
| 1 Contrast 4.5:1 | Fail | axe `color-contrast`: 169 nodes across 16/16 routes at 390 and 1280 | F-01 |
| 1 Focus not obscured (WCAG 2.4.11 AA) | Fail | Measured at 375 px on /submit at scrollY 400: action bar at y 751–812, bottom nav at y 748–812. `elementFromPoint` at the "Submit idea" position returns "More" | F-14 |
| 2 Touch targets ≥44 px | Fail | Remove buttons are 24 px (`h-6 w-6`); "Open" row links are text-size; bottom-nav items pass (64 px tall) | F-11, F-38 |
| 5 No horizontal scroll | Pass | `overflowPx = 0` on all 80 captures (`results-*.json`) | none |
| 5 Mobile-first | Partial | Tables become cards on mobile, but the cards list every column, right-aligned (`responsive-table.tsx:74-76`) | F-38 |
| 6 Semantic colour tokens, no raw palette | Fail | `amber-*` in 6 places; chart hex palette in `reports-charts.tsx:7` | F-29 |
| 7 Reduced motion | Fail | none | F-08 |
| 8 Error near field + focusable summary | Fail | Toast only | F-13 |
| 9 Bottom nav ≤5, labels fit | Partial | 4 + More is good, but admin labels wrap to 2 lines at 390 (`admin__ideas__mobile-390.png`) | F-22 |
| Colour not the only signal | Pass | `StatusBadge` pairs icon and label. The amber "Membership conflict" pill has text but no icon | F-29 |
| Heading hierarchy | Fail | h1 to h3 | F-12 |
| Style match (enterprise tool) | Partial | The design-system query returned "Minimalism & Swiss Style" for this product type. The current UI is closer to a generic SaaS kit | F-28 |

### A6. Taste Skill v2
Fetched from `Leonxlnx/taste-skill/skills/taste-skill/SKILL.md` and `redesign-skill/SKILL.md`. It is mostly written for marketing pages, so only the rules that apply to product UI were used.

| Pre-flight / ban | Status | Evidence | Finding |
|---|---|---|---|
| One accent colour, used identically | Fail | Blue primary, plus solid green, amber, red and blue badges, plus raw amber pills | F-29 |
| One corner-radius system | Fail | `rounded-xl` cards, `rounded-md` controls and `rounded-full` badges/pills, with no rule tying radius to hierarchy | F-28 |
| No decorative status dots / every badge has meaning | Partial | "N/A" badges with a minus icon fill every mentor queue row (`mentor__reviews__mobile-390.png`), adding noise without information | F-38 |
| No border-t + border-b on every row | Pass | Tables use a single divider | none |
| Empty, loading and error states provided | Fail | Empty: yes, but generic. Loading and error: none | F-24, F-39 |
| Dark-mode parity, tested | Fail | `dark:` utilities never apply (`tailwind.config.ts:4` `['class']` versus `data-theme`) | F-32 |
| No 3-column equal-card rows | Fail | All three role homes use `grid sm:grid-cols-2 lg:grid-cols-3` (or 4) of identical cards | F-28 |
| Redesign protocol: never silently change nav labels, URLs or field names | Adopted | Route URLs, field names and status values are preserved. Admin nav labels keep their wording and are only grouped | none |

---

## Part B: Merged findings

### Accessibility
**F-01 Text contrast fails across the app (P0)**
- **Where:** all 16 captured routes, at 390 and 1280.
- **Evidence:** axe `color-contrast` (serious), 169 nodes. Most common targets:
  - active sidebar item `.bg-primary/10 > .truncate` (14)
  - `.shadow` tab triggers (10)
  - solid `bg-success`, `bg-warning` and `bg-information` badges with white text
  - `text-primary` links
- **Root cause:** `--primary: 217 91% 55%` (blue) on white and on 10% tints, and `--*-foreground: white` on mid-tone fills (`app/globals.css:16,31-38`).
- **Consequence:** low-vision users can't read the active navigation item, status labels or links.

**F-02 "Needs attention" heading is invisible (P0)**
- **Where:** `app/overview/admin-overview.tsx:128`, which uses `text-warning-foreground`; that token is white (`globals.css:35`), shown on a `bg-warning/5` card.
- **Evidence:** screenshot `admin__overview__laptop-1280.png`, where the heading is unreadable. Also axe `.text-warning-foreground`.
- **Consequence:** the admin's most important panel has no visible label.

**F-03 Submit form has unnamed controls (P0)**
- **Where:** `/submit`.
- **Evidence:**
  - axe `button-name` (critical) ×3: the impact-type Select trigger and the two mentor-priority Select triggers.
  - axe `label` (critical): the team-name input.
  - Code: 12 `<Label>`s without `htmlFor` (`idea-wizard.tsx:253,260,281,322,333,345,357,366,414,427,455,556`).
- **Consequence:** screen-reader users can't tell what each field is for.

**F-04 Filters and selects have no name (P0)**
- **Where:** `/ideas` (`(admin)/ideas/page.tsx:58-85`), `/dashboard`, `/project-mentor`.
- **Evidence:** axe `select-name` (critical), 12 nodes.
- **Consequence:** filters are unlabeled for assistive technology, and the placeholder disappears once the user starts typing.

**F-05 Notification tabs have invalid ARIA (P1)**
- **Where:** `components/notifications/notification-list.tsx:45-50`.
- **Evidence:** axe `aria-valid-attr-value` on `#radix-…-trigger-all`. The `TabsTrigger`s have no `TabsContent`, so `aria-controls` points to nothing.

**F-06 Progress bars have no name (P1)**
- **Where:** `components/admin/publish-readiness-bar.tsx:43`, `components/admin/mentor-directory-row.tsx:42`.
- **Evidence:** axe `aria-progressbar-name` on `/screening` and `/project-mentor`.

**F-07 No skip link (P1)**
- **Evidence:** `firstTabFocus` is `a[href=/overview] "AIdea"` on all 15 authenticated route captures. Admins must tab through 16 sidebar links to reach the content.

**F-08 No reduced-motion support; `transition-all` (P2)**
- **Evidence:**
  - `grep prefers-reduced-motion|motion-reduce` returns 0 hits.
  - `transition-all` at `sidebar-nav.tsx:27`.
  - Radix sheet and dialog slide animations from `tailwindcss-animate`.

**F-09 Review radio groups have no group name (P1)**
- **Where:** `components/reviews/review-form.tsx:46,142`. The `<Label>` is not linked to its `RadioGroup`.
- **Consequence:** a screen reader announces "Yes, radio button" without saying which question it answers.

**F-10 Current page and focus are not exposed in navigation (P2)**
- **Evidence:**
  - No `aria-current` (`sidebar-nav.tsx:48-61`, `mobile-bottom-nav.tsx:29-39`).
  - Hand-styled links have no `focus-visible` style (`admin-overview.tsx:195-212`, `(mentor)/reviews/page.tsx:79-88`, `(admin)/ideas/page.tsx:137,142`).

**F-11 Remove buttons are too small and unlabeled (P1)**
- **Where:** `idea-wizard.tsx:268,305,386,488`: `h-6 w-6` (24 px) with no `aria-label`.

**F-12 Heading levels skip and decorative icons are announced (P2)**
- **Evidence:**
  - `CardTitle` renders an `h3` (`card.tsx:22`) directly under the `h1` from `PageHeader`.
  - Lucide icons in `CardDescription` and `EmptyState` lack `aria-hidden`.

### Interaction and forms
**F-13 Validation runs only on submit and shows one toast (P1)**
- **Where:** `idea-wizard.tsx:178-227`.
- **Evidence:** `validateStep` returns `issues[0]` only, and `openSubmitConfirm` calls `toast.error` for the first failing section. There is no inline message, no `aria-invalid` and no focus move.
- **Consequence:** participants have to fix errors one at a time, guessing which field each toast refers to.

**F-14 Mobile Save/Submit bar is hidden behind the bottom nav (P0)**
- **Where:** `components/layout/contextual-action-bar.tsx:17` (`sticky bottom-0 z-30`) against `mobile-bottom-nav.tsx:24` (`fixed bottom-0 z-40 h-16`).
- **Evidence:** browser measurement at 375×812, `/submit`, scrollY 400:
  - bar at 751–812
  - nav at 748–812
  - `elementFromPoint` on "Submit idea" hits "More"
- **Affects:** `/submit`, `/reviews/[id]` and every admin page that uses `ContextualActionBar`.
- **Consequence:** this fails WCAG 2.4.11 (Focus Not Obscured) and hides the primary action while the user scrolls.

**F-15 Review Submit is disabled with no reason (P2)**
- **Where:** `review-form.tsx:81-82,182`.
- **Consequence:** the requirement that the comment be at least 10 characters isn't shown anywhere.

**F-16 Mentor preference rule is not enforced (P0, functional)**
- **Where:** `lib/validation/schemas.ts:118-125`.
- **Evidence:**
  - The refine checks that *priorities* are unique, but its message says "must be different mentors".
  - There is no minimum, so 0 or 1 preference passes, even though the UI says "Choose exactly two" (`idea-wizard.tsx:551`).
  - Choosing the same mentor for both priorities passes client validation, then violates `uq_idea_mentor_preferences_mentor` (`db/migrations/0001_schema.sql:196`) during save, which gives a raw DB error.
- **Consequence:** this breaks the brief's requirement to "select two distinct mentor preferences". Ideas can reach routing without the preferences admins rely on.

**F-17 Drafts can't be resumed (P1)**
- **Evidence:** My Ideas rows have no link (`my-ideas/page.tsx:48-68`), and `/submit` always initialises empty state (`idea-wizard.tsx:158-173`).
- **Consequence:** "Save draft" gives a false sense of safety, because nothing can be reopened from the UI.

### Information architecture
**F-18 Participant home has no next step (P1)**
- **Where:** `participant-overview.tsx:46-80`.
- **Evidence:** three equal cards: the ideas count (not linked), "Cast your vote" (shown whatever the voting state), and a bare date "10 Oct" with no label saying what closes.
- **Consequence:** an infrequent user can't tell which idea needs action or what happens next.

**F-19 Mentor home shows a misleading pending count (P1)**
- **Where:** `mentor-overview.tsx:14-21`.
- **Evidence:**
  - The count is `review_assignments.status = 'pending'`, which is the *assignment* state. Captured run: "Pending reviews 4" for `demo.mentor1`, while `/reviews` for the same mentor lists those assignments as **Submitted**.
  - The admin home shows "Pending reviews 0" using a different definition (`admin-overview.tsx:64`).
- **Consequence:** mentors are told they have work they have already finished.

**F-20 Admin home puts counts before decisions (P1)**
- **Where:** `admin-overview.tsx:125-213`.
- **Evidence:**
  - 8 tiles of equal weight. The Lightbulb and Rocket icons are each used twice. "Pending reviews" links to `/review-assignment`.
  - Warnings are plain bullets, not links.
  - A row of 6 quick-link pills repeats the sidebar.

**F-21 Admin nav is one flat list (P2)**
- **Where:** `lib/constants/navigation.ts:68-85`.
- **Evidence:** 16 ungrouped items. The pipeline order (Review assignment → Screening → Qualifier → Project mentor → Final presentation → Showcase) is not shown as a sequence.

**F-22 Admin mobile nav labels wrap (P2)**
- **Evidence:** "Idea Management", "Screening Decision" and "Reports & Audit" wrap to 2 lines at 390 (`admin__ideas__mobile-390.png`).

### Content
**F-23 Database terms reach users (P1)**
- **Evidence:**
  - `admin-overview.tsx:181` shows `{a.action} on {a.entity_type}`, e.g. "team_leader_assigned on idea".
  - `ideas/[ideaId]/page.tsx:57` shows `status: {idea.review.status}`.

**F-24 Generic empty states (P2)**
- **Evidence:**
  - "No active program" ×12 files with no direction.
  - "Nothing here" (`reviews/page.tsx:96`).
  - Centred layout (`empty-state.tsx:17`), against the GIG left-alignment rule.

**F-25 Untitled draft renders a blank row (P2)**
- **Where:** `(admin)/ideas/page.tsx:105`.
- **Evidence:** `admin__ideas__mobile-390.png`.

**F-26 Copy is inconsistent (P3)**
- **Evidence:**
  - "Save draft" vs "Save as Draft".
  - "Submit" vs "Submit idea" vs "Submit Review".
  - Em-dash stage labels: "Screened — Passed" (`lib/ideas/stage.ts`).
  - Mixed Title Case and sentence case.

### Visual (brand compliance and hierarchy)
**F-27 Palette and type are off-brand (P1, brand rule)**
- **Evidence:** blue/slate HSL tokens (`globals.css:7-44`) and the Tailwind default font stack. GIG standards require #141414 / #FFFFFF, Arial (or GI Sans), left-aligned text.

**F-28 Every surface is the same rounded, shadowed card (P2)**
- **Evidence:**
  - `card.tsx:8` uses `rounded-xl … shadow-sm` for every container.
  - `--radius: 0.75rem`.
  - Badges use `rounded-full`.
  - Three-column identical tile grids on all three homes.
  - Stats have no `tabular-nums`.
- **Note:** this is a matter of taste and hierarchy, not a usability failure on its own. It contributes to F-18 and F-20 because nothing stands out.

**F-29 Status rendering is fragmented (P1)**
- **Evidence:** 6 separate mappings:
  1. `STATUS_META`
  2. `REVIEW_STATUS_LABEL` (`reviews/page.tsx:23`)
  3. `STAGE_LABEL` (`lib/ideas/stage.ts:9`) rendered as a grey pill (`ideas/page.tsx:121`)
  4. `screening-row.tsx:57`
  5. `project-mentor-row.tsx:24`
  6. amber pills (`ideas/page.tsx:112-119`, `my-ideas/page.tsx:59`, `team-management-card.tsx:82`, `assign-team-member-dialog.tsx:157`, `commit-idea-panel.tsx:40`)
- **Consequence:** the same state looks different on different pages, and some states rely on colour (an amber outline) or have no icon.

**F-30 Decorative gradient and blur (P3)**
- **Where:** `(auth)/layout.tsx:3` (gradient); `app-shell.tsx:43` and `contextual-action-bar.tsx:17` (backdrop-blur).

**F-31 Wordmark is hard to read (P3)**
- **Evidence:** in a sans-serif face, "AIdea" reads as "Aldea" because capital I and lowercase l look the same (all screenshots). The lightbulb-in-blue-tile mark is generic.

**F-32 Dark-mode variants never apply (P2, functional)**
- **Where:** `tailwind.config.ts:4` uses `darkMode: ['class']`, but next-themes sets `data-theme` (`app/layout.tsx`).
- **Consequence:** the 4 `dark:` overrides never take effect.

**F-33 Header controls are ambiguous (P3)**
- **Evidence:** the theme toggle shows a laptop icon when set to "System". The avatar button's accessible name is only the initials ("SP").

### Component architecture
**F-34 Dead code (P3)**
- **Evidence:** these are never imported: `ui/breadcrumb`, `ui/command`, `ui/form`, `ui/popover`, `ui/tooltip`, `layout/coming-soon`, `layout/stepper`, `layout/loading-skeletons` (and `ui/skeleton` through it).

**F-35 Duplicated patterns (P2)**
- **Evidence:**
  - 3 stat-card implementations.
  - 2 pagination implementations.
  - 11 native `<select>`s styled by hand alongside Radix `Select`.
  - Hand-rolled tab links (`reviews/page.tsx:77-90`) alongside `ui/tabs`.

**F-36 Monolithic submit form (P2)**
- **Where:** `idea-wizard.tsx`, 609 lines: 8 state hooks, an inline `ProfilePicker`, a nested-ternary validator (`:178-193`), and 5 sections in one Card.

**F-37 Badge renders a `<div>` (P2)**
- **Where:** `components/ui/badge.tsx:28`.
- **Consequence:** invalid inside phrasing content. Commit f160081 already had to fix a div-in-p bug.

**F-38 Mobile table cards are unprioritised (P2)**
- **Where:** `responsive-table.tsx:72-79`.
- **Evidence:** every column is rendered, right-aligned, including an empty `<dt>` for the action column. The `mobileCard` prop exists but is unused. The action "Open" is a text-sized link.

### Loading, empty and error states
**F-39 No route-level loading, error or not-found states (P1)**
- **Evidence:** 0 `loading.tsx`, 0 `error.tsx`, 0 `not-found.tsx`.
- **Consequence:** a slow SQL query gives a blank wait after navigation, and an exception shows the framework error page.

### Performance and engineering
**F-40 Sequential awaits on participant home (P2)**
- **Where:** `participant-overview.tsx:13-28`. The queries are independent but awaited one after another.

**F-41 Typecheck and lint fail on untracked folders (P2, pre-existing)**
- **Evidence:**
  - `npm run typecheck` fails with 24 errors, all in `ui-ux-pro-max-skill/` and `agent-skills/`.
  - `npm run lint` crashes with "could not find plugin react-hooks". Linting each folder on its own shows the crash comes only from the untracked `ui-ux-pro-max-skill/` and `claude-marketplace/` (exit 2); `agent-skills/`, `skills/` and `e2e/` lint cleanly.
  - Scoped to app source, the checks are clean: `tsc` 0 errors; eslint 0 errors and 6 warnings (`evidence/before/lint-app.log`).

### Passing checks (recorded so they aren't re-audited)
- No horizontal overflow at any of the 5 viewports (80/80 captures).
- No console errors or hydration warnings.
- No `div onClick`.
- URL-driven filters, tabs and pagination.
- Destructive actions confirmed.
- Unit tests: 50/50 pass.
- Server components by default; only role props cross into client navigation.
