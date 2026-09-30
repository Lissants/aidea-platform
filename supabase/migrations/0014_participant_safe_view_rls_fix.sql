-- 0014_participant_safe_view_rls_fix.sql
--
-- Deeper bug fix in the same area as 0013: `ideas_participant_view` (added
-- in 0008) joins screening_decisions / qualifier_assessments /
-- final_presentation_assessments to surface published-only fields to
-- participants. But a Postgres view runs with the QUERYING role's own RLS
-- on the underlying tables, not the view owner's — and those three tables
-- had no SELECT policy at all for participants (only admin, plus mentor
-- for screening_decisions). So even after publishing, a participant
-- querying the view would get NULL for every one of those columns; the
-- view looked correct but could never actually work for its stated
-- purpose. Add narrow, published-only SELECT policies:
--   - screening_decisions / qualifier_assessments: scoped to the idea's own
--     creator or team member (a private status update to that team).
--   - final_presentation_assessments: scoped to any authenticated user once
--     published, matching how voting Results/Showcase are broadcast
--     program-wide once public.
-- Internal-only columns (internal_reason, decided_by, overall_comment,
-- final_score) are still never read this way by anything other than an
-- admin/mentor — the participant-facing pages must keep reading through
-- `ideas_participant_view`, which never selects those columns at all,
-- rather than querying these base tables directly.

drop policy if exists participants_select_own_published_screening on screening_decisions;
create policy participants_select_own_published_screening on screening_decisions for select
  using (
    published = true
    and exists (
      select 1 from ideas i
      where i.id = screening_decisions.idea_id
        and (i.created_by = auth.uid() or is_idea_team_member(i.id, auth.uid()))
    )
  );

drop policy if exists participants_select_own_published_qualifier on qualifier_assessments;
create policy participants_select_own_published_qualifier on qualifier_assessments for select
  using (
    published = true
    and exists (
      select 1 from ideas i
      where i.id = qualifier_assessments.idea_id
        and (i.created_by = auth.uid() or is_idea_team_member(i.id, auth.uid()))
    )
  );

drop policy if exists anyone_select_published_final_presentation on final_presentation_assessments;
create policy anyone_select_published_final_presentation on final_presentation_assessments for select
  using (published = true and auth.uid() is not null);
