/**
 * Design-audit coverage check. Verifies that the audit is complete and
 * internally consistent; it does NOT (and cannot) judge design quality.
 *
 * Fails when:
 *  - an applicable checklist item has no valid status
 *  - a fail/partial item lacks evidence, or lacks a recommendation or documented reason
 *  - a pass item lacks a validation method
 *  - a not_applicable / unable_to_verify item lacks a reason (notes)
 *  - an item or critical component references a recommendation not in improvement-plan.md
 *  - a recommendation references a finding (F-xx) not in findings.md
 *  - an implemented P0/P1 recommendation has no acceptance criteria
 *  - a P0/P1 recommendation not implemented has no stated reason
 *  - a declared changed critical component has no validation step, or does not exist
 *
 * Usage: npx tsx scripts/validate-design-audit.ts   (exit 1 on any error)
 */
import fs from 'node:fs';
import path from 'node:path';

export const AUDIT_STATUSES = ['pass', 'partial', 'fail', 'not_applicable', 'unable_to_verify'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export interface ChecklistItem {
  id: string;
  source_skill: string;
  category: string;
  rule_or_check: string;
  applicability: 'applicable' | 'not_applicable';
  status?: AuditStatus | string;
  evidence?: string;
  affected_routes?: string[];
  affected_components?: string[];
  recommendation_ids?: string[];
  validation_method?: string;
  notes?: string;
}

export interface CriticalComponent {
  path: string;
  recommendation_ids: string[];
  validation_method: string;
}

export interface AuditManifest {
  items: ChecklistItem[];
  critical_components: CriticalComponent[];
}

export interface PlanRecommendation {
  id: string;
  priority: string | null;
  decision: string | null;
  acceptanceCriteria: string | null;
  findingRefs: string[];
}

const blank = (s: string | undefined | null) => !s || s.trim().length === 0;

/** Parses `### R-xx` blocks out of improvement-plan.md. */
export function parsePlan(markdown: string): Map<string, PlanRecommendation> {
  const recs = new Map<string, PlanRecommendation>();
  const blocks = markdown.split(/^### /m).slice(1);
  for (const block of blocks) {
    const id = block.match(/^(R-\d+)/)?.[1];
    if (!id) continue;
    const field = (name: string) => block.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([^\\n]*)`))?.[1]?.trim() ?? null;
    recs.set(id, {
      id,
      priority: field('Priority / class')?.match(/P[0-3]/)?.[0] ?? null,
      decision: field('Decision'),
      acceptanceCriteria: field('Acceptance criteria'),
      findingRefs: Array.from(new Set(block.match(/F-\d+/g) ?? [])),
    });
  }
  return recs;
}

/** Finding ids defined in findings.md as bold `**F-xx` headings. */
export function parseFindingIds(markdown: string): Set<string> {
  return new Set(Array.from(markdown.matchAll(/^\*\*(F-\d+)\b/gm), (m) => m[1]));
}

export function validateAudit(
  manifest: AuditManifest,
  plan: Map<string, PlanRecommendation>,
  findingIds: Set<string>,
  fileExists: (p: string) => boolean = () => true
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const item of manifest.items) {
    const where = `item ${item.id ?? '(no id)'}`;
    if (blank(item.id)) errors.push(`${where}: missing id`);
    else if (seen.has(item.id)) errors.push(`${where}: duplicate id`);
    seen.add(item.id);

    if (!AUDIT_STATUSES.includes(item.status as AuditStatus)) {
      errors.push(`${where}: missing or invalid status "${item.status ?? ''}"`);
      continue;
    }
    if (item.applicability === 'not_applicable' && item.status !== 'not_applicable') {
      errors.push(`${where}: applicability is not_applicable but status is ${item.status}`);
    }

    switch (item.status) {
      case 'fail':
      case 'partial':
        if (blank(item.evidence)) errors.push(`${where}: ${item.status} without evidence`);
        if ((item.recommendation_ids ?? []).length === 0 && blank(item.notes)) {
          errors.push(`${where}: ${item.status} without a recommendation or documented reason`);
        }
        break;
      case 'pass':
        if (blank(item.validation_method)) errors.push(`${where}: pass without a validation method`);
        break;
      case 'not_applicable':
        if (blank(item.notes)) errors.push(`${where}: not_applicable without a reason`);
        break;
      case 'unable_to_verify':
        if (blank(item.notes)) errors.push(`${where}: unable_to_verify without an explanation`);
        break;
    }

    for (const rid of item.recommendation_ids ?? []) {
      if (!plan.has(rid)) errors.push(`${where}: references unknown recommendation ${rid}`);
    }
  }

  for (const rec of plan.values()) {
    for (const fid of rec.findingRefs) {
      if (!findingIds.has(fid)) errors.push(`${rec.id}: references unknown finding ${fid}`);
    }
    if (rec.priority === 'P0' || rec.priority === 'P1') {
      const implemented = /^Implement/i.test(rec.decision ?? '');
      if (blank(rec.decision)) errors.push(`${rec.id}: ${rec.priority} without a decision`);
      if (implemented && blank(rec.acceptanceCriteria)) {
        errors.push(`${rec.id}: implemented ${rec.priority} without acceptance criteria`);
      }
      if (!implemented && (rec.decision ?? '').length < 40) {
        errors.push(`${rec.id}: ${rec.priority} not implemented without a stated reason`);
      }
    }
  }

  for (const c of manifest.critical_components) {
    const where = `critical component ${c.path}`;
    if (!fileExists(c.path)) errors.push(`${where}: file does not exist`);
    if (blank(c.validation_method)) errors.push(`${where}: no validation step`);
    if ((c.recommendation_ids ?? []).length === 0) errors.push(`${where}: not linked to a recommendation`);
    for (const rid of c.recommendation_ids ?? []) {
      if (!plan.has(rid)) errors.push(`${where}: references unknown recommendation ${rid}`);
    }
  }

  return errors;
}

export function loadAndValidate(root = process.cwd()) {
  const dir = path.join(root, 'design-audit');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'audit-manifest.json'), 'utf8')) as AuditManifest;
  const plan = parsePlan(fs.readFileSync(path.join(dir, 'improvement-plan.md'), 'utf8'));
  const findings = parseFindingIds(fs.readFileSync(path.join(dir, 'findings.md'), 'utf8'));
  const errors = validateAudit(manifest, plan, findings, (p) => fs.existsSync(path.join(root, p)));
  return { manifest, plan, findings, errors };
}

const invokedDirectly =
  typeof __filename !== 'undefined' && !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (invokedDirectly) {
  const { manifest, plan, findings, errors } = loadAndValidate();
  const counts = Object.fromEntries(AUDIT_STATUSES.map((s) => [s, manifest.items.filter((i) => i.status === s).length]));
  console.log(
    `Design audit: ${manifest.items.length} checklist items, ${plan.size} recommendations, ${findings.size} findings, ` +
      `${manifest.critical_components.length} critical components`
  );
  console.log('Status counts:', counts);
  if (errors.length > 0) {
    console.error(`\n${errors.length} coverage error(s):`);
    for (const e of errors) console.error(` - ${e}`);
    process.exit(1);
  }
  console.log('Coverage check passed.');
}
