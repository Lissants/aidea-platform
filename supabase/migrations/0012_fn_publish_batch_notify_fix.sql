-- 0012_fn_publish_batch_notify_fix.sql
--
-- Bug fix found while building Phase 7 (notification audit): the original
-- fn_publish_batch notified EVERY idea owner in the program on every
-- publish call, regardless of whether that idea's row was actually part of
-- the batch just published (e.g. publishing screening decisions would also
-- notify owners of ideas that were never in the screening batch at all).
-- Rewritten so each branch captures idea_id from its own `returning`
-- clause and notifications are scoped to exactly the ideas whose row was
-- just published.
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
        returning sd.id, sd.idea_id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    select count(*) into v_count from updated;

    insert into notifications (user_id, type, title, body, link)
      select distinct i.created_by, 'published', 'Screening result published',
             'Your idea''s screening decision has been published.', '/my-ideas'
      from updated u join ideas i on i.id = u.idea_id;

  elsif p_entity_type = 'qualifier_assessment' then
    with updated as (
      update qualifier_assessments qa
        set published = true, published_at = now()
        from ideas i
        where qa.idea_id = i.id and i.program_id = p_program_id and qa.published = false
          and qa.status = 'finalized'
        returning qa.id, qa.idea_id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    select count(*) into v_count from updated;

    insert into notifications (user_id, type, title, body, link)
      select distinct i.created_by, 'published', 'Qualifier result published',
             'Your idea''s qualifier result (Build / No Build) has been published.', '/my-ideas'
      from updated u join ideas i on i.id = u.idea_id;

  elsif p_entity_type = 'project_mentor_assignment' then
    with updated as (
      update project_mentor_assignments pma
        set published = true, published_at = now()
        from ideas i
        where pma.idea_id = i.id and i.program_id = p_program_id and pma.published = false
        returning pma.id, pma.idea_id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    select count(*) into v_count from updated;

    insert into notifications (user_id, type, title, body, link)
      select distinct i.created_by, 'published', 'Project mentor assigned',
             'A project mentor has been assigned to your idea.', '/my-ideas'
      from updated u join ideas i on i.id = u.idea_id;

  elsif p_entity_type = 'final_presentation_assessment' then
    with updated as (
      update final_presentation_assessments fpa
        set published = true, published_at = now()
        where fpa.program_id = p_program_id and fpa.published = false and fpa.status = 'finalized'
        returning fpa.id, fpa.idea_id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    select count(*) into v_count from updated;

    insert into notifications (user_id, type, title, body, link)
      select distinct i.created_by, 'published', 'Final presentation result published',
             'Your idea''s final presentation result has been published.', '/my-ideas'
      from updated u join ideas i on i.id = u.idea_id;

  elsif p_entity_type = 'showcase_project' then
    with updated as (
      update showcase_projects sp
        set published = true, published_at = now()
        where sp.program_id = p_program_id and sp.published = false
        returning sp.id, sp.idea_id
    )
    insert into publications (program_id, entity_type, entity_id, published_by)
      select p_program_id, p_entity_type, id, p_actor_id from updated;
    select count(*) into v_count from updated;

    insert into notifications (user_id, type, title, body, link)
      select distinct i.created_by, 'published', 'Showcase project published',
             'Your project is now live on the Project Showcase.', '/showcase'
      from updated u join ideas i on i.id = u.idea_id;

  else
    raise exception 'Unknown entity_type: %', p_entity_type;
  end if;

  insert into audit_logs (program_id, entity_type, entity_id, actor_id, action, new_value)
    values (p_program_id, p_entity_type, p_program_id, p_actor_id, 'publish_batch',
            jsonb_build_object('published_count', v_count));

  return v_count;
end;
$$;
