import { describe, expect, it } from 'vitest';
import { mentorNextStep, participantIdeaStatusKey, participantNextStep, type ParticipantNextStepInput } from '@/lib/overview/next-step';
import { humanizeAuditAction } from '@/lib/audit/labels';

const base: ParticipantNextStepInput = {
  conflictCount: 0,
  ideas: [],
  submissionOpen: true,
  submissionCloseLabel: '10 October',
  votingOpen: false,
  votingCloseLabel: null,
};

describe('participantNextStep', () => {
  it('puts a commit conflict first, without repeating the commit panel heading', () => {
    const step = participantNextStep({ ...base, conflictCount: 2, ideas: [{ status: 'submitted', screening: 'pass_to_qualifier', qualifier: null }] });
    expect(step.title).toBe('Pick the one idea you will continue with');
    expect(step.title).not.toBe('Choose the idea you will commit to');
  });

  it('asks a new participant to submit before the close date', () => {
    const step = participantNextStep(base);
    expect(step.title).toBe('Submit your idea by 10 October');
    expect(step.action).toEqual({ label: 'Submit New Idea', href: '/submit' });
  });

  it('flags unsubmitted drafts', () => {
    const step = participantNextStep({ ...base, ideas: [{ status: 'draft', screening: null, qualifier: null }] });
    expect(step.body).toContain('a draft that has not been submitted');
  });

  it('links straight back into a single draft the participant created', () => {
    const draft = { status: 'draft' as const, screening: null, qualifier: null, id: 'd1', editable: true };
    expect(participantNextStep({ ...base, ideas: [draft] }).action).toEqual({ label: 'Continue draft', href: '/submit?draft=d1' });
    expect(participantNextStep({ ...base, ideas: [draft, { ...draft, id: 'd2' }] }).action).toEqual({
      label: 'View My Ideas',
      href: '/my-ideas',
    });
    // A draft someone else created can't be continued by this participant.
    expect(participantNextStep({ ...base, ideas: [{ ...draft, editable: false }] }).action?.href).toBe('/submit');
  });

  it('only offers voting while voting is open', () => {
    const submitted = { status: 'submitted' as const, screening: null, qualifier: null };
    expect(participantNextStep({ ...base, submissionOpen: false, ideas: [submitted] }).action?.href).not.toBe('/voting');
    expect(participantNextStep({ ...base, submissionOpen: false, votingOpen: true, ideas: [submitted] }).action?.href).toBe('/voting');
  });

  it('reports the most advanced published outcome', () => {
    const step = participantNextStep({
      ...base,
      submissionOpen: false,
      ideas: [
        { status: 'submitted', screening: null, qualifier: null },
        { status: 'submitted', screening: 'pass_to_qualifier', qualifier: 'build' },
      ],
    });
    expect(step.title).toBe('Your idea was selected to build');
  });

  it('maps idea results to status keys', () => {
    expect(participantIdeaStatusKey({ status: 'draft', screening: null, qualifier: null })).toBe('draft');
    expect(participantIdeaStatusKey({ status: 'submitted', screening: null, qualifier: null })).toBe('waiting_for_review');
    expect(participantIdeaStatusKey({ status: 'submitted', screening: 'not_pass', qualifier: null })).toBe('screened_fail');
    expect(participantIdeaStatusKey({ status: 'submitted', screening: 'pass_to_qualifier', qualifier: 'no_build' })).toBe('qualified_no_build');
  });
});

describe('mentorNextStep', () => {
  it('links straight to the first review to finish', () => {
    const step = mentorNextStep({
      hasMentorProfile: true,
      totalAssigned: 3,
      toDo: [{ assignment_id: 'a1', idea_title: 'Route planning', review_status: 'not_started' }],
    });
    expect(step.title).toBe('You have 1 review to finish');
    expect(step.action).toEqual({ label: 'Start review: Route planning', href: '/reviews/a1' });
  });

  it('says when everything is done', () => {
    expect(mentorNextStep({ hasMentorProfile: true, totalAssigned: 4, toDo: [] }).title).toBe('All your reviews are done');
  });

  it('explains a missing mentor profile', () => {
    expect(mentorNextStep({ hasMentorProfile: false, totalAssigned: 0, toDo: [] }).title).toMatch(/mentor profile/);
  });
});

describe('humanizeAuditAction', () => {
  it('never shows raw snake_case keys', () => {
    expect(humanizeAuditAction('team_leader_assigned', 'idea')).toBe('Team leader assigned (idea)');
    expect(humanizeAuditAction('user_created', 'users')).toBe('User created');
    expect(humanizeAuditAction('review_reopened', null)).toBe('Review reopened');
  });
});
