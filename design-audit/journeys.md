# Journeys

These journeys were walked against the running app (`localhost:3000`, seeded demo accounts), the captured screenshots and the source code. "Fxx" refers to `findings.md` and "R-xx" to `improvement-plan.md`.

## Participant

| Step | Entry point | User question | Primary / secondary action | Missing information or friction | Risk | Recovery path | Improvement | Success criterion |
|---|---|---|---|---|---|---|---|---|
| Understand the program | `/overview` | "What is this and when does it close?" | none / Submit New Idea | The date shows as "10 Oct" with no label saying what closes; there is no program stage | Misses the deadline | None | R-08: timeline with labelled dates and today's stage | Close date and current stage readable without opening another page |
| Start an idea | Header button, nav "Submit New Idea" | "What will I need?" | Submit New Idea | The form is one long card with no section overview (F-36) | Abandons the form | None | R-06: sections with headings and an index of the 5 sections | Each section has a heading and its own place in the outline |
| Save progress | `/submit` action bar | "Is my work safe?" | Save draft | On mobile the bar is hidden under the nav while scrolling (F-14). The saved draft can't be reopened (F-17) | Thinks the work is saved, then loses it | None in the UI | R-04 now. R-14 planned | Bar is visible at every scroll position. Drafts open from My Ideas (planned) |
| Resolve validation errors | Submit idea | "What's wrong, and where?" | Fix the field | One toast, first error only, no field link (F-13) | Repeated failed submits | Toast text | R-06: inline errors, linked summary, focus moves to the summary | Every invalid field shows its own message; the summary links to each |
| Choose mentors | Mentor Priority 1 and 2 | "Who should I pick? Can I pick the same one?" | Select | No expertise in the trigger. The same mentor can be chosen twice, giving a DB error (F-16) | Raw error; or no preferences sent | None | R-05: require 2 different mentors, with inline error | Same-mentor and missing choices blocked with a clear message |
| Submit confidently | Confirm dialog | "What happens after this?" | Submit | The dialog explains locking and routing (good) | none | n/a | Keep | none |
| Understand status | `/my-ideas` | "Where is my idea now?" | none | Status is shown as Draft or Submitted only; the results columns are clear; no "what's next" | Confusion | None | R-08: next-step line on the overview | The overview states the next step for each active idea |
| Know the required action | `/overview` | "Do I need to do anything?" | Commit panel (when relevant) | The commit panel is strong when shown; otherwise there is nothing | Missed actions | None | R-08 | The required action appears first on the overview |
| Respond to changes | Notifications | "What changed?" | Open notification | Tabs have ARIA errors (F-05) | Screen reader confusion | none | R-13 | axe clean |
| See the outcome / showcase | My Ideas results columns | "Did we pass?" | none | Screening, qualifier and mentor results are present, shown with N/A badges | Noise | none | R-02: quieter "Not yet" status | Same status component everywhere |

## Mentor

| Step | Entry point | User question | Primary / secondary action | Missing information or friction | Risk | Recovery path | Improvement | Success criterion |
|---|---|---|---|---|---|---|---|---|
| See assigned ideas | `/overview` | "How much is waiting for me?" | none | The count uses the assignment state and disagrees with the queue (F-19); it is not linked | Wasted visit; distrust | `/reviews` | R-09: list of reviews to start or finish, linking to each | The count matches the "To do" tab in `/reviews`; each item is one tap from the review |
| Separate new, pending and completed | `/reviews` tabs | "Which ones still need me?" | Tab | Tabs are hand-built links (no focus style); "Pending" means not started | Confusion | Tabs | R-02 shared status; R-07 focus styles | Each status label matches the tab |
| Open an idea and understand it | `/reviews/[id]` | "What is this idea?" | Read | Two-column layout on desktop (good). On mobile, the idea detail comes before the form | Long scroll | n/a | Keep | none |
| Give structured feedback | Review form | "What does each question mean?" | Choose Yes/No | Radio groups have no name (F-09); no reason given for the disabled Submit (F-15) | Can't submit, doesn't know why | None | R-03 group names; R-26 "To submit, answer…" hint | Missing items are listed next to the disabled button |
| Save or submit safely | Action bar | "Will I lose this?" | Save as Draft / Submit Review | Bar hidden on mobile (F-14) | n/a | n/a | R-04 | Bar always visible |
| Return to the queue | After submit | "What's next?" | none | Already goes to `/reviews` (good) | none | n/a | Keep | none |

## Admin

| Step | Entry point | User question | Primary / secondary action | Missing information or friction | Risk | Recovery path | Improvement | Success criterion |
|---|---|---|---|---|---|---|---|---|
| Screen new submissions | `/overview` → Screening | "What needs a decision today?" | Tile or pill | The "Needs attention" heading is invisible (F-02); warnings are not links; 8 equal tiles (F-20) | Overlooks routing work | Sidebar | R-10: decisions-first panel where each item is a link | Each warning links to the page that resolves it |
| Compare mentor preferences | `/review-assignment` | "Who did the team ask for?" | Assign / Change | Preferences are visible in the assign dialog | none | n/a | none (out of slice) | none |
| Assign a mentor manually | Assign dialog | "Who has capacity?" | Choose mentor | Capacity hint is present | none | n/a | Keep | none |
| Identify conflicts | `/ideas` | "Which teams have problems?" | Filter | Conflict pills use colour without an icon (F-29); filters are unlabeled (F-04) | Missed conflict | none | R-02 AttentionFlag; R-03 labels | Conflicts show an icon and text; filters have labels |
| Monitor bottlenecks | `/overview` | "Where is the pipeline stuck?" | none | Counts with no stage order (F-20, F-21) | n/a | n/a | R-10 pipeline row; R-07 grouped nav | Counts follow the pipeline order |
| Correct mistakes | Idea detail → Reopen review | "Can I undo?" | Reopen | Raw "status: submitted" (F-23) | Misreads state | n/a | R-02 | Status uses the shared component |
| Understand audit history | Idea detail → Audit history | "Who changed what?" | Link | The overview feed shows DB action keys (F-23) | n/a | `/audit` | R-10: readable action labels | No snake_case shown in the UI |
| Manage exceptions without losing context | `/ideas` filters (URL) | "Where was I?" | Back | URL keeps the filters (good) | none | n/a | Keep | none |
