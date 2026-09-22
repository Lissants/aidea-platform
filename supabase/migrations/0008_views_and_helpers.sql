-- 0008_views_and_helpers.sql
-- Role-check helper functions + security-barrier views used by RLS
-- policies and by participant-facing reads, so internal-only columns
-- (e.g. screening_decisions.internal_reason) are never exposed to
-- participants even though the base table holds them.

create or replace function is_admin(p_user_id uuid)
returns boolean
security definer
set search_path = public
stable
language sql
as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.name = 'admin'
  );
$$;

create or replace function is_mentor(p_user_id uuid)
returns boolean
security definer
set search_path = public
stable
language sql
as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.name = 'mentor'
  );
$$;

create or replace function has_role(p_user_id uuid, p_role role_name)
returns boolean
security definer
set search_path = public
stable
language sql
as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.name = p_role
  );
$$;

create or replace function is_idea_team_member(p_idea_id uuid, p_user_id uuid)
returns boolean
security definer
set search_path = public
stable
language sql
as $$
  select exists (
    select 1 from idea_team_members where idea_id = p_idea_id and profile_id = p_user_id
  ) or exists (
    select 1 from ideas where id = p_idea_id and team_leader_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------
-- ideas_participant_view: what a participant may see about ANY idea —
-- their own drafts in full, and everyone else's only once submitted, with
-- screening/qualifier internal-only fields never included here at all.
-- ---------------------------------------------------------------------
create or replace view ideas_participant_view with (security_barrier) as
select
  i.id, i.program_id, i.team_name, i.team_leader_id, i.idea_title,
  i.problem_opportunity, i.proposed_solution, i.target_users, i.status,
  i.submitted_at, i.locked, i.created_at, i.updated_at, i.created_by,
  coalesce(sd.published, false) as screening_published,
  case when sd.published then sd.decision else null end as screening_decision,
  coalesce(qa.published, false) as qualifier_published,
  case when qa.published then qa.build_decision else null end as qualifier_build_decision,
  -- NOTE: final_score and overall_comment are intentionally NOT exposed
  -- here, even once published — those stay mentor/admin-only per spec
  -- ("Participant sees Build/No Build only"). An earlier version of this
  -- view leaked qa.final_score to participants; fixed here.
  coalesce(fpa.published, false) as final_presentation_published,
  case when fpa.published then fpa.winner_decision else null end as final_presentation_winner_decision,
  case when fpa.published then fpa.winner_category else null end as final_presentation_winner_category
from ideas i
left join screening_decisions sd on sd.idea_id = i.id
left join qualifier_assessments qa on qa.idea_id = i.id
left join final_presentation_assessments fpa on fpa.idea_id = i.id;

comment on view ideas_participant_view is
  'Participant-safe read of ideas: hides internal_reason/decided_by, raw
   scores/comments, and any unpublished decision. Query this instead of the
   base tables for participant-facing pages.';

-- ---------------------------------------------------------------------
-- reviews_participant_safe: participants never see raw review rows or
-- reviewer identity — only whether their idea's review is complete.
-- ---------------------------------------------------------------------
create or replace view reviews_participant_safe with (security_barrier) as
select
  r.idea_id,
  (r.status = 'submitted') as review_completed,
  r.submitted_at
from reviews r;

comment on view reviews_participant_safe is
  'Participant-safe read of reviews: no reviewer identity, comments, or
   recommendation — only a completion flag.';

-- ---------------------------------------------------------------------
-- fn_vote_tallies: aggregate vote counts per idea for a voting period,
-- returned only once results_published = true. A plain view can't do this
-- safely — RLS on the base `votes` table still applies inside a normal
-- view, so a non-admin querying a view would still only see their own
-- ballot. SECURITY DEFINER lets this function read every ballot internally
-- while only ever returning aggregate counts, never an individual vote.
-- ---------------------------------------------------------------------
create or replace function fn_vote_tallies(p_voting_period_id uuid)
returns table (idea_id uuid, idea_title text, team_name text, vote_count bigint)
security definer
set search_path = public
stable
language plpgsql
as $$
declare
  v_published boolean;
begin
  select results_published into v_published from voting_periods where id = p_voting_period_id;

  if v_published is not true then
    raise exception 'Results are not published for this voting period';
  end if;

  return query
    select v.idea_id, i.idea_title, i.team_name, count(*) as vote_count
    from votes v
    join ideas i on i.id = v.idea_id
    where v.voting_period_id = p_voting_period_id
    group by v.idea_id, i.idea_title, i.team_name
    order by vote_count desc;
end;
$$;

comment on function fn_vote_tallies is
  'Aggregate-only vote results, callable by any authenticated user once a
   voting_period is results_published — never exposes individual ballots.';
