# AIdea Platform: 10 hard questions from a skeptical participant

## Context
The product team wants a devil's-advocate review from a participant's point of view before AIdea is released or demonstrated. Each question below comes from what the current codebase and the Participant Playbook actually do. The questions are not answered here. A short appendix at the end lists what the code does today, so the team can triage each one. No code changes are planned.

---

### 1. Who can actually read my idea, and what stops someone taking it?
"I'm submitting a process change that could save my plant a lot of money. I picked two mentors. Can every other mentor in the company also open my full write-up, including ones I didn't choose and ones in a competing department? And if a version of my idea later turns up in someone else's project, or in a vendor proposal, where does it say the idea is mine? I never saw any terms, confidentiality notice or intellectual property (IP) statement before I clicked Submit."

- **Why this matters:** If participants find out afterwards that their ideas were visible more widely than they assumed, or that nothing protects their credit, trust is gone and the best ideas stop coming in. The platform assumes participants will share sensitive cost, supplier or process details without being told who will see them.
- **What a strong platform should clarify:** Exactly who can see each part of an idea, and at which stage (draft, submitted, under review, published for voting). A plain-language IP and ownership statement that participants accept before submitting. How confidential details are handled. What happens if two people claim the same idea.

### 2. If my idea is rejected, will I even know, let alone why?
"My idea goes to screening and comes back 'Not pass'. I get no notification. My status still just says 'Submitted' unless I go and look. There's no reason, no score and no comment from the mentor who reviewed it. I can't revise it and resubmit, and there's no one to appeal to. How am I supposed to improve, and why should I submit again next year?"

- **Why this matters:** Rejecting people silently is the fastest way to kill participation. Most participants will be rejected, so how rejection is handled matters more to them than how winning is handled. The platform assumes people will accept a bare yes/no result.
- **What a strong platform should clarify:** That every outcome, including rejection, is sent to the whole team. At least a short reason or the criteria the idea fell short on. Whether there is a revise-and-resubmit path or a deadline to appeal, and who decides the appeal.

### 3. What if I'm a line operator with no Windows login and limited English?
"Half my team works on the shop floor. They don't have a Windows account or a company email, and they're more comfortable in Bahasa Indonesia. The sign-in page asks for a network ID and password, and every screen is in English. Are frontline staff excluded from an innovation program by design? And can I do the whole thing on my phone during a break, or only at a desk?"

- **Why this matters:** The people closest to day-to-day operational problems are often the ones least likely to have a corporate account or to be comfortable with English-only forms. The platform assumes every participant has an Active Directory account, works in English and has a desktop.
- **What a strong platform should clarify:** Who is eligible, including contractors, interns, other Godrej entities and staff without an account. How people without an account can take part (for example, a proxy submitter or being added as a teammate). Language support. A confirmed mobile path for the full submission flow, not only for browsing.

### 4. I spent an hour writing and lost everything. Whose problem is that?
"I write my problem statement and solution in the browser, a few thousand characters each. I step away for a meeting, my session expires or the Wi-Fi drops, and I press Submit. I get an error toast and the text is gone. There was no autosave and no warning when I closed the tab. Is there any way to get it back? And if the close date has passed by the time I've retyped it, will my late submission count?"

- **Why this matters:** Losing a submission is the most frustrating failure a participant can have, and it lands hardest on people who type long, careful answers. The platform assumes people save manually, in one sitting, on a stable connection.
- **What a strong platform should clarify:** Autosave or a local backup, a warning before leaving with unsaved changes, and a clear "your work is safe" indicator. What happens to unsaved input when the session expires. A support contact and a policy for submissions lost to technical failures near the deadline.

### 5. Who actually owns our team's idea?
"I created the draft but named my colleague as team leader. Now only I can edit it, but either of us can submit it. I added three teammates and none of them were asked first; one didn't even know they were on it. Later two of our ideas pass screening and I'm forced to 'commit' to one, which removes me from the other, and I can't undo that. If the leader leaves the company, who takes over? If the team falls out, who decides whose idea it is?"

- **Why this matters:** Unclear ownership causes conflict inside teams, especially once there's recognition, voting or a prize at stake. The platform assumes teams are stable, agree with each other, and that the person who creates a draft is the person who owns the idea.
- **What a strong platform should clarify:** The difference between creator, leader and member, and what each can do. Teammates confirming before they are listed. What the commit rule is, why it exists, and its consequences, shown before anyone hits it. How a vacant leader or a departing colleague is handled. How ownership disputes are resolved and who arbitrates.

### 6. What happens when the mentor I picked isn't available?
"I had to choose exactly two preferred mentors, but I can't see whether they're already overloaded. The Playbook says admins use my ranking to assign a reviewer, but I'm never told who actually reviewed my idea. What if both mentors are full? What if my mentor leaves the program halfway through the review? Does my idea just sit there, and would I ever know?"

- **Why this matters:** Mentor choice feels like a meaningful decision, but participants can't see availability or what happens afterwards, so it may not be. An idea held by an unavailable mentor can stall with no alert. The platform assumes mentors stay available and that participants don't need to know who is judging them.
- **What a strong platform should clarify:** How preferences are actually used (automatic or admin-assigned) in wording that matches the Playbook. Whether mentors have capacity limits and what happens when both choices are full. The time limit for a review. Automatic reassignment, with notice, when a mentor becomes unavailable. Whether participants are told who their reviewer is.

### 7. What exactly am I being judged on, and by whom?
"I see Pass or Not pass, Build or No build, but never the criteria, the score or the comments. Is a mentor's yes/no on 'desirability' or 'viability' the same standard across every department? Does a qualifier score of 60 mean the same thing from every judge? And how do I know a mentor from my own department, or my manager, isn't scoring their own team's idea?"

- **Why this matters:** When nobody can see how ideas are judged, people assume it's favouritism, especially when results are batch-published with no explanation. The platform assumes participants trust the process without seeing it.
- **What a strong platform should clarify:** The published criteria and how they are weighted, at every stage. Who reviews at each stage. How conflicts of interest are handled (for example, judges not reviewing their own team's ideas). How consistent scoring across judges is checked. What participants can see about their own evaluation.

### 8. Can I fix a mistake after I submit, or pull my idea out?
"I submit, then notice a wrong figure in my budget request and a teammate's name misspelled. The idea is locked. I can't edit it, withdraw it or even delete my old abandoned drafts. Meanwhile the close date says 'TBA' and I've heard people still submitting after the deadline. So mistakes are permanent for me, but the deadline is flexible for others?"

- **Why this matters:** A process that's strict on participants but loose on deadlines feels unfair, and locking ideas permanently punishes honest mistakes. The platform assumes the first submission is perfect and that deadlines don't need enforcing.
- **What a strong platform should clarify:** Whether there is an edit window or a correction request process after submission. A withdrawal option. A way to delete drafts. A firm, published close date that the system enforces equally for everyone.

### 9. What happens if someone else submits the same idea?
"My team and a team at another site independently submit almost the same idea. I can't search existing submissions to check before I write mine. Does the first one in win? Are we merged into one team? Do we compete for the same votes? And does the idea that's already in the official pipeline count as 'prior art' against mine?"

- **Why this matters:** At company scale, duplicate ideas are guaranteed. Without a clear rule, the result is wasted reviewer time, split votes and disputes over credit. The platform assumes every idea is unique.
- **What a strong platform should clarify:** How duplicates or near-duplicates are detected and handled. Whether timestamp order matters. Whether teams can be offered a merge. How participants can check for similar existing work before submitting without exposing confidential ideas.

### 10. How am I supposed to know where my idea stands?
"There's no email, only a bell icon in an app I open once a month. I got a toast when I submitted, but no confirmation I can keep. My teammates didn't get the final result; only the person who created the draft did. There's no page where I can reread what we actually submitted. How do I know if something needs me to act before a deadline?"

- **Why this matters:** If people miss deadlines or results because nothing reached them, they lose faith in the program and flood admins with "what's my status?" questions. The platform assumes participants check in regularly and that everyone on a team can rely on one person's notifications.
- **What a strong platform should clarify:** Email (or Teams) notifications for every stage change, including rejections. A submission confirmation that includes a copy of what was submitted. A detail page showing the idea's status and timeline, visible to every team member. Clear notice of anything a participant must act on, with a deadline.

---

## Appendix: what the code does today (for triage)
| # | Current behaviour | Where |
|---|---|---|
| 1 | All mentors can read all submitted ideas. Any signed-in user can read impacts and support requests of submitted ideas wherever `ideaDetailReadFilter` is used. No IP or terms statement exists. | `lib/permissions/scopes.ts:38-62` |
| 2 | Not pass / No build send no notification. There's no reason, score, feedback or appeal; reopening is admin-only. | `lib/ideas/published-results.ts`, `db/migrations/0013_remove_showcase.sql:57` |
| 3 | AD/LDAPS sign-in only, filtered by email domain. The UI is English only (`lang="en"`, no i18n). The layout is responsive. | `lib/auth/actions.ts`, `app/layout.tsx:20` |
| 4 | Manual "Save draft" only. No autosave, local backup or `beforeunload` warning. Session expiry shows a "Not authenticated" toast. | `components/forms/idea-wizard.tsx` |
| 5 | Only the creator can edit a draft; the creator or the leader can submit. No consent step for teammates. The commit rule can't be undone by the participant. | `lib/ideas/idea-draft.ts:44`, `db/migrations/0009_team_membership.sql` |
| 6 | Routing is automatic by capacity, not admin-assigned as the Playbook says. When both mentors are full, the status becomes `routing_required`. No reassignment when a mentor leaves after submission. The reviewer is never shown to the participant. | `db/migrations/0003_procedures.sql:48-133`, `lib/services/mentors.ts:26` |
| 7 | Participants see published outcomes only, never scores or comments. | `lib/ideas/published-results.ts` |
| 8 | Submitted ideas are locked, with no withdraw or draft-delete option. Submission dates are only displayed; the server doesn't enforce them. | `submit/page.tsx`, `usp_submit_idea` |
| 9 | No duplicate detection. | — |
| 10 | Notifications are in-app only; the email adapter is a dev stub. The final result goes to the creator only. There's no participant idea detail page. | `lib/email/adapter.ts`, `0013_remove_showcase.sql:114-130` |

Other gaps found while gathering this (not participant questions, but worth tracking):
- The submit page has no server-side role check.
- The 2-mentor requirement is enforced only in the form.
- A creator who isn't on the team can vote for that idea.
- Developers can delete votes.
- The voting-notification cron isn't scheduled.

## Verification
This is a written deliverable only. The appendix references can be checked by opening the cited files.
