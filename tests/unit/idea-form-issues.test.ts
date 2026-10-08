import { describe, expect, it } from 'vitest';
import { collectIdeaIssues, ideaFieldId, type IdeaFormValues } from '@/lib/ideas/idea-form-issues';

const LEADER = '11111111-1111-4111-8111-111111111111';
const MENTOR_A = '22222222-2222-4222-8222-222222222222';
const MENTOR_B = '33333333-3333-4333-8333-333333333333';

function valid(): IdeaFormValues {
  return {
    basics: {
      team_name: 'Team Delta',
      idea_title: 'Demand forecast copilot',
      problem_opportunity: 'Planners rebuild the weekly forecast by hand from five spreadsheets.',
      proposed_solution: 'A model drafts the forecast and explains each change for planner review.',
      target_users: 'Demand planners',
    },
    team_leader_id: LEADER,
    team_members: [],
    impacts: [{ impact_kind: 'primary', impact_type: 'time_efficiency', explanation: 'Saves a day per week of planner time.', measurable_result: '1 day/week saved' }],
    support_requests: [],
    mentor_preferences: [
      { priority: 1, mentor_profile_id: MENTOR_A },
      { priority: 2, mentor_profile_id: MENTOR_B },
    ],
  };
}

describe('collectIdeaIssues', () => {
  it('returns no issues for a complete idea', () => {
    expect(collectIdeaIssues(valid())).toEqual([]);
  });

  it('reports every invalid field at once, in page-section order', () => {
    const empty: IdeaFormValues = {
      basics: { team_name: '', idea_title: '', problem_opportunity: '', proposed_solution: '', target_users: '' },
      team_leader_id: undefined,
      team_members: [],
      impacts: [{ impact_kind: 'primary', impact_type: '', explanation: '', measurable_result: '' }],
      support_requests: [],
      mentor_preferences: [],
    };
    const issues = collectIdeaIssues(empty);
    expect(issues.map((i) => i.field)).toEqual([
      'idea_title',
      'problem_opportunity',
      'proposed_solution',
      'target_users',
      'team_name',
      'team_leader',
      'impacts.0.impact_type',
      'impacts.0.explanation',
      'impacts.0.measurable_result',
      'mentor_preferences',
    ]);
    expect(issues.map((i) => i.section)).toEqual([
      'Your idea',
      'Your idea',
      'Your idea',
      'Your idea',
      'Team',
      'Team',
      'Business Impact',
      'Business Impact',
      'Business Impact',
      'Preferred Mentors',
    ]);
  });

  it('gives each issue the DOM id of its control', () => {
    const v = valid();
    v.impacts[0].explanation = 'short';
    const [issue] = collectIdeaIssues(v);
    expect(issue.field).toBe('impacts.0.explanation');
    expect(issue.fieldId).toBe(ideaFieldId('impacts.0.explanation'));
    expect(issue.fieldId).toBe('idea-impacts-0-explanation');
  });

  it('requires two mentor preferences on the submit form', () => {
    const v = valid();
    v.mentor_preferences = [{ priority: 1, mentor_profile_id: MENTOR_A }];
    expect(collectIdeaIssues(v)).toEqual([
      expect.objectContaining({ field: 'mentor_preferences', message: 'Choose a mentor for Priority 1 and for Priority 2' }),
    ]);
  });

  it('rejects the same mentor for both priorities', () => {
    const v = valid();
    v.mentor_preferences = [
      { priority: 1, mentor_profile_id: MENTOR_A },
      { priority: 2, mentor_profile_id: MENTOR_A },
    ];
    expect(collectIdeaIssues(v)).toEqual([
      expect.objectContaining({ field: 'mentor_preferences', message: 'Choose two different mentors for Priority 1 and Priority 2' }),
    ]);
  });
});
