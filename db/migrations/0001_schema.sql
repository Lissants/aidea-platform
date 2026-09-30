-- 0001_schema.sql
-- SQL Server translation of supabase/migrations/0001, 0002, 0003, 0005, 0009
-- and 0015 (tables, constraints, indexes).
--
-- Translation notes:
--   * Postgres enums      -> NVARCHAR + CHECK constraint (named ck_<table>_<col>).
--   * uuid                -> UNIQUEIDENTIFIER DEFAULT NEWID(). New rows that the
--                            app needs the id of should get a JS-generated id
--                            (crypto.randomUUID()), because SQL Server forbids a
--                            bare OUTPUT clause on tables that have triggers.
--   * timestamptz / now() -> DATETIMEOFFSET(3) DEFAULT SYSDATETIMEOFFSET().
--   * jsonb               -> NVARCHAR(MAX) CHECK (ISJSON(...) = 1).
--   * auth.users          -> dbo.users (app-owned credentials / SSO identity).
--   * Nullable UNIQUE columns use filtered unique indexes, because a SQL Server
--     UNIQUE constraint only permits a single NULL.
--   * Where Postgres had two ON DELETE CASCADE paths into the same table, SQL
--     Server rejects the second ("multiple cascade paths"); those FKs are NO
--     ACTION and the rows are still removed through the remaining cascade path.

-- ---------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_users PRIMARY KEY DEFAULT NEWID(),
  email            NVARCHAR(320)    NOT NULL CONSTRAINT uq_users_email UNIQUE,
  password_hash    NVARCHAR(100)    NULL,
  entra_oid        NVARCHAR(64)     NULL,
  created_at       DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  last_sign_in_at  DATETIMEOFFSET(3) NULL
);
CREATE UNIQUE INDEX uq_users_entra_oid ON users (entra_oid) WHERE entra_oid IS NOT NULL;

CREATE TABLE profiles (
  id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_profiles PRIMARY KEY
               CONSTRAINT fk_profiles_users REFERENCES users (id) ON DELETE CASCADE,
  employee_id  NVARCHAR(50)     NULL,
  email        NVARCHAR(320)    NOT NULL CONSTRAINT uq_profiles_email UNIQUE,
  full_name    NVARCHAR(200)    NOT NULL,
  job_title    NVARCHAR(200)    NULL,
  department   NVARCHAR(200)    NULL,
  avatar_url   NVARCHAR(1000)   NULL,
  active       BIT              NOT NULL DEFAULT 1,
  created_at   DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at   DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
CREATE UNIQUE INDEX uq_profiles_employee_id ON profiles (employee_id) WHERE employee_id IS NOT NULL;

CREATE TABLE roles (
  id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_roles PRIMARY KEY DEFAULT NEWID(),
  name  NVARCHAR(40)     NOT NULL CONSTRAINT uq_roles_name UNIQUE
        CONSTRAINT ck_roles_name CHECK (name IN ('participant', 'mentor', 'admin', 'employee_voter'))
);

INSERT INTO roles (name) VALUES ('participant'), ('mentor'), ('admin'), ('employee_voter');

CREATE TABLE user_roles (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_user_roles PRIMARY KEY DEFAULT NEWID(),
  user_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_user_roles_profiles REFERENCES profiles (id) ON DELETE CASCADE,
  role_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_user_roles_roles REFERENCES roles (id) ON DELETE CASCADE,
  created_at  DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT uq_user_roles UNIQUE (user_id, role_id)
);
CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);

-- ---------------------------------------------------------------------
-- Programs
-- ---------------------------------------------------------------------
CREATE TABLE programs (
  id                           UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_programs PRIMARY KEY DEFAULT NEWID(),
  title                        NVARCHAR(400)    NOT NULL,
  description                  NVARCHAR(MAX)    NULL,
  submission_open_at           DATETIMEOFFSET(3) NULL,
  submission_close_at          DATETIMEOFFSET(3) NULL,
  screening_close_at           DATETIMEOFFSET(3) NULL,
  qualifier_close_at           DATETIMEOFFSET(3) NULL,
  final_presentation_close_at  DATETIMEOFFSET(3) NULL,
  showcase_open_at             DATETIMEOFFSET(3) NULL,
  voting_open_at               DATETIMEOFFSET(3) NULL,
  voting_close_at              DATETIMEOFFSET(3) NULL,
  status                       NVARCHAR(40)     NOT NULL DEFAULT 'draft'
                               CONSTRAINT ck_programs_status CHECK (status IN ('draft', 'active', 'closed')),
  created_at                   DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at                   DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
CREATE INDEX idx_programs_status ON programs (status);

CREATE TABLE program_stages (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_program_stages PRIMARY KEY DEFAULT NEWID(),
  program_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_program_stages_programs REFERENCES programs (id) ON DELETE CASCADE,
  stage_key   NVARCHAR(40)     NOT NULL
              CONSTRAINT ck_program_stages_stage_key CHECK (stage_key IN (
                'submission', 'review', 'screening', 'qualifier', 'project_mentor',
                'final_presentation', 'showcase', 'voting')),
  label       NVARCHAR(200)    NOT NULL,
  starts_at   DATETIMEOFFSET(3) NULL,
  ends_at     DATETIMEOFFSET(3) NULL,
  status      NVARCHAR(40)     NOT NULL DEFAULT 'draft'
              CONSTRAINT ck_program_stages_status CHECK (status IN ('draft', 'active', 'closed')),
  CONSTRAINT uq_program_stages UNIQUE (program_id, stage_key)
);
CREATE INDEX idx_program_stages_program_id ON program_stages (program_id);

CREATE TABLE program_content (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_program_content PRIMARY KEY DEFAULT NEWID(),
  program_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_program_content_programs REFERENCES programs (id) ON DELETE CASCADE,
  [key]       NVARCHAR(100)    NOT NULL,
  title       NVARCHAR(400)    NULL,
  body        NVARCHAR(MAX)    NULL,
  updated_at  DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT uq_program_content UNIQUE (program_id, [key])
);

CREATE TABLE program_resources (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_program_resources PRIMARY KEY DEFAULT NEWID(),
  program_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_program_resources_programs REFERENCES programs (id) ON DELETE CASCADE,
  title       NVARCHAR(400)    NOT NULL,
  file_url    NVARCHAR(1000)   NOT NULL,
  file_type   NVARCHAR(100)    NULL,
  created_at  DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
CREATE INDEX idx_program_resources_program_id ON program_resources (program_id);

CREATE TABLE mentor_profiles (
  id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_mentor_profiles PRIMARY KEY DEFAULT NEWID(),
  profile_id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_mentor_profiles_profile_id UNIQUE
                CONSTRAINT fk_mentor_profiles_profiles REFERENCES profiles (id) ON DELETE CASCADE,
  expertise     NVARCHAR(MAX)    NULL,
  bio           NVARCHAR(MAX)    NULL,
  max_capacity  INT              NOT NULL DEFAULT 10 CONSTRAINT ck_mentor_profiles_capacity CHECK (max_capacity > 0)
);

-- ---------------------------------------------------------------------
-- Ideas
-- ---------------------------------------------------------------------
CREATE TABLE ideas (
  id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_ideas PRIMARY KEY DEFAULT NEWID(),
  program_id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_ideas_programs REFERENCES programs (id) ON DELETE CASCADE,
  team_name            NVARCHAR(200)    NOT NULL,
  team_leader_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_ideas_team_leader REFERENCES profiles (id),
  idea_title           NVARCHAR(400)    NOT NULL,
  problem_opportunity  NVARCHAR(MAX)    NOT NULL,
  proposed_solution    NVARCHAR(MAX)    NOT NULL,
  target_users         NVARCHAR(MAX)    NULL,
  status               NVARCHAR(40)     NOT NULL DEFAULT 'draft'
                       CONSTRAINT ck_ideas_status CHECK (status IN ('draft', 'submitted')),
  submitted_at         DATETIMEOFFSET(3) NULL,
  locked               BIT              NOT NULL DEFAULT 0,
  created_at           DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at           DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  created_by           UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_ideas_created_by REFERENCES profiles (id)
);
CREATE INDEX idx_ideas_program_id ON ideas (program_id);
CREATE INDEX idx_ideas_created_by ON ideas (created_by);
CREATE INDEX idx_ideas_status ON ideas (status);

CREATE TABLE idea_team_members (
  id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_idea_team_members PRIMARY KEY DEFAULT NEWID(),
  idea_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_idea_team_members_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  profile_id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_idea_team_members_profiles REFERENCES profiles (id),
  member_order  INT              NOT NULL DEFAULT 1,
  CONSTRAINT uq_idea_team_members UNIQUE (idea_id, profile_id)
);
CREATE INDEX idx_idea_team_members_idea_id ON idea_team_members (idea_id);
CREATE INDEX idx_idea_team_members_profile_id ON idea_team_members (profile_id);

CREATE TABLE idea_impacts (
  id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_idea_impacts PRIMARY KEY DEFAULT NEWID(),
  idea_id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_idea_impacts_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  impact_kind        NVARCHAR(40)     NOT NULL
                     CONSTRAINT ck_idea_impacts_kind CHECK (impact_kind IN ('primary', 'secondary')),
  impact_type        NVARCHAR(40)     NOT NULL
                     CONSTRAINT ck_idea_impacts_type CHECK (impact_type IN (
                       'revenue_growth', 'time_efficiency', 'cost_efficiency', 'governance_improvement')),
  explanation        NVARCHAR(MAX)    NULL,
  measurable_result  NVARCHAR(MAX)    NULL
);
CREATE INDEX idx_idea_impacts_idea_id ON idea_impacts (idea_id);

CREATE TABLE idea_support_requests (
  id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_idea_support_requests PRIMARY KEY DEFAULT NEWID(),
  idea_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_idea_support_requests_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  support_area  NVARCHAR(40)     NOT NULL
                CONSTRAINT ck_idea_support_requests_area CHECK (support_area IN ('tools', 'budget', 'data_access')),
  details       NVARCHAR(MAX)    NULL,
  reason        NVARCHAR(MAX)    NULL,
  estimate      NVARCHAR(MAX)    NULL
);
CREATE INDEX idx_idea_support_requests_idea_id ON idea_support_requests (idea_id);

CREATE TABLE idea_mentor_preferences (
  id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_idea_mentor_preferences PRIMARY KEY DEFAULT NEWID(),
  idea_id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_idea_mentor_preferences_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  priority           INT              NOT NULL CONSTRAINT ck_idea_mentor_preferences_priority CHECK (priority IN (1, 2)),
  mentor_profile_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_idea_mentor_preferences_mentor REFERENCES mentor_profiles (id),
  CONSTRAINT uq_idea_mentor_preferences_priority UNIQUE (idea_id, priority),
  CONSTRAINT uq_idea_mentor_preferences_mentor UNIQUE (idea_id, mentor_profile_id)
);
CREATE INDEX idx_idea_mentor_preferences_idea_id ON idea_mentor_preferences (idea_id);

CREATE TABLE review_assignments (
  id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_review_assignments PRIMARY KEY DEFAULT NEWID(),
  idea_id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_review_assignments_idea_id UNIQUE
                     CONSTRAINT fk_review_assignments_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  mentor_profile_id  UNIQUEIDENTIFIER NULL CONSTRAINT fk_review_assignments_mentor REFERENCES mentor_profiles (id),
  status             NVARCHAR(40)     NOT NULL DEFAULT 'pending'
                     CONSTRAINT ck_review_assignments_status CHECK (status IN ('pending', 'routing_required', 'reassigned')),
  assigned_at        DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  created_by         UNIQUEIDENTIFIER NULL CONSTRAINT fk_review_assignments_created_by REFERENCES profiles (id)
);
CREATE INDEX idx_review_assignments_mentor ON review_assignments (mentor_profile_id);
CREATE INDEX idx_review_assignments_status ON review_assignments (status);

-- reviews.idea_id is NO ACTION (not CASCADE): deleting an idea already
-- removes its reviews via ideas -> review_assignments -> reviews.
CREATE TABLE reviews (
  id                        UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_reviews PRIMARY KEY DEFAULT NEWID(),
  review_assignment_id      UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_reviews_review_assignment_id UNIQUE
                            CONSTRAINT fk_reviews_review_assignments REFERENCES review_assignments (id) ON DELETE CASCADE,
  idea_id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_reviews_ideas REFERENCES ideas (id),
  reviewer_id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_reviews_reviewer REFERENCES profiles (id),
  desirability              BIT              NULL,
  viability                 BIT              NULL,
  realistic_implementation  BIT              NULL,
  recommendation            NVARCHAR(40)     NULL
                            CONSTRAINT ck_reviews_recommendation CHECK (recommendation IN ('recommend_pass', 'recommend_not_pass')),
  comment                   NVARCHAR(MAX)    NULL,
  status                    NVARCHAR(40)     NOT NULL DEFAULT 'draft'
                            CONSTRAINT ck_reviews_status CHECK (status IN ('draft', 'submitted', 'reopened')),
  submitted_at              DATETIMEOFFSET(3) NULL,
  reopened_at               DATETIMEOFFSET(3) NULL,
  reopen_reason             NVARCHAR(MAX)    NULL,
  version                   INT              NOT NULL DEFAULT 1,
  created_at                DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at                DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
CREATE INDEX idx_reviews_idea_id ON reviews (idea_id);
CREATE INDEX idx_reviews_reviewer_id ON reviews (reviewer_id);
CREATE INDEX idx_reviews_status ON reviews (status);

-- ---------------------------------------------------------------------
-- Workflow
-- ---------------------------------------------------------------------
CREATE TABLE screening_decisions (
  id                           UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_screening_decisions PRIMARY KEY DEFAULT NEWID(),
  idea_id                      UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_screening_decisions_idea_id UNIQUE
                               CONSTRAINT fk_screening_decisions_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  decision                     NVARCHAR(40)     NOT NULL
                               CONSTRAINT ck_screening_decisions_decision CHECK (decision IN ('pass_to_qualifier', 'not_pass')),
  differs_from_recommendation  BIT              NOT NULL DEFAULT 0,
  internal_reason              NVARCHAR(MAX)    NULL,
  decided_by                   UNIQUEIDENTIFIER NULL CONSTRAINT fk_screening_decisions_decided_by REFERENCES profiles (id),
  decided_at                   DATETIMEOFFSET(3) NULL,
  published                    BIT              NOT NULL DEFAULT 0,
  published_at                 DATETIMEOFFSET(3) NULL
);

CREATE TABLE qualifier_assessments (
  id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_qualifier_assessments PRIMARY KEY DEFAULT NEWID(),
  idea_id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_qualifier_assessments_idea_id UNIQUE
                   CONSTRAINT fk_qualifier_assessments_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  final_score      DECIMAL(6, 2)    NULL,
  overall_comment  NVARCHAR(MAX)    NULL,
  build_decision   NVARCHAR(40)     NULL
                   CONSTRAINT ck_qualifier_assessments_build CHECK (build_decision IN ('build', 'no_build')),
  status           NVARCHAR(40)     NOT NULL DEFAULT 'draft'
                   CONSTRAINT ck_qualifier_assessments_status CHECK (status IN ('draft', 'finalized')),
  finalized_at     DATETIMEOFFSET(3) NULL,
  published        BIT              NOT NULL DEFAULT 0,
  published_at     DATETIMEOFFSET(3) NULL,
  decided_by       UNIQUEIDENTIFIER NULL CONSTRAINT fk_qualifier_assessments_decided_by REFERENCES profiles (id)
);

CREATE TABLE project_mentor_assignments (
  id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_project_mentor_assignments PRIMARY KEY DEFAULT NEWID(),
  idea_id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_project_mentor_assignments_idea_id UNIQUE
                     CONSTRAINT fk_project_mentor_assignments_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  mentor_profile_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_project_mentor_assignments_mentor REFERENCES mentor_profiles (id),
  assigned_at        DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  published          BIT              NOT NULL DEFAULT 0,
  published_at       DATETIMEOFFSET(3) NULL,
  assigned_by        UNIQUEIDENTIFIER NULL CONSTRAINT fk_project_mentor_assignments_assigned_by REFERENCES profiles (id)
);

-- program_id is denormalized from ideas.program_id by
-- trg_final_presentation_program_id (0002_triggers.sql) so the
-- one-winner-per-program rule can be a plain filtered unique index. It is
-- nullable only so the trigger can fill it in; NO ACTION because programs
-- already cascade to this table through ideas.
CREATE TABLE final_presentation_assessments (
  id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_final_presentation_assessments PRIMARY KEY DEFAULT NEWID(),
  idea_id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_final_presentation_assessments_idea_id UNIQUE
                   CONSTRAINT fk_final_presentation_assessments_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  program_id       UNIQUEIDENTIFIER NULL CONSTRAINT fk_final_presentation_assessments_programs REFERENCES programs (id),
  final_score      DECIMAL(6, 2)    NULL,
  overall_comment  NVARCHAR(MAX)    NULL,
  winner_decision  NVARCHAR(40)     NULL
                   CONSTRAINT ck_final_presentation_assessments_decision CHECK (winner_decision IN ('winner', 'no_winner')),
  winner_category  NVARCHAR(40)     NULL
                   CONSTRAINT ck_final_presentation_assessments_category CHECK (winner_category IN ('grand_winner', 'runner_up')),
  status           NVARCHAR(40)     NOT NULL DEFAULT 'draft'
                   CONSTRAINT ck_final_presentation_assessments_status CHECK (status IN ('draft', 'finalized')),
  finalized_at     DATETIMEOFFSET(3) NULL,
  published        BIT              NOT NULL DEFAULT 0,
  published_at     DATETIMEOFFSET(3) NULL,
  decided_by       UNIQUEIDENTIFIER NULL CONSTRAINT fk_final_presentation_assessments_decided_by REFERENCES profiles (id)
);
CREATE UNIQUE INDEX uq_one_grand_winner_per_program
  ON final_presentation_assessments (program_id)
  WHERE winner_category = 'grand_winner' AND program_id IS NOT NULL;
CREATE UNIQUE INDEX uq_one_runner_up_per_program
  ON final_presentation_assessments (program_id)
  WHERE winner_category = 'runner_up' AND program_id IS NOT NULL;

-- program_id is NO ACTION: programs already cascade here through ideas.
CREATE TABLE showcase_projects (
  id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_showcase_projects PRIMARY KEY DEFAULT NEWID(),
  idea_id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_showcase_projects_idea_id UNIQUE
                     CONSTRAINT fk_showcase_projects_ideas REFERENCES ideas (id) ON DELETE CASCADE,
  program_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_showcase_projects_programs REFERENCES programs (id),
  image_url          NVARCHAR(1000)   NULL,
  short_description  NVARCHAR(MAX)    NULL,
  published          BIT              NOT NULL DEFAULT 0,
  published_at       DATETIMEOFFSET(3) NULL,
  created_at         DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
CREATE INDEX idx_showcase_projects_program_id ON showcase_projects (program_id);
CREATE INDEX idx_showcase_projects_published ON showcase_projects (published);

CREATE TABLE voting_periods (
  id                        UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_voting_periods PRIMARY KEY DEFAULT NEWID(),
  program_id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_voting_periods_programs REFERENCES programs (id) ON DELETE CASCADE,
  opens_at                  DATETIMEOFFSET(3) NOT NULL,
  closes_at                 DATETIMEOFFSET(3) NOT NULL,
  results_published         BIT              NOT NULL DEFAULT 0,
  results_published_at      DATETIMEOFFSET(3) NULL,
  show_percentages          BIT              NOT NULL DEFAULT 1,
  opened_notified_at        DATETIMEOFFSET(3) NULL,
  closing_reminder_sent_at  DATETIMEOFFSET(3) NULL,
  CONSTRAINT ck_voting_periods_window CHECK (closes_at > opens_at)
);
CREATE INDEX idx_voting_periods_program_id ON voting_periods (program_id);

CREATE TABLE votes (
  id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_votes PRIMARY KEY DEFAULT NEWID(),
  voting_period_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_votes_voting_periods REFERENCES voting_periods (id) ON DELETE CASCADE,
  voter_id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_votes_voter REFERENCES profiles (id),
  idea_id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_votes_ideas REFERENCES ideas (id),
  created_at        DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT uq_votes_period_voter UNIQUE (voting_period_id, voter_id)
);
CREATE INDEX idx_votes_voting_period_id ON votes (voting_period_id);
CREATE INDEX idx_votes_idea_id ON votes (idea_id);

CREATE TABLE publications (
  id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_publications PRIMARY KEY DEFAULT NEWID(),
  program_id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_publications_programs REFERENCES programs (id) ON DELETE CASCADE,
  entity_type   NVARCHAR(60)     NOT NULL,
  entity_id     UNIQUEIDENTIFIER NOT NULL,
  published_by  UNIQUEIDENTIFIER NULL CONSTRAINT fk_publications_published_by REFERENCES profiles (id),
  published_at  DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  notes         NVARCHAR(MAX)    NULL
);
CREATE INDEX idx_publications_program_entity ON publications (program_id, entity_type);

CREATE TABLE notifications (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_notifications PRIMARY KEY DEFAULT NEWID(),
  user_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_notifications_profiles REFERENCES profiles (id) ON DELETE CASCADE,
  type        NVARCHAR(60)     NOT NULL,
  title       NVARCHAR(400)    NOT NULL,
  body        NVARCHAR(MAX)    NULL,
  link        NVARCHAR(1000)   NULL,
  [read]      BIT              NOT NULL DEFAULT 0,
  created_at  DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
CREATE INDEX idx_notifications_user_id ON notifications (user_id, created_at DESC);

CREATE TABLE email_outbox (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_email_outbox PRIMARY KEY DEFAULT NEWID(),
  to_email    NVARCHAR(320)    NOT NULL,
  subject     NVARCHAR(400)    NOT NULL,
  body        NVARCHAR(MAX)    NOT NULL,
  status      NVARCHAR(40)     NOT NULL DEFAULT 'pending'
              CONSTRAINT ck_email_outbox_status CHECK (status IN ('pending', 'sent', 'failed')),
  created_at  DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  sent_at     DATETIMEOFFSET(3) NULL,
  error       NVARCHAR(MAX)    NULL
);
CREATE INDEX idx_email_outbox_status ON email_outbox (status);

CREATE TABLE audit_logs (
  id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_audit_logs PRIMARY KEY DEFAULT NEWID(),
  program_id      UNIQUEIDENTIFIER NULL CONSTRAINT fk_audit_logs_programs REFERENCES programs (id) ON DELETE SET NULL,
  entity_type     NVARCHAR(60)     NOT NULL,
  entity_id       UNIQUEIDENTIFIER NOT NULL,
  actor_id        UNIQUEIDENTIFIER NULL CONSTRAINT fk_audit_logs_actor REFERENCES profiles (id),
  action          NVARCHAR(100)    NOT NULL,
  prior_value     NVARCHAR(MAX)    NULL CONSTRAINT ck_audit_logs_prior_json CHECK (prior_value IS NULL OR ISJSON(prior_value) = 1),
  new_value       NVARCHAR(MAX)    NULL CONSTRAINT ck_audit_logs_new_json CHECK (new_value IS NULL OR ISJSON(new_value) = 1),
  reason          NVARCHAR(MAX)    NULL,
  correlation_id  UNIQUEIDENTIFIER NULL,
  created_at      DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_program_id ON audit_logs (program_id);
