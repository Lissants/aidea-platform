-- 0013_showcase_visibility_rls.sql
--
-- Bug fix found while building Phase 6: the Project Showcase page (built in
-- Phase 1) embeds `ideas(idea_title, team_name)` under showcase_projects,
-- and Phase 6 extends that to team leader/members. But `ideas` and
-- `profiles` had no SELECT policy for a plain employee_voter (or a
-- participant/mentor not on that team) — only self/team/mentor-of-submitted
-- /admin could read those rows. PostgREST silently nulls an embedded
-- resource a viewer's RLS blocks, so the showcase page would render
-- "Untitled" / blank team & member names for most viewers. Add narrow
-- policies scoped to exactly "this idea/profile is part of a published
-- showcase project" — once something is publicly showcased, its title,
-- team name, and team members' names are meant to be public anyway.
drop policy if exists anyone_select_showcased_ideas on ideas;
create policy anyone_select_showcased_ideas on ideas for select
  using (
    auth.uid() is not null
    and exists (select 1 from showcase_projects sp where sp.idea_id = ideas.id and sp.published = true)
  );

drop policy if exists anyone_select_showcased_team_profiles on profiles;
create policy anyone_select_showcased_team_profiles on profiles for select
  using (
    auth.uid() is not null
    and (
      exists (
        select 1 from ideas i
        join showcase_projects sp on sp.idea_id = i.id and sp.published = true
        where i.team_leader_id = profiles.id
      )
      or exists (
        select 1 from idea_team_members itm
        join showcase_projects sp on sp.idea_id = itm.idea_id and sp.published = true
        where itm.profile_id = profiles.id
      )
    )
  );
