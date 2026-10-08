import type { StatusKey } from '@/lib/constants/status';

/**
 * "What should I do next?" for each role's overview. Pure functions so the
 * wording and priority order are unit-tested (tests/unit/next-step.test.ts).
 */
export interface NextStep {
  title: string;
  body: string;
  action?: { label: string; href: string };
}

export interface ParticipantIdeaSummary {
  status: 'draft' | 'submitted';
  screening: 'pass_to_qualifier' | 'not_pass' | null;
  qualifier: 'build' | 'no_build' | null;
  id?: string;
  /** True when this user created the draft and so can continue editing it. */
  editable?: boolean;
}

export interface ParticipantNextStepInput {
  conflictCount: number;
  ideas: ParticipantIdeaSummary[];
  submissionOpen: boolean;
  submissionCloseLabel: string | null;
  votingOpen: boolean;
  votingCloseLabel: string | null;
}

/** Most advanced published outcome for one of the participant's ideas. */
export function participantIdeaStatusKey(idea: ParticipantIdeaSummary): StatusKey {
  if (idea.status === 'draft') return 'draft';
  if (idea.qualifier === 'build') return 'qualified_build';
  if (idea.qualifier === 'no_build') return 'qualified_no_build';
  if (idea.screening === 'pass_to_qualifier') return 'screened_pass';
  if (idea.screening === 'not_pass') return 'screened_fail';
  return 'waiting_for_review';
}

function draftAction(drafts: ParticipantIdeaSummary[]): NextStep['action'] {
  const editable = drafts.filter((d) => d.editable && d.id);
  if (editable.length === 1) return { label: 'Continue draft', href: `/submit?draft=${editable[0].id}` };
  if (editable.length > 1) return { label: 'View My Ideas', href: '/my-ideas' };
  return { label: 'Submit New Idea', href: '/submit' };
}

export function participantNextStep(input: ParticipantNextStepInput): NextStep {
  const { conflictCount, ideas, submissionOpen, submissionCloseLabel, votingOpen, votingCloseLabel } = input;
  const submitted = ideas.filter((i) => i.status === 'submitted');
  const drafts = ideas.filter((i) => i.status === 'draft');
  const by = submissionCloseLabel ? ` by ${submissionCloseLabel}` : '';

  if (conflictCount > 0) {
    return {
      title: 'Pick the one idea you will continue with',
      body: `You are on ${conflictCount} ideas that passed screening. Make your choice in the panel below.`,
    };
  }
  if (submitted.length === 0 && drafts.length > 0 && submissionOpen) {
    return {
      title: `Submit your idea${by}`,
      body: `You have ${drafts.length === 1 ? 'a draft' : `${drafts.length} drafts`} that ${drafts.length === 1 ? 'has' : 'have'} not been submitted. Only submitted ideas go to a mentor for review.`,
      action: draftAction(drafts),
    };
  }
  if (submitted.length === 0 && submissionOpen) {
    return {
      title: `Submit your idea${by}`,
      body: 'Describe the problem, your AI solution and its business impact. You can save a draft as you go.',
      action: draftAction(drafts),
    };
  }
  if (votingOpen) {
    return {
      title: votingCloseLabel ? `Voting is open until ${votingCloseLabel}` : 'Voting is open',
      body: 'Vote for the showcased ideas you think deserve to win.',
      action: { label: 'Cast your vote', href: '/voting' },
    };
  }
  if (submitted.length === 0) {
    return {
      title: 'Submissions are closed',
      body: 'You can still follow the program here. You will be notified when voting opens.',
    };
  }

  const keys = submitted.map(participantIdeaStatusKey);
  if (keys.includes('qualified_build')) {
    return {
      title: 'Your idea was selected to build',
      body: 'Your project mentor will be shown in My Ideas once the assignment is published.',
      action: { label: 'View My Ideas', href: '/my-ideas' },
    };
  }
  if (keys.includes('screened_pass')) {
    return {
      title: 'Your idea passed screening',
      body: 'Next, the qualifier panel decides which ideas move on to build. You will be notified of the result.',
      action: { label: 'View My Ideas', href: '/my-ideas' },
    };
  }
  if (keys.includes('waiting_for_review')) {
    return {
      title: 'Your idea is with a mentor for review',
      body: 'Nothing is needed from you now. You will be notified when screening results are published.',
      action: { label: 'View My Ideas', href: '/my-ideas' },
    };
  }
  return {
    title: 'Results for your ideas are published',
    body: 'See each outcome in My Ideas.',
    action: { label: 'View My Ideas', href: '/my-ideas' },
  };
}

export interface MentorNextStepInput {
  hasMentorProfile: boolean;
  totalAssigned: number;
  toDo: { assignment_id: string; idea_title: string; review_status: 'not_started' | 'draft' | 'submitted' | 'reopened' }[];
}

export function mentorNextStep({ hasMentorProfile, totalAssigned, toDo }: MentorNextStepInput): NextStep {
  if (!hasMentorProfile) {
    return {
      title: 'Your mentor profile is not set up yet',
      body: 'Ask a program admin to create it. Ideas routed to you will then appear here.',
    };
  }
  if (toDo.length > 0) {
    const first = toDo[0];
    const verb = first.review_status === 'not_started' ? 'Start review' : 'Continue review';
    return {
      title: `You have ${toDo.length} ${toDo.length === 1 ? 'review' : 'reviews'} to finish`,
      body: toDo.some((r) => r.review_status === 'reopened')
        ? 'An admin reopened at least one review. The reason is shown at the top of that review.'
        : 'Each review asks four questions and a short comment.',
      action: { label: `${verb}: ${first.idea_title}`, href: `/reviews/${first.assignment_id}` },
    };
  }
  if (totalAssigned > 0) {
    return { title: 'All your reviews are done', body: 'New ideas routed to you will appear here.' };
  }
  return {
    title: 'No ideas have been routed to you yet',
    body: 'When an admin routes an idea to you, it appears here and in My Reviews.',
  };
}
