# RLS test matrix

Documents the expected allow/deny outcome per table for each of the four
roles, implementing the policies in `0099_rls.sql`. Standing in for
automated RLS tests for now — a later phase may add pgTAP against this
matrix. Legend: **Own** = row the user owns/created/is assigned to; **Sub**
= submitted; **Pub** = published.

| Table | Participant | Mentor | Admin | Employee Voter |
|---|---|---|---|---|
| profiles | R/W own; R teammates | R own | R/W all | R own |
| roles | R (all) | R (all) | R/W all | R (all) |
| user_roles | R own | R own | R/W all | R own |
| programs | R (all) | R (all) | R/W all | R (all) |
| program_stages | R (all) | R (all) | R/W all | R (all) |
| program_content | R (all) | R (all) | R/W all | R (all) |
| program_resources | R (all) | R (all) | R/W all | R (all) |
| mentor_profiles | R (all) | R (all); W own | R/W all | R (all) |
| ideas | R/W own draft; R own sub; R team | R sub (all) | R/W all | Deny |
| idea_team_members | R own/team; W own draft | R (via submitted idea) | R/W all | Deny |
| idea_impacts | R own or sub; W own draft | R sub | R/W all | Deny |
| idea_support_requests | R own or sub; W own draft | R sub | R/W all | Deny |
| idea_mentor_preferences | R own; W own draft | R (all) | R/W all | Deny |
| review_assignments | Deny | R own | R/W all | Deny |
| reviews | Deny (base table; use views later) | R/W own while draft/reopened; R own submitted | R/W all | Deny |
| screening_decisions | Deny (see `ideas_participant_view` for published subset) | R (all) | R/W all | Deny |
| qualifier_assessments | Deny (see view) | Deny | R/W all | Deny |
| project_mentor_assignments | Deny | R own assignment | R/W all | Deny |
| final_presentation_assessments | Deny | Deny | R/W all | Deny |
| showcase_projects | R published | R published | R/W all | R published |
| voting_periods | R (all) | R (all) | R/W all | R (all) |
| votes | Insert own (1 per period); R own | Insert own; R own | R/W all | Insert own; R own |
| publications | Deny | Deny | R (all) | Deny |
| notifications | R/W(read-flag) own | R/W(read-flag) own | R/W all | R/W(read-flag) own |
| email_outbox | Deny | Deny | R/W all | Deny |
| audit_logs | Deny | Deny | R (all) | Deny |

Notes:
- "Deny" for a table a role has no policy against means RLS's implicit
  default (no matching policy => no rows returned / no write permitted).
- Participant-facing reads of screening/qualifier outcomes should go through
  `ideas_participant_view`, not the base tables — the base tables stay
  admin-only (and mentor-read for screening) so `internal_reason` /
  `decided_by` are never exposed to participants.
- `votes` never lets anyone read another person's individual choice except
  admins (for audit) — aggregate results are computed application-side from
  rows the *voter* is allowed to see (their own) plus admin-only exports.
