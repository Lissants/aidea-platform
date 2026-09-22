import { describe, expect, it } from 'vitest';
import {
  ideaBasicsSchema,
  ideaTeamSchema,
  ideaImpactsSchema,
  ideaMentorPreferencesSchema,
  reviewSchema,
  reopenReviewSchema,
  screeningDecisionSchema,
  qualifierAssessmentSchema,
  finalPresentationAssessmentSchema,
  voteSchema,
  votingPeriodSchema,
} from '@/lib/validation/schemas';

describe('ideaBasicsSchema', () => {
  it('accepts a well-formed idea', () => {
    const result = ideaBasicsSchema.safeParse({
      idea_title: 'Smart inventory bot',
      team_name: 'Team Alpha',
      problem_opportunity: 'Warehouses run out of stock unexpectedly.',
      proposed_solution: 'Use demand forecasting to flag shortages early.',
      target_users: 'Warehouse managers',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing title', () => {
    const result = ideaBasicsSchema.safeParse({
      idea_title: '',
      team_name: 'Team Alpha',
      problem_opportunity: 'Some problem long enough to pass',
      proposed_solution: 'Some solution long enough to pass',
    });
    expect(result.success).toBe(false);
  });
});

describe('ideaTeamSchema', () => {
  it('accepts up to 10 team members', () => {
    const result = ideaTeamSchema.safeParse({
      team_members: [
        { profile_id: '11111111-1111-1111-1111-111111111111', member_order: 1 },
        { profile_id: '22222222-2222-2222-2222-222222222222', member_order: 2 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 10 team members', () => {
    const team_members = Array.from({ length: 11 }, (_, i) => ({
      profile_id: '11111111-1111-1111-1111-111111111111',
      member_order: i + 1,
    }));
    const result = ideaTeamSchema.safeParse({ team_members });
    expect(result.success).toBe(false);
  });
});

describe('ideaImpactsSchema', () => {
  it('requires at least one impact', () => {
    const result = ideaImpactsSchema.safeParse({ impacts: [] });
    expect(result.success).toBe(false);
  });

  it('accepts one primary impact', () => {
    const result = ideaImpactsSchema.safeParse({
      impacts: [{ impact_kind: 'primary', impact_type: 'time_efficiency', explanation: 'Saves time weekly', measurable_result: '2 hrs/week' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 4 impacts', () => {
    const impacts = Array.from({ length: 5 }, () => ({
      impact_kind: 'secondary' as const,
      impact_type: 'time_efficiency' as const,
      explanation: 'Some explanation text here',
    }));
    const result = ideaImpactsSchema.safeParse({ impacts });
    expect(result.success).toBe(false);
  });
});

describe('ideaMentorPreferencesSchema', () => {
  it('rejects the same priority used twice', () => {
    const result = ideaMentorPreferencesSchema.safeParse({
      mentor_preferences: [
        { priority: 1, mentor_profile_id: '11111111-1111-1111-1111-111111111111' },
        { priority: 1, mentor_profile_id: '22222222-2222-2222-2222-222222222222' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts two distinct priorities', () => {
    const result = ideaMentorPreferencesSchema.safeParse({
      mentor_preferences: [
        { priority: 1, mentor_profile_id: '11111111-1111-1111-1111-111111111111' },
        { priority: 2, mentor_profile_id: '22222222-2222-2222-2222-222222222222' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('reviewSchema', () => {
  it('requires a recommendation', () => {
    const result = reviewSchema.safeParse({
      desirability: true,
      viability: true,
      realistic_implementation: true,
      comment: 'Looks good overall',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a fully-filled review', () => {
    const result = reviewSchema.safeParse({
      desirability: true,
      viability: true,
      realistic_implementation: false,
      recommendation: 'recommend_pass',
      comment: 'Solid idea with clear impact.',
    });
    expect(result.success).toBe(true);
  });
});

describe('reopenReviewSchema', () => {
  it('rejects a too-short reason', () => {
    const result = reopenReviewSchema.safeParse({ reason: 'no' });
    expect(result.success).toBe(false);
  });

  it('accepts a sufficient reason', () => {
    const result = reopenReviewSchema.safeParse({ reason: 'Missing viability justification, please revise.' });
    expect(result.success).toBe(true);
  });
});

describe('screeningDecisionSchema', () => {
  it('accepts a valid decision', () => {
    const result = screeningDecisionSchema.safeParse({ decision: 'pass_to_qualifier' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid decision value', () => {
    const result = screeningDecisionSchema.safeParse({ decision: 'maybe' });
    expect(result.success).toBe(false);
  });
});

describe('qualifierAssessmentSchema', () => {
  it('accepts a valid build decision', () => {
    const result = qualifierAssessmentSchema.safeParse({
      final_score: 85,
      overall_comment: 'Strong desirability and viability signals.',
      build_decision: 'build',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a score above 100', () => {
    const result = qualifierAssessmentSchema.safeParse({
      final_score: 150,
      overall_comment: 'Strong desirability and viability signals.',
      build_decision: 'build',
    });
    expect(result.success).toBe(false);
  });
});

describe('finalPresentationAssessmentSchema', () => {
  it('accepts a grand winner', () => {
    const result = finalPresentationAssessmentSchema.safeParse({
      final_score: 92,
      overall_comment: 'Outstanding final presentation and execution.',
      winner_decision: 'winner',
      winner_category: 'grand_winner',
    });
    expect(result.success).toBe(true);
  });

  it('allows no_winner with no category', () => {
    const result = finalPresentationAssessmentSchema.safeParse({
      final_score: 40,
      overall_comment: 'Did not meet the bar this cycle.',
      winner_decision: 'no_winner',
    });
    expect(result.success).toBe(true);
  });
});

describe('voteSchema', () => {
  it('rejects a non-uuid idea id', () => {
    const result = voteSchema.safeParse({ voting_period_id: '11111111-1111-1111-1111-111111111111', idea_id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('accepts two valid uuids', () => {
    const result = voteSchema.safeParse({
      voting_period_id: '11111111-1111-1111-1111-111111111111',
      idea_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
  });
});

describe('votingPeriodSchema', () => {
  it('rejects closes_at before opens_at', () => {
    const result = votingPeriodSchema.safeParse({
      opens_at: '2026-01-10T00:00:00.000Z',
      closes_at: '2026-01-01T00:00:00.000Z',
      show_percentages: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid window', () => {
    const result = votingPeriodSchema.safeParse({
      opens_at: '2026-01-01T00:00:00.000Z',
      closes_at: '2026-01-10T00:00:00.000Z',
      show_percentages: true,
    });
    expect(result.success).toBe(true);
  });
});
