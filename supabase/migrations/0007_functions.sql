-- 0007_functions.sql
-- Secure Postgres functions for race-sensitive multi-step operations.
-- SECURITY DEFINER functions lock down search_path to prevent search-path
-- hijacking, and are the only way client code should perform these
-- multi-table transitions (never write status transitions from the app
-- server directly against these tables).

-- ---------------------------------------------------------------------
-- fn_route_reviewer: assigns the priority-1 mentor if they have capacity,
-- else priority-2, else marks routing_required and notifies admins.
-- Locks the candidate mentor_profiles row with FOR UPDATE to serialize
-- concurrent submissions racing for the same mentor's last slot.
-- ---------------------------------------------------------------------
create or replace function fn_route_reviewer(p_idea_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_program_id uuid;
  v_pref record;
  v_mentor_profile_id uuid;
  v_active_count int;
  v_capacity int;
  v_assigned boolean := false;
begin
  select program_id into v_program_id from ideas where id = p_idea_id;

  for v_pref in
    select mentor_profile_id
    from idea_mentor_preferences
    where idea_id = p_idea_id
    order by priority asc
  loop
    -- Lock the mentor row so concurrent routing attempts serialize on it.
    select max_capacity into v_capacity
    from mentor_profiles
    where id = v_pref.mentor_profile_id
    for update;

    select count(*) into v_active_count
    from review_assignments ra
    join ideas i on i.id = ra.idea_id
    where ra.mentor_profile_id = v_pref.mentor_profile_id
      and i.program_id = v_program_id
      and ra.status = 'pending';

    if v_active_count < v_capacity then
      insert into review_assignments (idea_id, mentor_profile_id, status)
      values (p_idea_id, v_pref.mentor_profile_id, 'pending')
      on conflict (idea_id) do update
        set mentor_profile_id = excluded.mentor_profile_id, status = 'pending', assigned_at = now();
      v_assigned := true;
      exit;
    end if;
  end loop;

  if not v_assigned then
    insert into review_assignments (idea_id, mentor_profile_id, status)
    values (p_idea_id, null, 'routing_required')
    on conflict (idea_id) do update set status = 'routing_required', mentor_profile_id = null;

    -- Queue a notification for every admin.
    insert into notifications (user_id, type, title, body, link)
    select ur.user_id, 'routing_required', 'Routing required',
           'An idea needs manual reviewer assignment.', '/review-assignment'
    from user_roles ur
    join roles r on r.id = ur.role_id
    where r.name = 'admin';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_submit_idea: locks the draft row, validates required fields, flips
-- status -> submitted, sets submitted_at + locked, then routes a reviewer.
-- All inside one transaction so a concurrent edit can't slip through
-- between validation and the status flip.
-- ---------------------------------------------------------------------
create or replace function fn_submit_idea(p_idea_id uuid, p_actor_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_idea ideas%rowtype;
begin
  select * into v_idea from ideas where id = p_idea_id for update;

  if v_idea.id is null then
    raise exception 'Idea not found';
  end if;

  if v_idea.status <> 'draft' then
    raise exception 'Only draft ideas can be submitted';
  end if;

  if v_idea.idea_title = '' or v_idea.problem_opportunity = '' or v_idea.proposed_solution = '' then
    raise exception 'Idea is missing required fields';
  end if;

  if not exists (select 1 from idea_impacts where idea_id = p_idea_id) then
    raise exception 'At least one impact is required before submission';
  end if;

  update ideas
    set status = 'submitted', submitted_at = now(), locked = true, updated_at = now()
    where id = p_idea_id;

  insert into audit_logs (program_id, entity_type, entity_id, actor_id, action, new_value)
    values (v_idea.program_id, 'idea', p_idea_id, p_actor_id, 'idea_submitted', jsonb_build_object('status', 'submitted'));

  perform fn_route_reviewer(p_idea_id);
end;
$$;

-- ---------------------------------------------------------------------
-- fn_submit_review: locks a review row and flips draft/reopened -> submitted.
-- ---------------------------------------------------------------------
create or replace function fn_submit_review(p_review_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_review reviews%rowtype;
begin
  select * into v_review from reviews where id = p_review_id for update;

  if v_review.id is null then
    raise exception 'Review not found';
  end if;

  if v_review.status not in ('draft', 'reopened') then
    raise exception 'Only draft or reopened reviews can be submitted';
  end if;

  if v_review.recommendation is null then
    raise exception 'A recommendation is required before submitting a review';
  end if;

  update reviews
    set status = 'submitted', submitted_at = now(), version = version + 1, updated_at = now()
    where id = p_review_id;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_reopen_review: admin-only reopen with a mandatory reason, audited and
-- notifies the reviewer.
-- ---------------------------------------------------------------------
create or replace function fn_reopen_review(p_review_id uuid, p_reason text, p_actor_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_review reviews%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to reopen a review';
  end if;

  select * into v_review from reviews where id = p_review_id for update;

  if v_review.id is null then
    raise exception 'Review not found';
  end if;

  if v_review.status <> 'submitted' then
    raise exception 'Only submitted reviews can be reopened';
  end if;

  update reviews
    set status = 'reopened', reopened_at = now(), reopen_reason = p_reason, updated_at = now()
    where id = p_review_id;

  insert into audit_logs (entity_type, entity_id, actor_id, action, reason, prior_value)
    values ('review', p_review_id, p_actor_id, 'review_reopened', p_reason, jsonb_build_object('status', 'submitted'));

  insert into notifications (user_id, type, title, body, link)
    values (v_review.reviewer_id, 'review_reopened', 'Review reopened',
            coalesce(p_reason, 'Your review was reopened for changes.'), '/reviews');
end;
$$;

-- ---------------------------------------------------------------------
-- fn_publish_batch: publishes every finalized-but-unpublished row for a
-- program+entity_type, writing one publications row per entity plus one
-- audit_logs row, and notifying the relevant role.
-- entity_type in ('screening_decision','qualifier_assessment',
-- 'project_mentor_assignment','final_presentation_assessment','showcase_project').
-- ---------------------------------------------------------------------
create or replace function fn_publish_batch(p_program_id uuid, p_entity_type text, p_actor_id uuid)
returns int
security definer
set search_path = public
language plpgsql
as $$
declare
  v_count int := 0;
begin
  if p_entity_type = 'screening_decision' then
    with updated as (
      update screening_decisions sd
        set published = true, published_at = now()
        from ideas i
        where sd.idea_id = i.id and i.program_id = p_program_id and sd.published = false
          and sd.decided_at is not null
        returning sd.id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    get diagnostics v_count = row_count;

  elsif p_entity_type = 'qualifier_assessment' then
    with updated as (
      update qualifier_assessments qa
        set published = true, published_at = now()
        from ideas i
        where qa.idea_id = i.id and i.program_id = p_program_id and qa.published = false
          and qa.status = 'finalized'
        returning qa.id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    get diagnostics v_count = row_count;

  elsif p_entity_type = 'project_mentor_assignment' then
    with updated as (
      update project_mentor_assignments pma
        set published = true, published_at = now()
        from ideas i
        where pma.idea_id = i.id and i.program_id = p_program_id and pma.published = false
        returning pma.id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    get diagnostics v_count = row_count;

  elsif p_entity_type = 'final_presentation_assessment' then
    with updated as (
      update final_presentation_assessments fpa
        set published = true, published_at = now()
        where fpa.program_id = p_program_id and fpa.published = false and fpa.status = 'finalized'
        returning fpa.id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    get diagnostics v_count = row_count;

  elsif p_entity_type = 'showcase_project' then
    with updated as (
      update showcase_projects sp
        set published = true, published_at = now()
        where sp.program_id = p_program_id and sp.published = false
        returning sp.id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    get diagnostics v_count = row_count;

  else
    raise exception 'Unknown entity_type: %', p_entity_type;
  end if;

  insert into audit_logs (program_id, entity_type, entity_id, actor_id, action, new_value)
    values (p_program_id, p_entity_type, p_program_id, p_actor_id, 'publish_batch',
            jsonb_build_object('published_count', v_count));

  -- Notify affected idea owners that results are published.
  insert into notifications (user_id, type, title, body, link)
  select distinct i.created_by, 'published', 'Results published',
         format('%s results have been published.', p_entity_type), '/my-ideas'
  from ideas i
  where i.program_id = p_program_id;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_submit_vote: checks the voting window is open and the voter isn't on
-- the idea's team, then inserts — the unique(voting_period_id, voter_id)
-- constraint guarantees one vote per voter per period even under races.
-- ---------------------------------------------------------------------
create or replace function fn_submit_vote(p_voting_period_id uuid, p_voter_id uuid, p_idea_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_period voting_periods%rowtype;
begin
  select * into v_period from voting_periods where id = p_voting_period_id;

  if v_period.id is null then
    raise exception 'Voting period not found';
  end if;

  if now() < v_period.opens_at or now() > v_period.closes_at then
    raise exception 'Voting is not currently open';
  end if;

  if exists (
    select 1 from idea_team_members where idea_id = p_idea_id and profile_id = p_voter_id
  ) or exists (
    select 1 from ideas where id = p_idea_id and team_leader_id = p_voter_id
  ) then
    raise exception 'You cannot vote for your own team''s idea';
  end if;

  insert into votes (voting_period_id, voter_id, idea_id)
    values (p_voting_period_id, p_voter_id, p_idea_id);
end;
$$;
