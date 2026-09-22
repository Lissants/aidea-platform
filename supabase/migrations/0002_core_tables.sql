-- 0002_core_tables.sql
-- Identity, program, and mentor-capacity tables.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  employee_id text unique,
  email text unique not null,
  full_name text not null,
  job_title text,
  department text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name role_name unique not null
);

insert into roles (name)
  values ('participant'), ('mentor'), ('admin'), ('employee_voter')
  on conflict (name) do nothing;

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);
create index if not exists idx_user_roles_user_id on user_roles (user_id);

create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  submission_open_at timestamptz,
  submission_close_at timestamptz,
  screening_close_at timestamptz,
  qualifier_close_at timestamptz,
  final_presentation_close_at timestamptz,
  showcase_open_at timestamptz,
  voting_open_at timestamptz,
  voting_close_at timestamptz,
  status program_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_programs_status on programs (status);

create table if not exists program_stages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  stage_key program_stage_key not null,
  label text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status program_status not null default 'draft',
  unique (program_id, stage_key)
);
create index if not exists idx_program_stages_program_id on program_stages (program_id);

create table if not exists program_content (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  key text not null,
  title text,
  body text,
  updated_at timestamptz not null default now(),
  unique (program_id, key)
);

create table if not exists program_resources (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  title text not null,
  file_url text not null,
  file_type text,
  created_at timestamptz not null default now()
);
create index if not exists idx_program_resources_program_id on program_resources (program_id);

create table if not exists mentor_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles (id) on delete cascade,
  expertise text,
  bio text,
  max_capacity int not null default 10 check (max_capacity > 0)
);
