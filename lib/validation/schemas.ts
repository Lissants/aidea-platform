import { z } from 'zod';

/**
 * Shared Zod schemas for core entities. Later phases import and `.extend()`
 * or `.pick()` these rather than redefining shapes — keep field names in
 * sync with types/database.ts and supabase/migrations.
 */

export const profileSchema = z.object({
  full_name: z.string().min(2, 'Full name is required').max(120),
  job_title: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const MAX_MENTOR_EXPERTISE_CHARS = 600;

/** Admin-edited mentor card (job title lives on profiles, the rest on mentor_profiles). */
export const mentorProfileSchema = z.object({
  job_title: z.string().trim().max(120, 'Title must be 120 characters or fewer').nullable(),
  expertise: z
    .string()
    .trim()
    .max(MAX_MENTOR_EXPERTISE_CHARS, `Expertise must be ${MAX_MENTOR_EXPERTISE_CHARS} characters or fewer`)
    .nullable(),
  // Relative URL from lib/storage/local.ts, so not z.string().url().
  photo_url: z
    .string()
    .regex(/^\/api\/files\/mentor-photos\/[0-9a-f-]+\/[0-9a-f-]+(\.[a-z0-9]{1,8})?$/, 'Invalid photo')
    .nullable(),
});
export type MentorProfileInput = z.infer<typeof mentorProfileSchema>;

// --- Idea submission wizard (multi-step; each step schema composes into
// ideaDraftSchema for final submit validation) --------------------------

export const ideaBasicsSchema = z.object({
  team_name: z.string().min(2, 'Team name is required').max(150),
  idea_title: z.string().min(5, 'Idea title is required').max(200),
  problem_opportunity: z.string().min(20, 'Please describe the problem or opportunity').max(4000),
  proposed_solution: z.string().min(20, 'Please describe the proposed solution').max(4000),
  target_users: z.string().max(2000).optional().nullable(),
});

export const ideaTeamMemberSchema = z.object({
  profile_id: z.string().uuid(),
  member_order: z.number().int().min(1),
});

export const ideaTeamSchema = z.object({
  team_leader_id: z.string().uuid('Team leader is required'),
  team_members: z.array(ideaTeamMemberSchema).max(5, 'A team can have at most 5 members'),
});

export const impactTypeEnum = z.enum([
  'revenue_growth',
  'time_efficiency',
  'cost_efficiency',
  'governance_improvement',
]);

export const ideaImpactSchema = z.object({
  impact_kind: z.enum(['primary', 'secondary']),
  impact_type: impactTypeEnum,
  explanation: z.string().min(10, 'Impact explanation must be at least 10 characters (remove the secondary impact if unused)').max(2000),
  measurable_result: z.string().max(1000).optional().nullable(),
});

export const ideaImpactsSchema = z.object({
  impacts: z.array(ideaImpactSchema).min(1, 'At least one impact is required').max(4),
});

export const ideaSupportRequestSchema = z.object({
  support_area: z.enum(['tools', 'budget', 'data_access']),
  details: z.string().max(2000).optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  estimate: z.string().max(500).optional().nullable(),
});

export const ideaSupportRequestsSchema = z.object({
  support_requests: z.array(ideaSupportRequestSchema).max(5),
});

export const ideaMentorPreferenceSchema = z.object({
  priority: z.union([z.literal(1), z.literal(2)]),
  mentor_profile_id: z.string().uuid(),
});

export const ideaMentorPreferencesSchema = z.object({
  mentor_preferences: z
    .array(ideaMentorPreferenceSchema)
    .max(2)
    .refine((prefs) => new Set(prefs.map((p) => p.priority)).size === prefs.length, {
      message: 'Priority 1 and Priority 2 must be different mentors',
    }),
});

/** Full submit-time schema — combines every wizard step for final validation. */
export const ideaDraftSchema = ideaBasicsSchema
  .merge(ideaTeamSchema)
  .merge(ideaImpactsSchema)
  .merge(ideaSupportRequestsSchema)
  .merge(ideaMentorPreferencesSchema);
export type IdeaDraftInput = z.infer<typeof ideaDraftSchema>;

/**
 * Save-draft schema — same shape as ideaDraftSchema but with no required
 * fields or minimum lengths, so a participant can save partway through the
 * wizard with other sections still empty. Only structural limits (max
 * lengths, enums, ids) are kept; completeness is enforced by ideaDraftSchema
 * and usp_submit_idea at submit time.
 */
export const ideaDraftSaveSchema = z.object({
  team_name: z.string().max(150).optional(),
  idea_title: z.string().max(200).optional(),
  problem_opportunity: z.string().max(4000).optional(),
  proposed_solution: z.string().max(4000).optional(),
  target_users: z.string().max(2000).optional().nullable(),
  team_leader_id: z.string().uuid().optional(),
  team_members: ideaTeamSchema.shape.team_members.optional(),
  impacts: z.array(ideaImpactSchema.extend({ explanation: z.string().max(2000).optional().nullable() })).max(4).optional(),
  support_requests: ideaSupportRequestsSchema.shape.support_requests.optional(),
  mentor_preferences: ideaMentorPreferencesSchema.shape.mentor_preferences.optional(),
});
export type IdeaDraftSaveInput = z.infer<typeof ideaDraftSaveSchema>;

// --- Review ---------------------------------------------------------------

export const reviewSchema = z.object({
  desirability: z.boolean(),
  viability: z.boolean(),
  realistic_implementation: z.boolean(),
  recommendation: z.enum(['recommend_pass', 'recommend_not_pass']),
  comment: z.string().min(10, 'Comment is required').max(4000),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const reopenReviewSchema = z.object({
  reason: z.string().min(10, 'A reason is required to reopen a review').max(1000),
});

// --- Screening --------------------------------------------------------

export const screeningDecisionSchema = z.object({
  decision: z.enum(['pass_to_qualifier', 'not_pass']),
  internal_reason: z.string().max(4000).optional().nullable(),
});
export type ScreeningDecisionInput = z.infer<typeof screeningDecisionSchema>;

// --- Qualifier ----------------------------------------------------------

export const qualifierAssessmentSchema = z.object({
  final_score: z.number().min(0).max(100),
  overall_comment: z.string().min(10, 'Overall comment must be at least 10 characters').max(4000),
  build_decision: z.enum(['build', 'no_build']),
});
export type QualifierAssessmentInput = z.infer<typeof qualifierAssessmentSchema>;

// --- Final presentation ---------------------------------------------------

export const finalPresentationAssessmentSchema = z.object({
  final_score: z.number().min(0).max(100),
  overall_comment: z.string().min(10, 'Overall comment must be at least 10 characters').max(4000),
  winner_decision: z.enum(['winner', 'no_winner']),
  winner_category: z.enum(['grand_winner', 'runner_up']).optional().nullable(),
});
export type FinalPresentationAssessmentInput = z.infer<typeof finalPresentationAssessmentSchema>;

// --- Voting -----------------------------------------------------------

export const voteSchema = z.object({
  voting_period_id: z.string().uuid(),
  idea_id: z.string().uuid(),
});
export type VoteInput = z.infer<typeof voteSchema>;

export const votingPeriodSchema = z
  .object({
    id: z.string().uuid().optional(),
    opens_at: z.string().min(1, 'Opens-at is required'),
    closes_at: z.string().min(1, 'Closes-at is required'),
    show_percentages: z.boolean(),
  })
  .refine((v) => new Date(v.closes_at) > new Date(v.opens_at), {
    message: 'Closes-at must be after opens-at',
    path: ['closes_at'],
  });
export type VotingPeriodInput = z.infer<typeof votingPeriodSchema>;

// --- User management / passwords --------------------------------------

export const MIN_PASSWORD_LENGTH = 12;

export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200);

export const userTierEnum = z.enum(['participant', 'mentor', 'admin', 'developer']);

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(320),
  fullName: z.string().trim().min(2, 'Full name is required').max(200),
  employeeId: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v ? v : null)),
  tier: userTierEnum,
  // Omit to have a temporary password generated.
  tempPassword: newPasswordSchema.optional(),
});
export type CreateUserInput = z.input<typeof createUserSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(200),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'New password must be different from the current one',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
