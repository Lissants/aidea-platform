import type { BuildDecision, ScreeningDecisionValue } from '@/types/database';

/**
 * Published-only screening / qualifier / project-mentor results for an idea,
 * shared by My Ideas (participant) and My Reviews / Idea Dashboard (mentor).
 * A NULL means N/A: no decision yet, or not yet published. Only the outcome
 * is exposed — never internal_reason, scores or comments. Mentor is N/A for
 * Not Build ideas.
 *
 * Aliases are prefixed `pub_` so they don't collide with a caller's own
 * screening_decisions / qualifier_assessments joins.
 */
export interface PublishedResults {
  screening: ScreeningDecisionValue | null;
  qualifier: BuildDecision | null;
  mentor_name: string | null;
}

export const PUBLISHED_RESULTS_SELECT = `
  CASE WHEN pub_sd.published = 1 THEN pub_sd.decision END AS screening,
  CASE WHEN pub_qa.published = 1 THEN pub_qa.build_decision END AS qualifier,
  CASE WHEN pub_pma.published = 1 AND ISNULL(pub_qa.build_decision, '') <> 'no_build' THEN pub_p.full_name END AS mentor_name`;

export function publishedResultsJoins(ideaAlias: string) {
  return `
  LEFT JOIN screening_decisions pub_sd ON pub_sd.idea_id = ${ideaAlias}.id
  LEFT JOIN qualifier_assessments pub_qa ON pub_qa.idea_id = ${ideaAlias}.id
  LEFT JOIN project_mentor_assignments pub_pma ON pub_pma.idea_id = ${ideaAlias}.id
  LEFT JOIN mentor_profiles pub_mp ON pub_mp.id = pub_pma.mentor_profile_id
  LEFT JOIN profiles pub_p ON pub_p.id = pub_mp.profile_id`;
}
