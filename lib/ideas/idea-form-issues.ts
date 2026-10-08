import type { ZodError } from 'zod';
import {
  ideaBasicsSchema,
  ideaImpactsSchema,
  ideaMentorPreferencesRequiredSchema,
  ideaSupportRequestsSchema,
  ideaTeamSchema,
} from '@/lib/validation/schemas';

/** The five sections of the submit form, in page order. */
export const IDEA_FORM_SECTIONS = [
  { id: 'idea-section-basics', label: 'Your idea' },
  { id: 'idea-section-team', label: 'Team' },
  { id: 'idea-section-impact', label: 'Business impact' },
  { id: 'idea-section-support', label: 'Support needed' },
  { id: 'idea-section-mentors', label: 'Preferred mentors' },
] as const;

export interface IdeaFormValues {
  basics: {
    team_name: string;
    idea_title: string;
    problem_opportunity: string;
    proposed_solution: string;
    target_users: string;
  };
  team_leader_id: string | undefined;
  team_members: { profile_id: string; member_order: number }[];
  impacts: { impact_kind: 'primary' | 'secondary'; impact_type: string; explanation: string; measurable_result: string }[];
  support_requests: { support_area: string; details: string; reason: string; estimate: string }[];
  mentor_preferences: { priority: 1 | 2; mentor_profile_id: string }[];
}

export interface IdeaFormIssue {
  /** Stable field key, e.g. "idea_title", "impacts.0.explanation", "mentor_preferences". */
  field: string;
  /** DOM id of the control to focus / describe. */
  fieldId: string;
  section: (typeof IDEA_FORM_SECTIONS)[number]['label'];
  message: string;
}

/** DOM id for a field key: "impacts.0.explanation" -> "idea-impacts-0-explanation". */
export function ideaFieldId(field: string) {
  return `idea-${field.replace(/[._]/g, '-')}`;
}

/** Zod reports a missing value as a bare "Required"; say which field instead. */
const REQUIRED_COPY: Record<string, string> = {
  team_leader: 'Choose a team leader',
  team_name: 'Team name is required',
  idea_title: 'Idea title is required',
};

function push(
  issues: IdeaFormIssue[],
  error: ZodError | undefined,
  section: IdeaFormIssue['section'],
  toField: (path: (string | number)[]) => string
) {
  if (!error) return;
  for (const issue of error.issues) {
    const field = toField(issue.path);
    // One message per field: the first problem is the one to fix first.
    if (issues.some((i) => i.field === field)) continue;
    const message = issue.message === 'Required' ? (REQUIRED_COPY[field] ?? 'This field is required') : issue.message;
    issues.push({ field, fieldId: ideaFieldId(field), section, message });
  }
}

/**
 * Validates every section of the submit form at once and returns one issue
 * per invalid field, in page order. Pure: uses the same zod schemas as the
 * server so the inline errors match what the server would reject.
 */
export function collectIdeaIssues(values: IdeaFormValues): IdeaFormIssue[] {
  const issues: IdeaFormIssue[] = [];

  const basics = ideaBasicsSchema.safeParse(values.basics);
  push(issues, basics.success ? undefined : basics.error, 'Your idea', (p) => String(p[0] ?? 'idea_title'));

  const team = ideaTeamSchema.safeParse({ team_leader_id: values.team_leader_id, team_members: values.team_members });
  push(issues, team.success ? undefined : team.error, 'Team', (p) =>
    p[0] === 'team_leader_id' ? 'team_leader' : 'team_members'
  );

  const impacts = ideaImpactsSchema.safeParse({ impacts: values.impacts });
  push(issues, impacts.success ? undefined : impacts.error, 'Business impact', (p) =>
    p.length >= 3 ? `impacts.${p[1]}.${p[2]}` : 'impacts'
  );

  const support = ideaSupportRequestsSchema.safeParse({ support_requests: values.support_requests });
  push(issues, support.success ? undefined : support.error, 'Support needed', (p) =>
    p.length >= 3 ? `support_requests.${p[1]}.${p[2]}` : 'support_requests'
  );

  const mentors = ideaMentorPreferencesRequiredSchema.safeParse({ mentor_preferences: values.mentor_preferences });
  push(issues, mentors.success ? undefined : mentors.error, 'Preferred mentors', () => 'mentor_preferences');

  // team_name is validated with the basics but is shown in the Team section.
  for (const issue of issues) if (issue.field === 'team_name') issue.section = 'Team';
  const order = (s: IdeaFormIssue['section']) => IDEA_FORM_SECTIONS.findIndex((x) => x.label === s);
  return issues.sort((a, b) => order(a.section) - order(b.section));
}
