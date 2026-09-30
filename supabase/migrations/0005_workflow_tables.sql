-- 0005_workflow_tables.sql
-- Screening, qualifier, project-mentor, final-presentation, showcase,
-- voting, publications, notifications, email outbox, audit log.

create table if not exists screening_decisions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null unique references ideas (id) on delete cascade,
  decision screening_decision_value not null,
  differs_from_recommendation boolean not null default false,
  internal_reason text,
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  published boolean not null default false,
  published_at timestamptz
);

create table if not exists qualifier_assessments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null unique references ideas (id) on delete cascade,
  final_score numeric(6, 2),
  overall_comment text,
  build_decision build_decision,
  status qualifier_status not null default 'draft',
  finalized_at timestamptz,
  published boolean not null default false,
  published_at timestamptz,
  decided_by uuid references profiles (id)
);

create table if not exists project_mentor_assignments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null unique references ideas (id) on delete cascade,
  mentor_profile_id uuid not null references mentor_profiles (id),
  assigned_at timestamptz not null default now(),
  published boolean not null default false,
  published_at timestamptz,
  assigned_by uuid references profiles (id)
);

create table if not exists final_presentation_assessments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null unique references ideas (id) on delete cascade,
  -- Denormalized from ideas.program_id (kept in sync by
  -- trg_set_final_presentation_program_id, see 0006_triggers.sql) purely so
  -- the "one grand winner / one runner-up per program" constraint below can
  -- be expressed as a plain partial unique index — Postgres index
  -- expressions can't contain subqueries against other tables.
  program_id uuid not null references programs (id) on delete cascade,
  final_score numeric(6, 2),
  overall_comment text,
  winner_decision winner_decision,
  winner_category winner_category,
  status final_presentation_status not null default 'draft',
  finalized_at timestamptz,
  published boolean not null default false,
  published_at timestamptz,
  decided_by uuid references profiles (id)
);

-- At most one grand_winner and one runner_up per program.
create unique index if not exists uq_one_grand_winner_per_program
  on final_presentation_assessments (program_id)
  where winner_category = 'grand_winner';

create unique index if not exists uq_one_runner_up_per_program
  on final_presentation_assessments (program_id)
  where winner_category = 'runner_up';

create table if not exists showcase_projects (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null unique references ideas (id) on delete cascade,
  program_id uuid not null references programs (id) on delete cascade,
  image_url text,
  short_description text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_showcase_projects_program_id on showcase_projects (program_id);
create index if not exists idx_showcase_projects_published on showcase_projects (published);

create table if not exists voting_periods (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  results_published boolean not null default false,
  results_published_at timestamptz,
  show_percentages boolean not null default true,
  check (closes_at > opens_at)
);
create index if not exists idx_voting_periods_program_id on voting_periods (program_id);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  voting_period_id uuid not null references voting_periods (id) on delete cascade,
  voter_id uuid not null references profiles (id),
  idea_id uuid not null references ideas (id),
  created_at timestamptz not null default now(),
  unique (voting_period_id, voter_id)
);
create index if not exists idx_votes_voting_period_id on votes (voting_period_id);
create index if not exists idx_votes_idea_id on votes (idea_id);

create table if not exists publications (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  published_by uuid references profiles (id),
  published_at timestamptz not null default now(),
  notes text
);
create index if not exists idx_publications_program_entity on publications (program_id, entity_type);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_id on notifications (user_id, created_at desc);

create table if not exists email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body text not null,
  status email_outbox_status not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create index if not exists idx_email_outbox_status on email_outbox (status);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references profiles (id),
  action text not null,
  prior_value jsonb,
  new_value jsonb,
  reason text,
  correlation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_program_id on audit_logs (program_id);
