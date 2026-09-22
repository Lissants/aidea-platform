-- 0003_idea_tables.sql
-- Idea submission, team, impact, support, mentor preference, review-routing,
-- and review tables.

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  team_name text not null,
  team_leader_id uuid not null references profiles (id),
  idea_title text not null,
  problem_opportunity text not null,
  proposed_solution text not null,
  target_users text,
  status idea_status not null default 'draft',
  submitted_at timestamptz,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references profiles (id)
);
create index if not exists idx_ideas_program_id on ideas (program_id);
create index if not exists idx_ideas_created_by on ideas (created_by);
create index if not exists idx_ideas_status on ideas (status);

create table if not exists idea_team_members (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  profile_id uuid not null references profiles (id),
  member_order int not null default 1,
  unique (idea_id, profile_id)
);
create index if not exists idx_idea_team_members_idea_id on idea_team_members (idea_id);
create index if not exists idx_idea_team_members_profile_id on idea_team_members (profile_id);

create table if not exists idea_impacts (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  impact_kind impact_kind not null,
  impact_type impact_type not null,
  explanation text,
  measurable_result text
);
create index if not exists idx_idea_impacts_idea_id on idea_impacts (idea_id);

create table if not exists idea_support_requests (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  support_area support_area not null,
  details text,
  reason text,
  estimate text
);
create index if not exists idx_idea_support_requests_idea_id on idea_support_requests (idea_id);

create table if not exists idea_mentor_preferences (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  priority int not null check (priority in (1, 2)),
  mentor_profile_id uuid not null references mentor_profiles (id),
  unique (idea_id, priority),
  unique (idea_id, mentor_profile_id)
);
create index if not exists idx_idea_mentor_preferences_idea_id on idea_mentor_preferences (idea_id);

create table if not exists review_assignments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null unique references ideas (id) on delete cascade,
  mentor_profile_id uuid references mentor_profiles (id),
  status review_assignment_status not null default 'pending',
  assigned_at timestamptz not null default now(),
  created_by uuid references profiles (id)
);
create index if not exists idx_review_assignments_mentor on review_assignments (mentor_profile_id);
create index if not exists idx_review_assignments_status on review_assignments (status);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  review_assignment_id uuid not null references review_assignments (id) on delete cascade,
  idea_id uuid not null references ideas (id) on delete cascade,
  reviewer_id uuid not null references profiles (id),
  desirability boolean,
  viability boolean,
  realistic_implementation boolean,
  recommendation review_recommendation,
  comment text,
  status review_status not null default 'draft',
  submitted_at timestamptz,
  reopened_at timestamptz,
  reopen_reason text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reviews_idea_id on reviews (idea_id);
create index if not exists idx_reviews_reviewer_id on reviews (reviewer_id);
create index if not exists idx_reviews_status on reviews (status);
