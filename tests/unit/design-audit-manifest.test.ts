import { describe, expect, it } from 'vitest';
import {
  loadAndValidate,
  parsePlan,
  validateAudit,
  type AuditManifest,
  type ChecklistItem,
} from '../../scripts/validate-design-audit';

/**
 * Design-audit coverage. Proves the audit record is complete and internally
 * consistent; it does not (and cannot) prove design quality.
 */
describe('design-audit coverage (repository manifest)', () => {
  it('has no coverage errors', () => {
    const { errors } = loadAndValidate();
    expect(errors).toEqual([]);
  });
});

describe('design-audit validator rules', () => {
  const plan = parsePlan(
    [
      '### R-01 Fix contrast',
      '- **Problem:** F-01',
      '- **Priority / class:** P0, Must fix.',
      '- **Acceptance criteria:** axe reports 0 contrast nodes.',
      '- **Decision:** Implement.',
      '### R-02 Planned thing',
      '- **Problem:** F-02',
      '- **Priority / class:** P1, Should improve.',
      '- **Decision:** Planned.',
    ].join('\n')
  );
  const findings = new Set(['F-01', 'F-02']);
  const item = (over: Partial<ChecklistItem>): ChecklistItem => ({
    id: 'X-1',
    source_skill: 's',
    category: 'c',
    rule_or_check: 'r',
    applicability: 'applicable',
    status: 'pass',
    evidence: 'e',
    recommendation_ids: [],
    validation_method: 'v',
    notes: '',
    ...over,
  });
  const run = (items: ChecklistItem[]) =>
    validateAudit({ items, critical_components: [] } satisfies AuditManifest, plan, findings);

  it('fails an applicable item with no status', () => {
    expect(run([item({ status: undefined })]).join()).toMatch(/missing or invalid status/);
  });
  it('fails a fail/partial item without evidence', () => {
    expect(run([item({ status: 'fail', evidence: '', recommendation_ids: ['R-01'] })]).join()).toMatch(/without evidence/);
  });
  it('fails a fail item without a recommendation or reason', () => {
    expect(run([item({ status: 'partial', recommendation_ids: [], notes: '' })]).join()).toMatch(/without a recommendation/);
  });
  it('fails a pass item without a validation method', () => {
    expect(run([item({ validation_method: '' })]).join()).toMatch(/pass without a validation method/);
  });
  it('fails not_applicable and unable_to_verify items without a reason', () => {
    expect(run([item({ applicability: 'not_applicable', status: 'not_applicable' })]).join()).toMatch(/without a reason/);
    expect(run([item({ status: 'unable_to_verify' })]).join()).toMatch(/without an explanation/);
  });
  it('fails a reference to an unknown recommendation', () => {
    expect(run([item({ status: 'fail', recommendation_ids: ['R-99'] })]).join()).toMatch(/unknown recommendation R-99/);
  });
  it('fails a P1 that is not implemented and gives no reason', () => {
    expect(run([]).join()).toMatch(/R-02: P1 not implemented without a stated reason/);
  });
  it('fails a recommendation that references an unknown finding', () => {
    const errors = validateAudit({ items: [], critical_components: [] }, parsePlan('### R-03 x\n- F-77\n'), findings);
    expect(errors.join()).toMatch(/unknown finding F-77/);
  });
  it('fails a critical component with no validation step', () => {
    const errors = validateAudit(
      { items: [], critical_components: [{ path: 'a.tsx', recommendation_ids: ['R-01'], validation_method: '' }] },
      parsePlan('### R-01 x\n- **Priority / class:** P2\n'),
      findings
    );
    expect(errors.join()).toMatch(/no validation step/);
  });
});
