-- db/seed.sql
-- SQL Server port of supabase/seed.sql. Idempotent demo data for local
-- development; safe to re-run.
--
-- profiles.id references users.id, so the demo `users` rows must exist
-- first. `npm run db:seed` (scripts/seed.ts) creates them with bcrypt
-- password hashes using these SAME fixed UUIDs, then runs this file.

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @now DATETIMEOFFSET(3) = SYSDATETIMEOFFSET();
DECLARE @program UNIQUEIDENTIFIER = '66666666-6666-6666-6666-666666666001';

BEGIN TRAN;

-- ---------------------------------------------------------------------
-- Demo users (fixed UUIDs so this file and scripts/seed.ts agree)
-- ---------------------------------------------------------------------
MERGE profiles AS t
USING (VALUES
  ('11111111-1111-1111-1111-111111111001', 'EMP-A01', 'demo.admin1@godrejcp.com', 'Asha Admin', 'Program Manager', 'Innovation Office'),
  ('11111111-1111-1111-1111-111111111002', 'EMP-A02', 'demo.admin2@godrejcp.com', 'Rohan Admin', 'Program Manager', 'Innovation Office'),
  ('11111111-1111-1111-1111-111111111003', 'EMP-A03', 'demo.admin3@godrejcp.com', 'Meera Admin', 'Program Coordinator', 'Innovation Office'),
  ('22222222-2222-2222-2222-222222222001', 'EMP-M01', 'demo.mentor1@godrejcp.com', 'Vikram Mentor', 'Senior Manager', 'Data & AI'),
  ('22222222-2222-2222-2222-222222222002', 'EMP-M02', 'demo.mentor2@godrejcp.com', 'Priya Mentor', 'Senior Manager', 'Digital'),
  ('22222222-2222-2222-2222-222222222003', 'EMP-M03', 'demo.mentor3@godrejcp.com', 'Karan Mentor', 'Principal Engineer', 'Technology'),
  ('33333333-3333-3333-3333-333333333001', 'EMP-P01', 'demo.participant1@godrejcp.com', 'Sara Participant', 'Analyst', 'Supply Chain'),
  ('33333333-3333-3333-3333-333333333002', 'EMP-P02', 'demo.participant2@godrejcp.com', 'Dev Participant', 'Associate', 'Finance'),
  ('33333333-3333-3333-3333-333333333003', 'EMP-P03', 'demo.participant3@godrejcp.com', 'Ila Participant', 'Executive', 'HR'),
  ('44444444-4444-4444-4444-444444444001', 'EMP-V01', 'demo.voter1@godrejcp.com', 'Nina Voter', 'Executive', 'Marketing'),
  ('44444444-4444-4444-4444-444444444002', 'EMP-V02', 'demo.voter2@godrejcp.com', 'Omkar Voter', 'Executive', 'Sales'),
  ('44444444-4444-4444-4444-444444444003', 'EMP-V03', 'demo.voter3@godrejcp.com', 'Zara Voter', 'Executive', 'Operations')
) AS s (id, employee_id, email, full_name, job_title, department)
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET
  employee_id = s.employee_id, full_name = s.full_name, job_title = s.job_title,
  department = s.department, active = 1
WHEN NOT MATCHED THEN INSERT (id, employee_id, email, full_name, job_title, department, active)
  VALUES (s.id, s.employee_id, s.email, s.full_name, s.job_title, s.department, 1);

INSERT INTO user_roles (user_id, role_id)
SELECT p.id, r.id
  FROM profiles p CROSS JOIN roles r
 WHERE ((p.email LIKE 'demo.admin%' AND r.name = 'admin')
     OR (p.email LIKE 'demo.mentor%' AND r.name = 'mentor')
     OR (p.email LIKE 'demo.participant%' AND r.name = 'participant')
     OR (p.email LIKE 'demo.voter%' AND r.name = 'employee_voter'))
   AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role_id = r.id);

MERGE mentor_profiles AS t
USING (VALUES
  ('55555555-5555-5555-5555-555555555001', '22222222-2222-2222-2222-222222222001', 'Vikram leads AI adoption across the Data & AI function, with a focus on demand forecasting, machine learning in production and turning analytics prototypes into tools business teams use every day. He can help shape a measurable problem statement and a realistic data plan.', 'Leads AI adoption in Data & AI.', 10),
  ('55555555-5555-5555-5555-555555555002', '22222222-2222-2222-2222-222222222002', 'Priya mentors digital-first ideas from concept to pilot. Her strengths are product discovery, user research and UX design, and she helps teams test assumptions early, define a clear user journey and scope a minimum viable product.', 'Product mentor for digital-first ideas.', 10),
  ('55555555-5555-5555-5555-555555555003', '22222222-2222-2222-2222-222222222003', 'Karan is a principal engineer specialising in platform engineering, cloud architecture and integration with enterprise systems such as SAP. He guides teams on technical feasibility, security and building solutions that can scale beyond a pilot.', 'Principal engineer mentoring technical builds.', 2)
) AS s (id, profile_id, expertise, bio, max_capacity)
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET expertise = s.expertise, bio = s.bio, max_capacity = s.max_capacity
WHEN NOT MATCHED THEN INSERT (id, profile_id, expertise, bio, max_capacity)
  VALUES (s.id, s.profile_id, s.expertise, s.bio, s.max_capacity);

-- ---------------------------------------------------------------------
-- Program + stages
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM programs WHERE id = @program)
  INSERT INTO programs (
    id, title, description, submission_open_at, submission_close_at, screening_close_at,
    qualifier_close_at, final_presentation_close_at, showcase_open_at, voting_open_at, voting_close_at, status
  ) VALUES (
    @program, 'AI Innovation Challenge 2026',
    'Godrej Industries Group''s flagship internal AI innovation program.',
    DATEADD(day, -20, @now), DATEADD(day, 10, @now), DATEADD(day, 20, @now),
    DATEADD(day, 35, @now), DATEADD(day, 50, @now), DATEADD(day, 55, @now),
    DATEADD(day, 60, @now), DATEADD(day, 67, @now), 'active'
  );
ELSE
  UPDATE programs SET title = 'AI Innovation Challenge 2026', status = 'active' WHERE id = @program;

MERGE program_stages AS t
USING (VALUES
  ('submission',         'Idea Submission',           -20, 10, 'active'),
  ('review',             'Mentor Review',             -10, 17, 'active'),
  ('screening',          'Screening',                  10, 20, 'draft'),
  ('qualifier',          'Qualifier',                  20, 35, 'draft'),
  ('project_mentor',     'Project Mentor Assignment',  35, 40, 'draft'),
  ('final_presentation', 'Final Presentation',         40, 50, 'draft'),
  ('showcase',           'Showcase',                   55, 90, 'draft'),
  ('voting',             'Voting',                     60, 67, 'draft')
) AS s (stage_key, label, start_offset, end_offset, status)
ON t.program_id = @program AND t.stage_key = s.stage_key
WHEN MATCHED THEN UPDATE SET label = s.label, status = s.status
WHEN NOT MATCHED THEN INSERT (program_id, stage_key, label, starts_at, ends_at, status)
  VALUES (@program, s.stage_key, s.label, DATEADD(day, s.start_offset, @now), DATEADD(day, s.end_offset, @now), s.status);

MERGE program_content AS t
USING (VALUES
  ('overview', 'About the challenge', 'Submit your AI-powered idea to solve a real business problem at Godrej.'),
  ('faq', 'FAQ', 'Who can participate? Any full-time Godrej employee.')
) AS s ([key], title, body)
ON t.program_id = @program AND t.[key] = s.[key]
WHEN MATCHED THEN UPDATE SET title = s.title, body = s.body
WHEN NOT MATCHED THEN INSERT (program_id, [key], title, body) VALUES (@program, s.[key], s.title, s.body);

-- ---------------------------------------------------------------------
-- Ideas: one draft, one submitted+reviewed, one routing-required,
-- one screened+published, one qualifier build, one qualifier no_build.
-- ---------------------------------------------------------------------
MERGE ideas AS t
USING (VALUES
  ('77777777-7777-7777-7777-777777777001', 'Team Aurora', '33333333-3333-3333-3333-333333333001',
   'Draft: Smart Reorder Assistant', 'Manual reorder decisions are slow.',
   'An AI assistant that predicts reorder points.', 'Supply chain planners', 'draft', NULL, 0),
  ('77777777-7777-7777-7777-777777777002', 'Team Beacon', '33333333-3333-3333-3333-333333333002',
   'Invoice Anomaly Detector', 'Finance manually audits invoices for fraud.',
   'ML model flags anomalous invoices for review.', 'Finance controllers', 'submitted', -8, 1),
  ('77777777-7777-7777-7777-777777777003', 'Team Comet', '33333333-3333-3333-3333-333333333003',
   'HR Onboarding Chatbot', 'New hires ask repetitive onboarding questions.',
   'A chatbot trained on HR policy docs.', 'New employees', 'submitted', -6, 1),
  ('77777777-7777-7777-7777-777777777004', 'Team Delta', '33333333-3333-3333-3333-333333333001',
   'Demand Forecast Copilot', 'Forecast accuracy is inconsistent across regions.',
   'A copilot that blends historical + market signal forecasting.', 'Regional planners', 'submitted', -12, 1),
  ('77777777-7777-7777-7777-777777777005', 'Team Echo', '33333333-3333-3333-3333-333333333002',
   'Warehouse Vision QC', 'Manual defect inspection is slow and inconsistent.',
   'Computer vision QC on the packaging line.', 'Warehouse QC teams', 'submitted', -14, 1)
) AS s (id, team_name, leader, idea_title, problem, solution, target_users, status, submitted_offset, locked)
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET idea_title = s.idea_title, status = s.status
WHEN NOT MATCHED THEN INSERT (id, program_id, team_name, team_leader_id, idea_title, problem_opportunity,
                              proposed_solution, target_users, status, submitted_at, locked, created_by)
  VALUES (s.id, @program, s.team_name, s.leader, s.idea_title, s.problem, s.solution, s.target_users, s.status,
          CASE WHEN s.submitted_offset IS NULL THEN NULL ELSE DATEADD(day, s.submitted_offset, @now) END,
          s.locked, s.leader);

INSERT INTO idea_impacts (idea_id, impact_kind, impact_type, explanation, measurable_result)
SELECT s.idea_id, 'primary', s.impact_type, s.explanation, s.measurable_result
  FROM (VALUES
    ('77777777-7777-7777-7777-777777777002', 'cost_optimization', 'Reduces manual audit hours.', '30% reduction in audit time'),
    ('77777777-7777-7777-7777-777777777003', 'time_efficiency', 'Cuts onboarding query resolution time.', '50% faster response'),
    ('77777777-7777-7777-7777-777777777004', 'revenue_growth', 'Improves forecast accuracy, reducing stockouts.', '12% forecast accuracy gain'),
    ('77777777-7777-7777-7777-777777777005', 'governance_excellence', 'More consistent QC decisions.', '95% inspection consistency')
  ) AS s (idea_id, impact_type, explanation, measurable_result)
 WHERE NOT EXISTS (SELECT 1 FROM idea_impacts x WHERE x.idea_id = s.idea_id);

-- ---------------------------------------------------------------------
-- Review routing: one pending (assigned), one routing_required, others
-- reviewed and completed.
-- ---------------------------------------------------------------------
MERGE review_assignments AS t
USING (VALUES
  ('88888888-8888-8888-8888-888888888001', '77777777-7777-7777-7777-777777777002', '55555555-5555-5555-5555-555555555001', 'pending'),
  ('88888888-8888-8888-8888-888888888002', '77777777-7777-7777-7777-777777777003', '55555555-5555-5555-5555-555555555003', 'routing_required'),
  ('88888888-8888-8888-8888-888888888003', '77777777-7777-7777-7777-777777777004', '55555555-5555-5555-5555-555555555002', 'pending'),
  ('88888888-8888-8888-8888-888888888004', '77777777-7777-7777-7777-777777777005', '55555555-5555-5555-5555-555555555001', 'pending')
) AS s (id, idea_id, mentor_profile_id, status)
ON t.idea_id = s.idea_id
WHEN MATCHED THEN UPDATE SET status = s.status
WHEN NOT MATCHED THEN INSERT (id, idea_id, mentor_profile_id, status)
  VALUES (s.id, s.idea_id, s.mentor_profile_id, s.status);

INSERT INTO reviews (review_assignment_id, idea_id, reviewer_id, desirability, viability,
                     realistic_implementation, recommendation, comment, status, submitted_at)
SELECT s.ra, s.idea_id, s.reviewer, s.d, s.v, s.r, s.rec, s.comment, 'submitted', DATEADD(day, s.offset_days, @now)
  FROM (VALUES
    ('88888888-8888-8888-8888-888888888003', '77777777-7777-7777-7777-777777777004', '22222222-2222-2222-2222-222222222002',
     1, 1, 1, 'recommend_pass', 'Strong forecasting use case, clear ROI.', -5),
    ('88888888-8888-8888-8888-888888888004', '77777777-7777-7777-7777-777777777005', '22222222-2222-2222-2222-222222222001',
     1, 0, 1, 'recommend_not_pass', 'Vision hardware dependency is a risk this cycle.', -4)
  ) AS s (ra, idea_id, reviewer, d, v, r, rec, comment, offset_days)
 WHERE NOT EXISTS (SELECT 1 FROM reviews x WHERE x.review_assignment_id = s.ra);

-- ---------------------------------------------------------------------
-- Screening: one published pass, one unpublished not-pass.
-- ---------------------------------------------------------------------
MERGE screening_decisions AS t
USING (VALUES
  ('77777777-7777-7777-7777-777777777004', 'pass_to_qualifier', 'Aligned with mentor recommendation.', 1, -2),
  ('77777777-7777-7777-7777-777777777005', 'not_pass', 'Hardware dependency too costly this cycle.', 0, NULL)
) AS s (idea_id, decision, internal_reason, published, published_offset)
ON t.idea_id = s.idea_id
WHEN MATCHED THEN UPDATE SET decision = s.decision, published = s.published
WHEN NOT MATCHED THEN INSERT (idea_id, decision, differs_from_recommendation, internal_reason,
                              decided_by, decided_at, published, published_at)
  VALUES (s.idea_id, s.decision, 0, s.internal_reason, '11111111-1111-1111-1111-111111111001',
          DATEADD(day, -3, @now), s.published,
          CASE WHEN s.published_offset IS NULL THEN NULL ELSE DATEADD(day, s.published_offset, @now) END);

-- ---------------------------------------------------------------------
-- Qualifier: one build, one no_build.
-- ---------------------------------------------------------------------
MERGE qualifier_assessments AS t
USING (VALUES
  ('77777777-7777-7777-7777-777777777004', 88.5, 'High feasibility and strong business case.', 'build', 1),
  ('77777777-7777-7777-7777-777777777002', 54.0, 'Promising but needs more data access clarity.', 'no_build', 0)
) AS s (idea_id, final_score, overall_comment, build_decision, published)
ON t.idea_id = s.idea_id
WHEN MATCHED THEN UPDATE SET final_score = s.final_score, build_decision = s.build_decision
WHEN NOT MATCHED THEN INSERT (idea_id, final_score, overall_comment, build_decision, status,
                              finalized_at, published, published_at, decided_by)
  VALUES (s.idea_id, s.final_score, s.overall_comment, s.build_decision, 'finalized',
          DATEADD(day, -1, @now), s.published, CASE WHEN s.published = 1 THEN @now END,
          '11111111-1111-1111-1111-111111111002');

-- ---------------------------------------------------------------------
-- Project mentor assignment for the built idea.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM project_mentor_assignments WHERE idea_id = '77777777-7777-7777-7777-777777777004')
  INSERT INTO project_mentor_assignments (idea_id, mentor_profile_id, published, published_at, assigned_by)
  VALUES ('77777777-7777-7777-7777-777777777004', '55555555-5555-5555-5555-555555555003', 1, @now,
          '11111111-1111-1111-1111-111111111001');
ELSE
  UPDATE project_mentor_assignments SET mentor_profile_id = '55555555-5555-5555-5555-555555555003'
   WHERE idea_id = '77777777-7777-7777-7777-777777777004';

-- ---------------------------------------------------------------------
-- Showcase projects.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM showcase_projects WHERE idea_id = '77777777-7777-7777-7777-777777777004')
  INSERT INTO showcase_projects (idea_id, program_id, image_url, short_description, published, published_at)
  VALUES ('77777777-7777-7777-7777-777777777004', @program, NULL,
          'A copilot that blends historical and market signal forecasting for regional planners.', 1, @now);
ELSE
  UPDATE showcase_projects
     SET short_description = 'A copilot that blends historical and market signal forecasting for regional planners.',
         published = 1
   WHERE idea_id = '77777777-7777-7777-7777-777777777004';

-- ---------------------------------------------------------------------
-- Voting periods: one closed with published results, one currently open.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM voting_periods WHERE id = '99999999-9999-9999-9999-999999999001')
  INSERT INTO voting_periods (id, program_id, opens_at, closes_at, results_published, results_published_at, show_percentages)
  VALUES ('99999999-9999-9999-9999-999999999001', @program, DATEADD(day, -30, @now), DATEADD(day, -25, @now),
          1, DATEADD(day, -24, @now), 1);

IF NOT EXISTS (SELECT 1 FROM voting_periods WHERE id = '99999999-9999-9999-9999-999999999002')
  INSERT INTO voting_periods (id, program_id, opens_at, closes_at, results_published, results_published_at, show_percentages)
  VALUES ('99999999-9999-9999-9999-999999999002', @program, DATEADD(hour, -1, @now), DATEADD(day, 7, @now),
          0, NULL, 1);

INSERT INTO votes (voting_period_id, voter_id, idea_id)
SELECT s.period, s.voter, s.idea_id
  FROM (VALUES
    ('99999999-9999-9999-9999-999999999001', '44444444-4444-4444-4444-444444444001', '77777777-7777-7777-7777-777777777004'),
    ('99999999-9999-9999-9999-999999999001', '44444444-4444-4444-4444-444444444002', '77777777-7777-7777-7777-777777777004'),
    ('99999999-9999-9999-9999-999999999001', '44444444-4444-4444-4444-444444444003', '77777777-7777-7777-7777-777777777002')
  ) AS s (period, voter, idea_id)
 WHERE NOT EXISTS (SELECT 1 FROM votes v WHERE v.voting_period_id = s.period AND v.voter_id = s.voter);

-- ---------------------------------------------------------------------
-- Notifications + a sample audit record (only on first seed).
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM notifications WHERE type = 'routing_required'
               AND user_id = '33333333-3333-3333-3333-333333333003')
  INSERT INTO notifications (user_id, type, title, body, link, [read])
  VALUES
    ('33333333-3333-3333-3333-333333333003', 'routing_required', 'Routing required', 'Your idea needs manual reviewer assignment.', '/my-ideas', 0),
    ('11111111-1111-1111-1111-111111111001', 'routing_required', 'Routing required', 'An idea needs manual reviewer assignment.', '/review-assignment', 0);

IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'qualifier_finalized'
               AND entity_id = '77777777-7777-7777-7777-777777777004')
  INSERT INTO audit_logs (program_id, entity_type, entity_id, actor_id, action, new_value)
  VALUES (@program, 'idea', '77777777-7777-7777-7777-777777777004', '11111111-1111-1111-1111-111111111002',
          'qualifier_finalized', N'{"build_decision": "build"}');

COMMIT;

-- Session-level SETs outlive this batch on a pooled connection; restore the
-- defaults so later statements on the same connection report row counts.
SET NOCOUNT OFF;
SET XACT_ABORT OFF;
