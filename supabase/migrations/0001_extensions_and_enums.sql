-- 0001_extensions_and_enums.sql
-- Extensions and ENUM types shared across the schema. Idempotent: guards
-- every CREATE TYPE with a existence check so this file can be re-run.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

do $$ begin
  create type role_name as enum ('participant', 'mentor', 'admin', 'employee_voter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type program_status as enum ('draft', 'active', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type program_stage_key as enum (
    'submission', 'review', 'screening', 'qualifier', 'project_mentor',
    'final_presentation', 'showcase', 'voting'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type idea_status as enum ('draft', 'submitted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type impact_kind as enum ('primary', 'secondary');
exception when duplicate_object then null; end $$;

do $$ begin
  create type impact_type as enum (
    'revenue_growth', 'time_efficiency', 'cost_efficiency', 'governance_improvement'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type support_area as enum ('tools', 'budget', 'data_access');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_assignment_status as enum ('pending', 'routing_required', 'reassigned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_recommendation as enum ('recommend_pass', 'recommend_not_pass');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('draft', 'submitted', 'reopened');
exception when duplicate_object then null; end $$;

do $$ begin
  create type screening_decision_value as enum ('pass_to_qualifier', 'not_pass');
exception when duplicate_object then null; end $$;

do $$ begin
  create type build_decision as enum ('build', 'no_build');
exception when duplicate_object then null; end $$;

do $$ begin
  create type qualifier_status as enum ('draft', 'finalized');
exception when duplicate_object then null; end $$;

do $$ begin
  create type winner_decision as enum ('winner', 'no_winner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type winner_category as enum ('grand_winner', 'runner_up');
exception when duplicate_object then null; end $$;

do $$ begin
  create type final_presentation_status as enum ('draft', 'finalized');
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_outbox_status as enum ('pending', 'sent', 'failed');
exception when duplicate_object then null; end $$;

-- Shared updated_at trigger function, used by every table with an
-- updated_at column (attached per-table in 0006_triggers.sql).
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
