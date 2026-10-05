# AIdea design audit

## Executive summary
AIdea's interface works: no overflow, no console errors, URL-driven filters, and confirmed destructive actions. It is held back by four kinds of problem:

1. **Accessibility failures across every screen.**
   - 169 contrast failures on 16/16 routes.
   - Unnamed form controls on the main submit form.
   - No skip link.
   - On phones, the Save/Submit bar is hidden behind the bottom navigation.
2. **Role homes that don't say what to do next.**
   - Participants see three equal cards.
   - Mentors see a "pending reviews" count that contradicts their own review queue.
   - Admins see eight equal tiles under a "Needs attention" heading that is white on white.
3. **A verified validation defect.** The "two different mentors" rule is not enforced, so the same mentor twice produces a database error.
4. **An off-brand, generic visual layer.** Blue/slate shadcn defaults, the same rounded shadowed card everywhere, and status shown six different ways. GIG standards require #141414/#FFFFFF, Arial and left-aligned text.

**Selected direction: "Monochrome workbench".** It combines the token and accessibility work of a conservative refinement with product-led role homes and a restrained typographic identity. Each role's home opens with one bold next-step sentence; everything else stays quiet. See `directions.md`.

## Method
1. **Discovery.** Read the stack, routes, auth, tokens and components.
2. **Baseline** (`baseline.md`):
   - Engineering checks.
   - A Playwright capture of 16 routes × 5 viewports, with axe, overflow, console errors and first-Tab focus.
   - Browser-pane measurements.
3. **Audit by skill.** Each skill was applied on its own first (`findings.md` Part A), then the results were merged (Part B, F-01…F-41).
4. **Journeys** (`journeys.md`), **directions** (`directions.md`), **backlog** (`improvement-plan.md`, R-01…R-27), **design system** (`design-system.md`).
5. **Coverage.** `audit-manifest.json` (88 checklist records), checked by `scripts/validate-design-audit.ts`.
6. **Implementation and re-verification** (`final-report.md`).

## Skills used
| Skill | Loaded | How it was used |
|---|---|---|
| Vercel web design guidelines | Yes. The skill fetches its rules from `vercel-labs/web-interface-guidelines/command.md`; fetched 2026-10-04 | Checklist A1 |
| Vercel React best practices | Yes (`agent-skills/skills/react-best-practices/SKILL.md`, 70 rules) | Checklist A2 |
| Vercel composition patterns | Yes (skill invoked) | Checklist A3; decomposing the submit form; explicit status variants |
| Anthropic frontend-design | Yes (skill invoked) | Checklist A4; two-pass design plan and its revision (`directions.md`) |
| UI/UX Pro Max | Yes (skill invoked, search tool run) | Checklist A5; queries below |
| Taste Skill v2 | Yes. Fetched from `github.com/Leonxlnx/taste-skill` (`skills/taste-skill/SKILL.md` and `skills/redesign-skill/SKILL.md`); not installed locally | Checklist A6; redesign "preserve" protocol |

UI/UX Pro Max queries (`python …/ui-ux-pro-max/scripts/search.py`):

| Query | Mode | Result used |
|---|---|---|
| `"internal innovation program enterprise workflow"` | `--design-system --variance 3 --motion 2 --density 7` | Style "Minimalism & Swiss" adopted. Palette, fonts and GSAP rejected (brand) |
| `"form inline validation error"` | `--domain ux` | Focusable error summary; inline errors |
| `"data table mobile responsive"` | `--domain ux` | Card layout on mobile |
| `"dashboard actionable priority"` | `--domain ux` | 0 results; retried as `"dashboard information hierarchy"`, which returned colour-only and heading hierarchy |
| `"focus not obscured"` | `--domain ux` | WCAG 2.4.11 check of the sticky bar |
| `"bottom nav limit"` | `--domain ux` | Sticky-nav compensation |
| `"status badge icon label"` | `--domain ux` | Status messages; badge labels don't wrap |
| `"enterprise neutral sans"` | `--domain typography` | Not adopted (brand requires Arial) |
| `"suspense loading error boundary"` | `--stack nextjs` | `loading.tsx` and `error.tsx` |

## Precedence when skills conflict
1. Accessibility, usability and task completion
2. Product requirements and functional correctness
3. Responsive behaviour and design-system consistency
4. Maintainable React
5. Performance
6. Aesthetic distinction

**GIG brand standards are an organisation rule.** They constrain level 6 absolutely; they never override levels 1–2.

Conflicts and how they were resolved:

| Conflict | Resolution |
|---|---|
| frontend-design and Taste: "#111 / pure black and white are AI tells" vs. GIG #141414/#FFFFFF | The brand wins. Identity comes from type and structure instead |
| UI/UX Pro Max design system: navy/green palette, Lexend/Source Sans | Rejected (brand) |
| Taste: Geist/Outfit fonts; Phosphor/Tabler icons | Rejected. Brand fonts; lucide kept (no user value in switching) |
| UI/UX Pro Max `--motion`: GSAP scroll reveal | Rejected. No task value, adds bundle weight, and frontend-design calls scattered reveals a tell |
| Taste: `DESIGN_VARIANCE` 7 default (asymmetry) | Overridden to about 3. Workflow screens favour predictability |
| Vercel "Title Case for headings and buttons" vs. frontend-design "sentence case" | Sentence case. It matches the existing majority and GIG plain-language practice |
| Taste: "no em dashes" | Adopted for UI copy touched in this pass |

## Scope and limitations
- **Read-only against the shared local DB:**
  - No submit, assign, publish or review submission was run live.
  - Write-path e2e specs were not run (they change data; running them needs your approval).
  - Integration tests need the separate `aidea_test` database and were not run.
- **Dev server only.** The capture used the user's running `next dev`. Core Web Vitals were not measured (dev build); see manifest UUX-14.
- **Pages reviewed from code only:** program, qualifier, final presentation, showcase, voting management, mentors, reports, settings, audit, voting, profile.
- **Not checked by tooling:** physical touch behaviour and screen-reader output. The accessibility tree was inspected instead.
- **Subjective quality is not proven by tests.** The coverage test checks completeness only.

## Files
`baseline.md`, `findings.md`, `journeys.md`, `directions.md`, `improvement-plan.md`, `design-system.md`, `audit-manifest.json`, `final-report.md`, `evidence/before/`, `evidence/after/`
