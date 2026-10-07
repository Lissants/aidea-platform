# Design directions

## Fixed constraints for all three directions
- **GIG brand standards (organisation rule).** Colours are Black #141414 and White #FFFFFF, with greys mixed from the two. Type is GI Sans Display/Text, falling back to Arial. All text is left-aligned. The user chose "monochrome plus muted status tones, always shown with an icon and text".
- **No changes** to routes, status values, APIs, the schema or auth.
- **Accessibility first** (see the precedence order in README.md).

---

## 1. Conservative refinement
- **Core concept:** keep the layouts and fix the token layer, contrast, labels, states and status consistency.
- **Why it suits AIdea:** it fixes all P0 accessibility and brand items quickly with the least risk.
- **Visual language:** shadcn structure as today, re-tokened to monochrome.
- **Type:** Arial at today's sizes; headings in bold instead of semibold.
- **Colour:** ink, paper and greys; status tones only inside badges and alerts.
- **Layout:** unchanged.
- **Motion:** unchanged, except that reduced motion is honoured.
- **Components:** Badge and StatusBadge are restyled; labels are added.
- **Accessibility:** fixes contrast, naming and focus.
- **Effort / risk:** S / low.
- **Unchanged:** all page compositions.
- **Disadvantages:**
  - The role homes still don't answer "what should I do next?" (F-18, F-19, F-20).
  - The identity stays generic. It is just a grey version of the same card kit.

## 2. Product-led redesign
- **Core concept:** reorganise around work.
  - Each role's home becomes a working summary: next step, queue, pipeline.
  - Admin navigation is grouped by pipeline stage.
  - The participant flow gains a resumable draft and a multi-step wizard.
- **Why it suits AIdea:** the journeys show that the biggest friction is information architecture, not looks: the misleading mentor count, the admin home with no decisions, and no next step for participants.
- **Visual language:** follows from the structure; neutral.
- **Type:** a stronger hierarchy so the next step can be found at a glance.
- **Colour:** semantic only.
- **Layout:** queue lists replace tile grids; the pipeline is shown as a sequence.
- **Motion:** none beyond component feedback.
- **Components:** new `NextStep`, `WorkQueue`, `Metric` and `PipelineRail`; a draft-edit route; a step wizard.
- **Accessibility:** improves orientation and reduces the number of tab stops.
- **Effort / risk:** L / medium-high. The resumable draft needs a new edit route, loading the draft through the existing services, and a review of the server actions that guard edits after submission.
- **Unchanged:** data model and services.
- **Disadvantages:** large scope; the multi-step wizard changes a flow that the e2e tests exercise (`participant-idea.spec.ts`).

## 3. Distinctive but restrained ("editorial monochrome")
- **Core concept:** a typographic identity inside the brand limits. It suits a programme about ideas because the words carry the design.
- **Why it suits AIdea:** with only black, white and Arial allowed, identity has to come from type scale, rhythm and structure rather than colour.
- **Visual language:**
  - Large bold statements for the one thing that matters on each screen.
  - Hairline rules that separate content without boxing it.
  - Cards only where something is an object (an idea or a review).
- **Type:** Arial Bold display at 24 and 32 px; body 16/14; `tabular-nums` for counts; no all-caps eyebrows.
- **Colour:** pure ink and paper; status tones are the only colour.
- **Layout:** left-aligned single column on mobile; on desktop, content up to 72ch with a secondary column only where comparison needs it.
- **Motion:** a single 150 ms transition on interactive states; none on load.
- **Components:** a thinner Card policy; the `Metric` row becomes text, not tiles.
- **Accessibility:** neutral to positive, because of high contrast.
- **Effort / risk:** M / low-medium.
- **Unchanged:** routes and flows.
- **Disadvantages:**
  - Too much restraint can read as unfinished.
  - Large type needs care at 360 px.

---

## Comparison

| Criterion | 1 Conservative | 2 Product-led | 3 Editorial |
|---|---|---|---|
| Fixes P0 accessibility and brand | Yes | Yes | Yes |
| Answers "what do I do next?" | No | Yes | Partly |
| Identity | Weak | Neutral | Strong |
| Risk to business logic | Very low | Medium-high (draft edit, wizard) | Low |
| Fits in one reviewable slice | Yes | No | Yes |

## Recommendation: "Monochrome workbench" (1 + the safe half of 2 + the type system of 3)

1. **From 1:** the full token, contrast, label, state and status consolidation. This is the foundation for everything else.
2. **From 2:** the role homes become working summaries:
   - **Participant:** next step, programme timeline, my ideas.
   - **Mentor:** reviews to do, linked to each review.
   - **Admin:** decisions first, then the pipeline in order.
   - Admin navigation is grouped by pipeline stage.

   The resumable draft and the step wizard are planned for later, not built now. They need server-action review and would change a flow that the e2e tests cover.
3. **From 3:** the type-led hierarchy and the card policy. **The single expressive moment is the home "next step" line**: one bold statement per role, set large, followed by a quiet programme timeline. The timeline is a real sequence, so numbered stages are justified. Everything else stays quiet.

**Rejected and why:**
- **Skill-suggested palettes and fonts:** the UI/UX Pro Max navy/green palette with Lexend and Source Sans, and the Taste "Geist/Outfit" fonts. They conflict with the GIG brand.
- **GSAP scroll reveal (UI/UX Pro Max motion tier):** no value for task completion, and it adds weight to the bundle.
- **Taste "no pure white":** brand mandates #FFFFFF.
- **Taste "Phosphor/Tabler icons only":** replacing lucide would be churn with no benefit to users.
- **Bento grids, gradients, glass:** not justified by any task.

### Plan review against the frontend-design brief
- **First draft:** a thick black left bar on attention cards as the expressive device. *Revised:* it is decoration rather than information, and too close to the generic "accent stripe" card. Attention now comes from a status tone plus an icon plus words.
- **First draft:** "Welcome, {name}" kept as the H1. *Revised:* the greeting becomes the small line, and the H1 is the next step itself. That is the most characteristic content for this product.
- **First draft:** an uppercase "NEXT STEP" eyebrow. *Rejected:* it is an all-caps label tell. The heading wording carries the meaning instead.
