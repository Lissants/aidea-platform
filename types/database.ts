/**
 * Hand-written TypeScript row types mirroring db/migrations/0001_schema.sql
 * (SQL Server). lib/db normalizes rows so these hold as written: ids are
 * lowercase strings, timestamps ISO strings, BIT columns booleans.
 *
 * Keep the enum string unions in sync with the CHECK constraints
 * (ck_<table>_<column>) in db/migrations/0001_schema.sql.
 */

// ---------------------------------------------------------------------------
// Enums (mirrors CREATE TYPE ... AS ENUM statements in migrations)
// ---------------------------------------------------------------------------

export type RoleName = 'participant' | 'mentor' | 'admin' | 'employee_voter' | 'developer';

export type ProgramStatus = 'draft' | 'active' | 'closed';

export type ProgramStageKey =
  | 'submission'
  | 'review'
  | 'screening'
  | 'qualifier'
  | 'project_mentor'
  | 'final_presentation'
  | 'showcase'
  | 'voting';

export type IdeaStatus = 'draft' | 'submitted';

export type ImpactKind = 'primary' | 'secondary';

export type ImpactType =
  | 'revenue_growth'
  | 'time_efficiency'
  | 'cost_optimization'
  | 'governance_excellence';

export type SupportArea = 'tools' | 'budget' | 'data_access';

export type ReviewAssignmentStatus = 'pending' | 'routing_required' | 'reassigned';

export type ReviewRecommendation = 'recommend_pass' | 'recommend_not_pass';

export type ReviewStatus = 'draft' | 'submitted' | 'reopened';

export type ScreeningDecisionValue = 'pass_to_qualifier' | 'not_pass';

export type BuildDecision = 'build' | 'no_build';

export type QualifierStatus = 'draft' | 'finalized';

export type WinnerDecision = 'winner' | 'no_winner';

export type WinnerCategory = 'grand_winner' | 'runner_up';

export type FinalPresentationStatus = 'draft' | 'finalized';

export type EmailOutboxStatus = 'pending' | 'sent' | 'failed';

// ---------------------------------------------------------------------------
// Row / Insert / Update shapes
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  employee_id: string | null;
  email: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  avatar_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: RoleName;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
}

export interface Program {
  id: string;
  title: string;
  description: string | null;
  submission_open_at: string | null;
  submission_close_at: string | null;
  screening_close_at: string | null;
  qualifier_close_at: string | null;
  final_presentation_close_at: string | null;
  showcase_open_at: string | null;
  voting_open_at: string | null;
  voting_close_at: string | null;
  /** JSON per-stage date masking, see lib/program/timeline.ts. */
  timeline_tba: string | null;
  status: ProgramStatus;
  created_at: string;
  updated_at: string;
}

export interface ProgramStage {
  id: string;
  program_id: string;
  stage_key: ProgramStageKey;
  label: string;
  starts_at: string | null;
  ends_at: string | null;
  status: ProgramStatus;
}

export interface ProgramContent {
  id: string;
  program_id: string;
  key: string;
  title: string | null;
  body: string | null;
  updated_at: string;
}

export interface ProgramResource {
  id: string;
  program_id: string;
  title: string;
  file_url: string;
  file_type: string | null;
  created_at: string;
}

export interface MentorProfile {
  id: string;
  profile_id: string;
  expertise: string | null;
  bio: string | null;
  max_capacity: number;
  photo_url: string | null;
}

export interface Idea {
  id: string;
  program_id: string;
  team_name: string;
  /** null = leader slot vacant (leader committed elsewhere or was removed by an admin). */
  team_leader_id: string | null;
  idea_title: string;
  problem_opportunity: string;
  proposed_solution: string;
  target_users: string | null;
  status: IdeaStatus;
  submitted_at: string | null;
  locked: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  /** Uploaded presentation (Build ideas only) — /api/files/idea-presentations/... */
  presentation_url: string | null;
  presentation_name: string | null;
  presentation_uploaded_at: string | null;
  presentation_uploaded_by: string | null;
}

/** My Ideas row: published-only results; null means N/A (or not yet published). */
export interface MyIdeaRow extends Idea {
  screening: ScreeningDecisionValue | null;
  qualifier: BuildDecision | null;
  mentor_name: string | null;
  /** The viewer's place on this idea; 'creator' = created it but is not on the team. */
  my_role: 'leader' | 'member' | 'creator';
  /** Screening Pass published. */
  approved: boolean;
}

export interface IdeaTeamMember {
  id: string;
  idea_id: string;
  profile_id: string;
  member_order: number;
}

export interface IdeaImpact {
  id: string;
  idea_id: string;
  impact_kind: ImpactKind;
  impact_type: ImpactType;
  explanation: string | null;
  measurable_result: string | null;
}

export interface IdeaSupportRequest {
  id: string;
  idea_id: string;
  support_area: SupportArea;
  details: string | null;
  reason: string | null;
  estimate: string | null;
}

export interface IdeaMentorPreference {
  id: string;
  idea_id: string;
  priority: 1 | 2;
  mentor_profile_id: string;
}

export interface ReviewAssignment {
  id: string;
  idea_id: string;
  mentor_profile_id: string;
  status: ReviewAssignmentStatus;
  assigned_at: string;
  created_by: string | null;
}

export interface Review {
  id: string;
  review_assignment_id: string;
  idea_id: string;
  reviewer_id: string;
  desirability: boolean | null;
  viability: boolean | null;
  business_impact: boolean | null;
  realistic_implementation: boolean | null;
  recommendation: ReviewRecommendation | null;
  comment: string | null;
  status: ReviewStatus;
  submitted_at: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ScreeningDecision {
  id: string;
  idea_id: string;
  decision: ScreeningDecisionValue;
  differs_from_recommendation: boolean;
  internal_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  published: boolean;
  published_at: string | null;
}

export interface QualifierAssessment {
  id: string;
  idea_id: string;
  final_score: number | null;
  overall_comment: string | null;
  build_decision: BuildDecision | null;
  status: QualifierStatus;
  finalized_at: string | null;
  published: boolean;
  published_at: string | null;
  decided_by: string | null;
}

export interface ProjectMentorAssignment {
  id: string;
  idea_id: string;
  mentor_profile_id: string;
  assigned_at: string;
  published: boolean;
  published_at: string | null;
  assigned_by: string | null;
}

export interface FinalPresentationAssessment {
  id: string;
  idea_id: string;
  final_score: number | null;
  overall_comment: string | null;
  winner_decision: WinnerDecision | null;
  winner_category: WinnerCategory | null;
  status: FinalPresentationStatus;
  finalized_at: string | null;
  published: boolean;
  published_at: string | null;
  decided_by: string | null;
}

export interface ShowcaseProject {
  id: string;
  idea_id: string;
  program_id: string;
  image_url: string | null;
  short_description: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
}

export interface VotingPeriod {
  id: string;
  program_id: string;
  opens_at: string;
  closes_at: string;
  results_published: boolean;
  results_published_at: string | null;
  show_percentages: boolean;
}

export interface Vote {
  id: string;
  voting_period_id: string;
  voter_id: string;
  idea_id: string;
  created_at: string;
}

export interface Publication {
  id: string;
  program_id: string;
  entity_type: string;
  entity_id: string;
  published_by: string | null;
  published_at: string;
  notes: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface EmailOutboxRow {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  status: EmailOutboxStatus;
  created_at: string;
  sent_at: string | null;
  error: string | null;
}

export interface AuditLog {
  id: string;
  program_id: string | null;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  action: string;
  prior_value: unknown;
  new_value: unknown;
  reason: string | null;
  correlation_id: string | null;
  created_at: string;
}
