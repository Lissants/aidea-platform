-- supabase/seed.sql
-- Idempotent demo data for local development. Safe to re-run.
--
-- IMPORTANT: profiles.id references auth.users(id), so the demo auth users
-- below must already exist before this file runs. In a real Supabase
-- project you cannot INSERT into auth.users directly with SQL you control
-- end-to-end (Auth manages hashing/metadata) — the supported path is the
-- Admin API (auth.admin.createUser), which is what scripts/seed.ts does,
-- using these SAME fixed UUIDs so this SQL and that script line up. Run
-- `npm run seed` to do both steps in the right order automatically; this
-- file is also kept standalone/idempotent for direct psql use once the
-- matching auth.users rows exist.

-- ---------------------------------------------------------------------
-- Demo users (fixed UUIDs so this file and scripts/seed.ts agree)
-- ---------------------------------------------------------------------
insert into profiles (id, employee_id, email, full_name, job_title, department, active)
values
  ('11111111-1111-1111-1111-111111111001', 'EMP-A01', 'demo.admin1@godrejcp.com', 'Asha Admin', 'Program Manager', 'Innovation Office', true),
  ('11111111-1111-1111-1111-111111111002', 'EMP-A02', 'demo.admin2@godrejcp.com', 'Rohan Admin', 'Program Manager', 'Innovation Office', true),
  ('11111111-1111-1111-1111-111111111003', 'EMP-A03', 'demo.admin3@godrejcp.com', 'Meera Admin', 'Program Coordinator', 'Innovation Office', true),
  ('22222222-2222-2222-2222-222222222001', 'EMP-M01', 'demo.mentor1@godrejcp.com', 'Vikram Mentor', 'Senior Manager', 'Data & AI', true),
  ('22222222-2222-2222-2222-222222222002', 'EMP-M02', 'demo.mentor2@godrejcp.com', 'Priya Mentor', 'Senior Manager', 'Digital', true),
  ('22222222-2222-2222-2222-222222222003', 'EMP-M03', 'demo.mentor3@godrejcp.com', 'Karan Mentor', 'Principal Engineer', 'Technology', true),
  ('33333333-3333-3333-3333-333333333001', 'EMP-P01', 'demo.participant1@godrejcp.com', 'Sara Participant', 'Analyst', 'Supply Chain', true),
  ('33333333-3333-3333-3333-333333333002', 'EMP-P02', 'demo.participant2@godrejcp.com', 'Dev Participant', 'Associate', 'Finance', true),
  ('33333333-3333-3333-3333-333333333003', 'EMP-P03', 'demo.participant3@godrejcp.com', 'Ila Participant', 'Executive', 'HR', true),
  ('44444444-4444-4444-4444-444444444001', 'EMP-V01', 'demo.voter1@godrejcp.com', 'Nina Voter', 'Executive', 'Marketing', true),
  ('44444444-4444-4444-4444-444444444002', 'EMP-V02', 'demo.voter2@godrejcp.com', 'Omkar Voter', 'Executive', 'Sales', true),
  ('44444444-4444-4444-4444-444444444003', 'EMP-V03', 'demo.voter3@godrejcp.com', 'Zara Voter', 'Executive', 'Operations', true)
on conflict (id) do update set
  employee_id = excluded.employee_id, full_name = excluded.full_name,
  job_title = excluded.job_title, department = excluded.department, active = excluded.active;

insert into user_roles (user_id, role_id)
select p.id, r.id from profiles p, roles r
where (p.email like 'demo.admin%' and r.name = 'admin')
   or (p.email like 'demo.mentor%' and r.name = 'mentor')
   or (p.email like 'demo.participant%' and r.name = 'participant')
   or (p.email like 'demo.voter%' and r.name = 'employee_voter')
on conflict (user_id, role_id) do nothing;

insert into mentor_profiles (id, profile_id, expertise, bio, max_capacity)
values
  ('55555555-5555-5555-5555-555555555001', '22222222-2222-2222-2222-222222222001', 'Data & AI, forecasting', 'Leads AI adoption in Data & AI.', 10),
  ('55555555-5555-5555-5555-555555555002', '22222222-2222-2222-2222-222222222002', 'Digital product, UX', 'Product mentor for digital-first ideas.', 10),
  ('55555555-5555-5555-5555-555555555003', '22222222-2222-2222-2222-222222222003', 'Platform engineering', 'Principal engineer mentoring technical builds.', 2)
on conflict (id) do update set expertise = excluded.expertise, bio = excluded.bio, max_capacity = excluded.max_capacity;

-- ---------------------------------------------------------------------
-- Program + stages
-- ---------------------------------------------------------------------
insert into programs (
  id, title, description, submission_open_at, submission_close_at, screening_close_at,
  qualifier_close_at, final_presentation_close_at, showcase_open_at, voting_open_at, voting_close_at, status
) values (
  '66666666-6666-6666-6666-666666666001', 'AI Innovation Challenge 2026',
  'Godrej Industries Group''s flagship internal AI innovation program.',
  now() - interval '20 days', now() + interval '10 days', now() + interval '20 days',
  now() + interval '35 days', now() + interval '50 days', now() + interval '55 days',
  now() + interval '60 days', now() + interval '67 days', 'active'
) on conflict (id) do update set title = excluded.title, status = excluded.status;

insert into program_stages (program_id, stage_key, label, starts_at, ends_at, status)
values
  ('66666666-6666-6666-6666-666666666001', 'submission', 'Idea Submission', now() - interval '20 days', now() + interval '10 days', 'active'),
  ('66666666-6666-6666-6666-666666666001', 'review', 'Mentor Review', now() - interval '10 days', now() + interval '17 days', 'active'),
  ('66666666-6666-6666-6666-666666666001', 'screening', 'Screening', now() + interval '10 days', now() + interval '20 days', 'draft'),
  ('66666666-6666-6666-6666-666666666001', 'qualifier', 'Qualifier', now() + interval '20 days', now() + interval '35 days', 'draft'),
  ('66666666-6666-6666-6666-666666666001', 'project_mentor', 'Project Mentor Assignment', now() + interval '35 days', now() + interval '40 days', 'draft'),
  ('66666666-6666-6666-6666-666666666001', 'final_presentation', 'Final Presentation', now() + interval '40 days', now() + interval '50 days', 'draft'),
  ('66666666-6666-6666-6666-666666666001', 'showcase', 'Showcase', now() + interval '55 days', now() + interval '90 days', 'draft'),
  ('66666666-6666-6666-6666-666666666001', 'voting', 'Voting', now() + interval '60 days', now() + interval '67 days', 'draft')
on conflict (program_id, stage_key) do update set label = excluded.label, status = excluded.status;

insert into program_content (program_id, key, title, body)
values
  ('66666666-6666-6666-6666-666666666001', 'overview', 'About the challenge',
   'Submit your AI-powered idea to solve a real business problem at Godrej.'),
  ('66666666-6666-6666-6666-666666666001', 'faq', 'FAQ', 'Who can participate? Any full-time Godrej employee.')
on conflict (program_id, key) do update set title = excluded.title, body = excluded.body;

-- ---------------------------------------------------------------------
-- Ideas: one draft, one submitted+reviewed, one routing-required,
-- one screened+published, one qualifier build, one qualifier no_build.
-- ---------------------------------------------------------------------
insert into ideas (id, program_id, team_name, team_leader_id, idea_title, problem_opportunity, proposed_solution, target_users, status, submitted_at, locked, created_by)
values
  ('77777777-7777-7777-7777-777777777001', '66666666-6666-6666-6666-666666666001', 'Team Aurora',
   '33333333-3333-3333-3333-333333333001', 'Draft: Smart Reorder Assistant', 'Manual reorder decisions are slow.',
   'An AI assistant that predicts reorder points.', 'Supply chain planners', 'draft', null, false,
   '33333333-3333-3333-3333-333333333001'),

  ('77777777-7777-7777-7777-777777777002', '66666666-6666-6666-6666-666666666001', 'Team Beacon',
   '33333333-3333-3333-3333-333333333002', 'Invoice Anomaly Detector', 'Finance manually audits invoices for fraud.',
   'ML model flags anomalous invoices for review.', 'Finance controllers', 'submitted', now() - interval '8 days', true,
   '33333333-3333-3333-3333-333333333002'),

  ('77777777-7777-7777-7777-777777777003', '66666666-6666-6666-6666-666666666001', 'Team Comet',
   '33333333-3333-3333-3333-333333333003', 'HR Onboarding Chatbot', 'New hires ask repetitive onboarding questions.',
   'A chatbot trained on HR policy docs.', 'New employees', 'submitted', now() - interval '6 days', true,
   '33333333-3333-3333-3333-333333333003'),

  ('77777777-7777-7777-7777-777777777004', '66666666-6666-6666-6666-666666666001', 'Team Delta',
   '33333333-3333-3333-3333-333333333001', 'Demand Forecast Copilot', 'Forecast accuracy is inconsistent across regions.',
   'A copilot that blends historical + market signal forecasting.', 'Regional planners', 'submitted', now() - interval '12 days', true,
   '33333333-3333-3333-3333-333333333001'),

  ('77777777-7777-7777-7777-777777777005', '66666666-6666-6666-6666-666666666001', 'Team Echo',
   '33333333-3333-3333-3333-333333333002', 'Warehouse Vision QC', 'Manual defect inspection is slow and inconsistent.',
   'Computer vision QC on the packaging line.', 'Warehouse QC teams', 'submitted', now() - interval '14 days', true,
   '33333333-3333-3333-3333-333333333002')
on conflict (id) do update set idea_title = excluded.idea_title, status = excluded.status;

insert into idea_impacts (idea_id, impact_kind, impact_type, explanation, measurable_result)
values
  ('77777777-7777-7777-7777-777777777002', 'primary', 'cost_efficiency', 'Reduces manual audit hours.', '30% reduction in audit time'),
  ('77777777-7777-7777-7777-777777777003', 'primary', 'time_efficiency', 'Cuts onboarding query resolution time.', '50% faster response'),
  ('77777777-7777-7777-7777-777777777004', 'primary', 'revenue_growth', 'Improves forecast accuracy, reducing stockouts.', '12% forecast accuracy gain'),
  ('77777777-7777-7777-7777-777777777005', 'primary', 'governance_improvement', 'More consistent QC decisions.', '95% inspection consistency')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Review routing: one pending (assigned), one routing_required, others
-- reviewed and completed.
-- ---------------------------------------------------------------------
insert into review_assignments (id, idea_id, mentor_profile_id, status)
values
  ('88888888-8888-8888-8888-888888888001', '77777777-7777-7777-7777-777777777002', '55555555-5555-5555-5555-555555555001', 'pending'),
  ('88888888-8888-8888-8888-888888888002', '77777777-7777-7777-7777-777777777003', '55555555-5555-5555-5555-555555555003', 'routing_required'),
  ('88888888-8888-8888-8888-888888888003', '77777777-7777-7777-7777-777777777004', '55555555-5555-5555-5555-555555555002', 'pending'),
  ('88888888-8888-8888-8888-888888888004', '77777777-7777-7777-7777-777777777005', '55555555-5555-5555-5555-555555555001', 'pending')
on conflict (idea_id) do update set status = excluded.status;

insert into reviews (review_assignment_id, idea_id, reviewer_id, desirability, viability, realistic_implementation, recommendation, comment, status, submitted_at)
values
  ('88888888-8888-8888-8888-888888888003', '77777777-7777-7777-7777-777777777004', '22222222-2222-2222-2222-222222222002', true, true, true, 'recommend_pass', 'Strong forecasting use case, clear ROI.', 'submitted', now() - interval '5 days'),
  ('88888888-8888-8888-8888-888888888004', '77777777-7777-7777-7777-777777777005', '22222222-2222-2222-2222-222222222001', true, false, true, 'recommend_not_pass', 'Vision hardware dependency is a risk this cycle.', 'submitted', now() - interval '4 days')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Screening: one published pass, one unpublished not-pass.
-- ---------------------------------------------------------------------
insert into screening_decisions (idea_id, decision, differs_from_recommendation, internal_reason, decided_by, decided_at, published, published_at)
values
  ('77777777-7777-7777-7777-777777777004', 'pass_to_qualifier', false, 'Aligned with mentor recommendation.', '11111111-1111-1111-1111-111111111001', now() - interval '3 days', true, now() - interval '2 days'),
  ('77777777-7777-7777-7777-777777777005', 'not_pass', false, 'Hardware dependency too costly this cycle.', '11111111-1111-1111-1111-111111111001', now() - interval '3 days', false, null)
on conflict (idea_id) do update set decision = excluded.decision, published = excluded.published;

-- ---------------------------------------------------------------------
-- Qualifier: one build, one no_build.
-- ---------------------------------------------------------------------
insert into qualifier_assessments (idea_id, final_score, overall_comment, build_decision, status, finalized_at, published, published_at, decided_by)
values
  ('77777777-7777-7777-7777-777777777004', 88.5, 'High feasibility and strong business case.', 'build', 'finalized', now() - interval '1 day', true, now(), '11111111-1111-1111-1111-111111111002'),
  ('77777777-7777-7777-7777-777777777002', 54.0, 'Promising but needs more data access clarity.', 'no_build', 'finalized', now() - interval '1 day', false, null, '11111111-1111-1111-1111-111111111002')
on conflict (idea_id) do update set final_score = excluded.final_score, build_decision = excluded.build_decision;

-- ---------------------------------------------------------------------
-- Project mentor assignment for the built idea.
-- ---------------------------------------------------------------------
insert into project_mentor_assignments (idea_id, mentor_profile_id, published, published_at, assigned_by)
values
  ('77777777-7777-7777-7777-777777777004', '55555555-5555-5555-5555-555555555003', true, now(), '11111111-1111-1111-1111-111111111001')
on conflict (idea_id) do update set mentor_profile_id = excluded.mentor_profile_id;

-- ---------------------------------------------------------------------
-- Showcase projects.
-- ---------------------------------------------------------------------
insert into showcase_projects (idea_id, program_id, image_url, short_description, published, published_at)
values
  ('77777777-7777-7777-7777-777777777004', '66666666-6666-6666-6666-666666666001', null,
   'A copilot that blends historical and market signal forecasting for regional planners.', true, now())
on conflict (idea_id) do update set short_description = excluded.short_description, published = excluded.published;

-- ---------------------------------------------------------------------
-- Voting periods: one closed with published results, one currently open.
-- ---------------------------------------------------------------------
insert into voting_periods (id, program_id, opens_at, closes_at, results_published, results_published_at, show_percentages)
values
  ('99999999-9999-9999-9999-999999999001', '66666666-6666-6666-6666-666666666001', now() - interval '30 days', now() - interval '25 days', true, now() - interval '24 days', true),
  ('99999999-9999-9999-9999-999999999002', '66666666-6666-6666-6666-666666666001', now() - interval '1 hour', now() + interval '7 days', false, null, true)
on conflict (id) do update set results_published = excluded.results_published;

insert into votes (voting_period_id, voter_id, idea_id)
values
  ('99999999-9999-9999-9999-999999999001', '44444444-4444-4444-4444-444444444001', '77777777-7777-7777-7777-777777777004'),
  ('99999999-9999-9999-9999-999999999001', '44444444-4444-4444-4444-444444444002', '77777777-7777-7777-7777-777777777004'),
  ('99999999-9999-9999-9999-999999999001', '44444444-4444-4444-4444-444444444003', '77777777-7777-7777-7777-777777777002')
on conflict (voting_period_id, voter_id) do nothing;

-- ---------------------------------------------------------------------
-- Notifications + a sample audit record.
-- ---------------------------------------------------------------------
insert into notifications (user_id, type, title, body, link, read)
values
  ('33333333-3333-3333-3333-333333333003', 'routing_required', 'Routing required', 'Your idea needs manual reviewer assignment.', '/my-ideas', false),
  ('11111111-1111-1111-1111-111111111001', 'routing_required', 'Routing required', 'An idea needs manual reviewer assignment.', '/review-assignment', false)
on conflict do nothing;

insert into audit_logs (program_id, entity_type, entity_id, actor_id, action, new_value)
values
  ('66666666-6666-6666-6666-666666666001', 'idea', '77777777-7777-7777-7777-777777777004', '11111111-1111-1111-1111-111111111002', 'qualifier_finalized', '{"build_decision": "build"}')
on conflict do nothing;
