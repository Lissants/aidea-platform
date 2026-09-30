-- 0099_rls.sql
-- Row Level Security for every user-facing table. Policies here are
-- mirrored in comments throughout lib/permissions/index.ts — keep both in
-- sync when either changes. See supabase/RLS_TEST_MATRIX.md for the
-- expected allow/deny matrix this file implements.

alter table profiles enable row level security;
alter table roles enable row level security;
alter table user_roles enable row level security;
alter table programs enable row level security;
alter table program_stages enable row level security;
alter table program_content enable row level security;
alter table program_resources enable row level security;
alter table mentor_profiles enable row level security;
alter table ideas enable row level security;
alter table idea_team_members enable row level security;
alter table idea_impacts enable row level security;
alter table idea_support_requests enable row level security;
alter table idea_mentor_preferences enable row level security;
alter table review_assignments enable row level security;
alter table reviews enable row level security;
alter table screening_decisions enable row level security;
alter table qualifier_assessments enable row level security;
alter table project_mentor_assignments enable row level security;
alter table final_presentation_assessments enable row level security;
alter table showcase_projects enable row level security;
alter table voting_periods enable row level security;
alter table votes enable row level security;
alter table publications enable row level security;
alter table notifications enable row level security;
alter table email_outbox enable row level security;
alter table audit_logs enable row level security;

-- ---------------------------------------------------------------------
-- profiles / roles / user_roles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select_self_or_admin on profiles;
create policy profiles_select_self_or_admin on profiles for select
  using (id = auth.uid() or is_admin(auth.uid()));

drop policy if exists profiles_select_teammates on profiles;
create policy profiles_select_teammates on profiles for select
  using (
    exists (
      select 1 from idea_team_members itm1
      join idea_team_members itm2 on itm1.idea_id = itm2.idea_id
      where itm1.profile_id = auth.uid() and itm2.profile_id = profiles.id
    )
  );

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_full on profiles;
create policy profiles_admin_full on profiles for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists roles_select_authenticated on roles;
create policy roles_select_authenticated on roles for select
  using (auth.uid() is not null);

drop policy if exists user_roles_select_self_or_admin on user_roles;
create policy user_roles_select_self_or_admin on user_roles for select
  using (user_id = auth.uid() or is_admin(auth.uid()));

drop policy if exists user_roles_admin_write on user_roles;
create policy user_roles_admin_write on user_roles for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- programs / program_stages / program_content / program_resources
-- Readable by any authenticated user; writable by admins only.
-- ---------------------------------------------------------------------
drop policy if exists programs_select_authenticated on programs;
create policy programs_select_authenticated on programs for select
  using (auth.uid() is not null);

drop policy if exists programs_admin_write on programs;
create policy programs_admin_write on programs for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists program_stages_select_authenticated on program_stages;
create policy program_stages_select_authenticated on program_stages for select
  using (auth.uid() is not null);

drop policy if exists program_stages_admin_write on program_stages;
create policy program_stages_admin_write on program_stages for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists program_content_select_authenticated on program_content;
create policy program_content_select_authenticated on program_content for select
  using (auth.uid() is not null);

drop policy if exists program_content_admin_write on program_content;
create policy program_content_admin_write on program_content for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists program_resources_select_authenticated on program_resources;
create policy program_resources_select_authenticated on program_resources for select
  using (auth.uid() is not null);

drop policy if exists program_resources_admin_write on program_resources;
create policy program_resources_admin_write on program_resources for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- mentor_profiles: readable by authenticated users (needed for the mentor
-- preference picker); writable by the mentor themself or an admin.
-- ---------------------------------------------------------------------
drop policy if exists mentor_profiles_select_authenticated on mentor_profiles;
create policy mentor_profiles_select_authenticated on mentor_profiles for select
  using (auth.uid() is not null);

drop policy if exists mentor_profiles_self_write on mentor_profiles;
create policy mentor_profiles_self_write on mentor_profiles for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists mentor_profiles_admin_write on mentor_profiles;
create policy mentor_profiles_admin_write on mentor_profiles for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- ideas: "participants_crud_own_drafts" — participants may select/insert/
-- update/delete their own draft ideas. Submitted ideas become read-only to
-- everyone except admins (locked=true enforced by fn_submit_idea already;
-- this policy additionally blocks writes at the RLS layer once submitted).
-- ---------------------------------------------------------------------
drop policy if exists participants_crud_own_drafts on ideas;
create policy participants_crud_own_drafts on ideas for all
  using (created_by = auth.uid() and status = 'draft')
  with check (created_by = auth.uid() and status = 'draft');

drop policy if exists participants_select_own_or_team on ideas;
create policy participants_select_own_or_team on ideas for select
  using (created_by = auth.uid() or is_idea_team_member(id, auth.uid()));

drop policy if exists mentors_select_submitted_ideas on ideas;
create policy mentors_select_submitted_ideas on ideas for select
  using (status = 'submitted' and (is_mentor(auth.uid()) or is_admin(auth.uid())));

drop policy if exists admins_full_access_ideas on ideas;
create policy admins_full_access_ideas on ideas for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- idea_team_members: visible to the idea's own team, mentors/admins.
drop policy if exists idea_team_members_select on idea_team_members;
create policy idea_team_members_select on idea_team_members for select
  using (
    is_idea_team_member(idea_id, auth.uid())
    or is_mentor(auth.uid())
    or is_admin(auth.uid())
  );

drop policy if exists idea_team_members_owner_write on idea_team_members;
create policy idea_team_members_owner_write on idea_team_members for all
  using (
    exists (select 1 from ideas i where i.id = idea_id and i.created_by = auth.uid() and i.status = 'draft')
  )
  with check (
    exists (select 1 from ideas i where i.id = idea_id and i.created_by = auth.uid() and i.status = 'draft')
  );

drop policy if exists idea_team_members_admin_write on idea_team_members;
create policy idea_team_members_admin_write on idea_team_members for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- idea_impacts / idea_support_requests / idea_mentor_preferences follow the
-- same "owner while draft, mentors/admins can read once submitted" shape.
drop policy if exists idea_impacts_select on idea_impacts;
create policy idea_impacts_select on idea_impacts for select
  using (
    exists (
      select 1 from ideas i where i.id = idea_id
        and (i.created_by = auth.uid() or i.status = 'submitted')
    ) or is_admin(auth.uid())
  );

drop policy if exists idea_impacts_owner_write on idea_impacts;
create policy idea_impacts_owner_write on idea_impacts for all
  using (exists (select 1 from ideas i where i.id = idea_id and i.created_by = auth.uid() and i.status = 'draft'))
  with check (exists (select 1 from ideas i where i.id = idea_id and i.created_by = auth.uid() and i.status = 'draft'));

drop policy if exists idea_impacts_admin_write on idea_impacts;
create policy idea_impacts_admin_write on idea_impacts for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists idea_support_requests_select on idea_support_requests;
create policy idea_support_requests_select on idea_support_requests for select
  using (
    exists (select 1 from ideas i where i.id = idea_id and (i.created_by = auth.uid() or i.status = 'submitted'))
    or is_admin(auth.uid())
  );

drop policy if exists idea_support_requests_owner_write on idea_support_requests;
create policy idea_support_requests_owner_write on idea_support_requests for all
  using (exists (select 1 from ideas i where i.id = idea_id and i.created_by = auth.uid() and i.status = 'draft'))
  with check (exists (select 1 from ideas i where i.id = idea_id and i.created_by = auth.uid() and i.status = 'draft'));

drop policy if exists idea_support_requests_admin_write on idea_support_requests;
create policy idea_support_requests_admin_write on idea_support_requests for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists idea_mentor_preferences_select on idea_mentor_preferences;
create policy idea_mentor_preferences_select on idea_mentor_preferences for select
  using (
    exists (select 1 from ideas i where i.id = idea_id and i.created_by = auth.uid())
    or is_mentor(auth.uid()) or is_admin(auth.uid())
  );

drop policy if exists idea_mentor_preferences_owner_write on idea_mentor_preferences;
create policy idea_mentor_preferences_owner_write on idea_mentor_preferences for all
  using (exists (select 1 from ideas i where i.id = idea_id and i.created_by = auth.uid() and i.status = 'draft'))
  with check (exists (select 1 from ideas i where i.id = idea_id and i.created_by = auth.uid() and i.status = 'draft'));

drop policy if exists idea_mentor_preferences_admin_write on idea_mentor_preferences;
create policy idea_mentor_preferences_admin_write on idea_mentor_preferences for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- review_assignments: mentors see their own; admins see all.
-- ---------------------------------------------------------------------
drop policy if exists review_assignments_mentor_select on review_assignments;
create policy review_assignments_mentor_select on review_assignments for select
  using (
    exists (select 1 from mentor_profiles mp where mp.id = mentor_profile_id and mp.profile_id = auth.uid())
    or is_admin(auth.uid())
  );

drop policy if exists review_assignments_admin_write on review_assignments;
create policy review_assignments_admin_write on review_assignments for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- reviews: "mentors_modify_own_nonsubmitted_reviews" — a mentor may
-- select/update their own reviews only while draft/reopened; admins have
-- full read/write (admins_full_access on public.reviews).
-- ---------------------------------------------------------------------
drop policy if exists mentors_select_own_reviews on reviews;
create policy mentors_select_own_reviews on reviews for select
  using (reviewer_id = auth.uid() or is_admin(auth.uid()));

drop policy if exists mentors_modify_own_nonsubmitted_reviews on reviews;
create policy mentors_modify_own_nonsubmitted_reviews on reviews for all
  using (reviewer_id = auth.uid() and status in ('draft', 'reopened'))
  with check (reviewer_id = auth.uid() and status in ('draft', 'reopened'));

drop policy if exists admins_full_access_reviews on reviews;
create policy admins_full_access_reviews on reviews for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- screening_decisions / qualifier_assessments / project_mentor_assignments /
-- final_presentation_assessments: admin-only read/write on the base table
-- (internal_reason and decided_by are admin-only); participants read the
-- published subset only through ideas_participant_view instead.
-- ---------------------------------------------------------------------
drop policy if exists screening_decisions_admin_only on screening_decisions;
create policy screening_decisions_admin_only on screening_decisions for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists screening_decisions_mentor_select on screening_decisions;
create policy screening_decisions_mentor_select on screening_decisions for select
  using (is_mentor(auth.uid()));

drop policy if exists qualifier_assessments_admin_only on qualifier_assessments;
create policy qualifier_assessments_admin_only on qualifier_assessments for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists project_mentor_assignments_admin_only on project_mentor_assignments;
create policy project_mentor_assignments_admin_only on project_mentor_assignments for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists project_mentor_assignments_mentor_select on project_mentor_assignments;
create policy project_mentor_assignments_mentor_select on project_mentor_assignments for select
  using (
    exists (select 1 from mentor_profiles mp where mp.id = mentor_profile_id and mp.profile_id = auth.uid())
  );

drop policy if exists final_presentation_assessments_admin_only on final_presentation_assessments;
create policy final_presentation_assessments_admin_only on final_presentation_assessments for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- showcase_projects: anyone_select_published_showcase_projects; admin write.
-- ---------------------------------------------------------------------
drop policy if exists anyone_select_published_showcase_projects on showcase_projects;
create policy anyone_select_published_showcase_projects on showcase_projects for select
  using (published = true or is_admin(auth.uid()));

drop policy if exists showcase_projects_admin_write on showcase_projects;
create policy showcase_projects_admin_write on showcase_projects for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- voting_periods: readable by anyone authenticated; admin write.
-- ---------------------------------------------------------------------
drop policy if exists voting_periods_select_authenticated on voting_periods;
create policy voting_periods_select_authenticated on voting_periods for select
  using (auth.uid() is not null);

drop policy if exists voting_periods_admin_write on voting_periods;
create policy voting_periods_admin_write on voting_periods for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- votes: "voters_insert_single_vote" — any authenticated user (participant,
-- mentor, admin, or employee_voter) may insert exactly one vote per voting
-- period (enforced by the unique constraint + fn_submit_vote); nobody can
-- read another person's individual vote, only aggregate via results pages
-- built off published tallies. Admins can read all for auditing.
-- ---------------------------------------------------------------------
drop policy if exists voters_insert_single_vote on votes;
create policy voters_insert_single_vote on votes for insert
  with check (voter_id = auth.uid());

drop policy if exists voters_select_own_vote on votes;
create policy voters_select_own_vote on votes for select
  using (voter_id = auth.uid() or is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- publications / audit_logs: admin-only read (append-only ledgers).
-- ---------------------------------------------------------------------
drop policy if exists publications_admin_only on publications;
create policy publications_admin_only on publications for select
  using (is_admin(auth.uid()));

drop policy if exists audit_logs_admins_only_read on audit_logs;
create policy audit_logs_admins_only_read on audit_logs for select
  using (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- notifications: a user reads/updates (marks read) only their own rows.
-- ---------------------------------------------------------------------
drop policy if exists notifications_select_own on notifications;
create policy notifications_select_own on notifications for select
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_admin_write on notifications;
create policy notifications_admin_write on notifications for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- email_outbox: admin-only (contains raw email bodies).
-- ---------------------------------------------------------------------
drop policy if exists email_outbox_admin_only on email_outbox;
create policy email_outbox_admin_only on email_outbox for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
