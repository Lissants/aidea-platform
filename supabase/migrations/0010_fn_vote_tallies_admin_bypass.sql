-- 0010_fn_vote_tallies_admin_bypass.sql
--
-- Bug fix found while building Phase 6 (Voting Management): fn_vote_tallies
-- unconditionally raised unless the voting_period was already
-- results_published, so admins had no way to see live turnout before
-- publishing — but the Voting Management screen needs exactly that ("admin
-- can see live counts, this is the one role allowed to"). Add an is_admin
-- bypass; every other caller keeps the original "only after publish" rule.
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

  if v_published is not true and not is_admin(auth.uid()) then
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
  'Aggregate-only vote results. Any authenticated user can call it once a
   voting_period is results_published; admins can also call it beforehand
   to see live turnout while voting is still open — never exposes an
   individual ballot either way.';
