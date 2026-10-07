# AIdea design system: "Monochrome workbench"

All values live in `app/globals.css` (CSS variables) and `tailwind.config.ts` (utility mapping). Components use semantic utilities (`bg-primary`, `text-muted-foreground`, `bg-success-soft`), never raw hex or Tailwind palette colours.

## Principles
1. **The next step comes first.** Every role's home opens with what the person should do now, in words.
2. **Words before colour.** Status is always an icon plus a label. Colour reinforces it but never carries it alone.
3. **Ink on paper.** GIG brand: #141414 and #FFFFFF, with greys mixed from them. Colour appears only to mark status.
4. **Left-aligned and calm.** No centred blocks, gradients or glass. Hierarchy comes from type weight and size.
5. **One card means one object.** Use a card for an idea, a review or a decision. Use plain sections, separated by a rule, for page structure.
6. **Mobile-first.** Primary actions stay reachable with a thumb and are never covered by persistent UI.

## Colour tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | #FFFFFF | #141414 | page |
| `--foreground` | #141414 | #F5F5F5 | text |
| `--card` | #FFFFFF | #1C1C1C | object surfaces |
| `--muted` | #F5F5F5 | #232323 | quiet fills, skeletons |
| `--muted-foreground` | #5C5C5C (6.7:1 on white) | #A3A3A3 (7.3:1 on #141414) | secondary text |
| `--border` | #E0E0E0 | #2E2E2E | rules and dividers (decorative, no contrast requirement) |
| `--input` | #8C8C8C (3.4:1 on white) | #6B6B6B (3.5:1 on #141414) | form-control outlines; meets the 3:1 non-text contrast for UI components (WCAG 1.4.11) |
| `--primary` | #141414 | #F5F5F5 | primary buttons, links, active nav |
| `--primary-foreground` | #FFFFFF | #141414 | text on primary |
| `--accent` | #EDEDED | #2A2A2A | hover fills |
| `--ring` | #141414 | #F5F5F5 | focus ring |
| `--success` (+ `-soft`) | #1B6B3A on #E8F3EC | #7BC79A on #13261A | passed, published, built |
| `--warning` (+ `-soft`) | #8A5A00 on #FBF1DE | #E5B65C on #2A2110 | waiting, needs attention |
| `--destructive` (+ `-soft`) | #B42318 on #FDECEA | #F19A90 on #2E1513 | not passed, errors, destructive actions |
| `--information` (+ `-soft`) | #141414 on #F0F0F0 | #F5F5F5 on #262626 | neutral progress states (kept monochrome by design) |

Every pairing above is at least 4.5:1. The soft variants exist for badges and alerts. Solid status fills are used only for destructive buttons.

## Typography
- **Families:**
  - `font-sans`: `"GI Sans Text", Arial, "Helvetica Neue", Helvetica, sans-serif`
  - `font-display`: `"GI Sans Display", Arial, …`
  - GI Sans is used only if it is installed locally. No web font is downloaded, so there is no layout shift from font loading.
- **Scale (px / line-height):**
  - 12/16 for meta only
  - 14/20 for UI and table text
  - 16/24 for body and form fields (16 px prevents iOS zoom)
  - 20/28 for section headings (h2)
  - 24/32 for page titles (h1)
  - 32/40 for the home "next step" statement (the single expressive moment), dropping to 24/32 below `sm`
- **Weights:** 700 for headings and the display line, 600 for labels and buttons, 400 for body.
- **Numbers:** `tabular-nums` for counts and tables.
- **Rules:**
  - No all-caps labels.
  - No one-word accents in headlines. The exception is the wordmark "**AI**dea", which is a logo: the weight change exists only to tell capital I apart from lowercase l in Arial.

## Spacing, radius, elevation
- **Spacing:** Tailwind's 4 px base. Rhythm: 4/8 inside controls, 12/16 inside objects, 24/32 between sections, 48 between page regions.
- **Radius:** `--radius: 0.375rem` (6 px) for surfaces; 4 px for controls and badges. `rounded-full` only for avatars and the stage markers on the timeline.
- **Borders and elevation:** a 1 px border by default. No shadow on cards. Shadows only on overlays (dialog, popover, dropdown, sheet, toast).

## Focus
- A 2 px ring in the `--ring` colour with a 2 px offset (`focus-visible:ring-2 ring-ring ring-offset-2`), on every interactive element, including hand-styled links (`.focus-ring` utility).
- `scroll-padding-bottom` is set so sticky bars never cover focused fields.

## Motion
- 150 ms `ease-out` on colour, opacity and transform only. No `transition-all`.
- `@media (prefers-reduced-motion: reduce)` reduces every animation and transition to about 0 ms.
- No entrance animations on page load.

## Layout and breakpoints
- Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280).
- Sidebar from `lg` up; bottom nav plus a "More" sheet below that.
- Content width: forms max 48rem (`max-w-3xl`); reading text max 72ch.
- Sticky action bars sit above the mobile nav (`bottom-16` below `lg`, plus the safe-area inset).

## Density
- Participant: comfortable (16 px body).
- Mentor and admin lists: compact rows (14 px text, 12 px vertical padding).

## Icons
- **Library:** lucide only.
- **Size:** 16 px inline, 20 px in navigation.
- **Accessibility:** decorative icons get `aria-hidden`. Icon-only buttons get an `aria-label` and a 44 px target on touch.

## Status model (`lib/constants/status.ts`, the only source)
`StatusBadge` takes a `StatusKey` and renders a soft-tone badge with an icon and a label. Tones:

- **neutral:** draft, not started, not applicable, voting closed
- **information:** submitted, assigned, scheduled, in review
- **warning:** waiting for review, routing required, awaiting publication, reopened
- **success:** passed, review completed, published, build, winner
- **destructive:** not passed, not built

Additions in this pass are **display keys only**; no stored value changes:
- review queue: `not_started`, `review_draft`, `reopened`
- derived stages: `screened_pass`, `screened_fail`, `showcased`

`AttentionFlag` covers team problems such as "Leader vacant" and "Membership conflict". It uses the warning tone with an alert icon and is visually different from workflow status.

## Feedback patterns
- **Form errors:** an inline message under the field (`aria-invalid` and `aria-describedby`), plus a summary at the top of the form with `role="alert"` that receives focus and links to each field.
- **Toasts:** confirm completed actions ("Draft saved", "Idea submitted"). They don't carry validation.
- **Disabled primary action:** always paired with a visible reason ("To submit, answer: Viability, Comment").

## States
- **Loading:** a route-level `loading.tsx` per role group, using `PageHeaderSkeleton` plus a content skeleton shaped like the page.
- **Empty:** `EmptyState`, left-aligned: a title that states the situation, a description that tells the user what to do, and an optional action.
- **Error:** a route-level `error.tsx` with a plain explanation, a "Try again" button (`reset`) and a link home. `app/not-found.tsx` handles unknown routes and ids.

## Patterns by role
- **Participant home:** `NextStep` (display line plus action) → programme timeline → my ideas list.
- **Mentor home:** a "reviews to do" list linked to each review → counts per tab, linked.
- **Admin home:** decisions-first list where each item links to its page → pipeline counts in stage order → recent activity in plain language.
- **Admin navigation** is grouped:
  - Programme
  - Ideas and reviews (in pipeline order)
  - Voting and showcase
  - People
  - Insights and settings
