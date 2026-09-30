-- 0006_triggers.sql
-- updated_at maintenance triggers + denormalization/guard triggers.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'profiles', 'programs', 'ideas', 'reviews', 'mentor_profiles'
  ]) loop
    execute format(
      'drop trigger if exists trg_set_updated_at on %I; create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- mentor_profiles has no updated_at column; remove the trigger created above
-- for it (loop above kept generic on purpose, this corrects the one table
-- that doesn't apply).
drop trigger if exists trg_set_updated_at on mentor_profiles;

-- Keep final_presentation_assessments.program_id in sync with its idea's
-- program_id, so the partial unique indexes in 0005 can rely on a plain
-- column instead of a cross-table subquery.
create or replace function set_final_presentation_program_id()
returns trigger as $$
begin
  select program_id into new.program_id from ideas where id = new.idea_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_final_presentation_program_id on final_presentation_assessments;
create trigger trg_set_final_presentation_program_id
  before insert or update of idea_id on final_presentation_assessments
  for each row execute function set_final_presentation_program_id();

-- Defense-in-depth guard against voting for your own team, mirroring the
-- check inside fn_submit_vote (0004_functions.sql) at the DB-constraint
-- level in case a future code path inserts into votes directly.
create or replace function guard_vote_not_own_team()
returns trigger as $$
begin
  if exists (
    select 1 from idea_team_members itm
    where itm.idea_id = new.idea_id and itm.profile_id = new.voter_id
  ) then
    raise exception 'Cannot vote for your own team''s idea';
  end if;

  if exists (
    select 1 from ideas i where i.id = new.idea_id and i.team_leader_id = new.voter_id
  ) then
    raise exception 'Cannot vote for your own team''s idea';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_guard_vote_not_own_team on votes;
create trigger trg_guard_vote_not_own_team
  before insert on votes
  for each row execute function guard_vote_not_own_team();
