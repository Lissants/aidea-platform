-- 0015_voting_lifecycle_and_reviewer_notify.sql
--
-- Two independent, minimal bug/gap fixes found while building Phase 7:
--
-- 1. fn_route_reviewer never notified the mentor it successfully assigned a
--    review to — only the "routing_required" admin-escalation path queued a
--    notification. Reviewers had no way to learn a new review was waiting
--    on them short of polling. Add that notification on the success path.
--
-- 2. voting_periods had no way to record that a "voting opened" or "voting
--    closing reminder" notification had already been sent, so a
--    cron-triggered route (app/api/cron/voting-notifications/route.ts)
--    would have re-notified every voter on every run. Add two idempotency
--    timestamp columns.

alter table voting_periods
  add column if not exists opened_notified_at timestamptz,
  add column if not exists closing_reminder_sent_at timestamptz;

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
  v_idea_title text;
begin
  select program_id, idea_title into v_program_id, v_idea_title from ideas where id = p_idea_id;

  for v_pref in
    select mentor_profile_id
    from idea_mentor_preferences
    where idea_id = p_idea_id
    order by priority asc
  loop
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
      v_mentor_profile_id := v_pref.mentor_profile_id;
      exit;
    end if;
  end loop;

  if not v_assigned then
    insert into review_assignments (idea_id, mentor_profile_id, status)
    values (p_idea_id, null, 'routing_required')
    on conflict (idea_id) do update set status = 'routing_required', mentor_profile_id = null;

    insert into notifications (user_id, type, title, body, link)
    select ur.user_id, 'routing_required', 'Routing required',
           'An idea needs manual reviewer assignment.', '/review-assignment'
    from user_roles ur
    join roles r on r.id = ur.role_id
    where r.name = 'admin';
  else
    insert into notifications (user_id, type, title, body, link)
    select mp.profile_id, 'reviewer_assigned', 'New review assigned',
           format('You have been assigned to review "%s".', v_idea_title), '/reviews'
    from mentor_profiles mp
    where mp.id = v_mentor_profile_id;
  end if;
end;
$$;
