/**
 * Plain-language wording for audit_logs rows shown outside the audit page.
 * The stored action keys (e.g. "team_leader_assigned") never reach the UI.
 */
const ENTITY_LABEL: Record<string, string> = {
  idea: 'idea',
  ideas: 'idea',
  users: 'user',
  user: 'user',
  review: 'review',
  reviews: 'review',
  program: 'program',
  programs: 'program',
};

function sentenceCase(key: string) {
  const words = key.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function humanizeAuditAction(action: string, entityType: string | null | undefined): string {
  const verb = sentenceCase(action);
  const entity = entityType ? (ENTITY_LABEL[entityType] ?? sentenceCase(entityType).toLowerCase()) : null;
  // Avoid "User created (user)": only add the entity when the action doesn't already name it.
  return entity && !verb.toLowerCase().includes(entity) ? `${verb} (${entity})` : verb;
}
