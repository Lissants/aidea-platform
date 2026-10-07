import type { ImpactType } from '@/types/database';

export const IMPACT_TYPE_LABEL: Record<ImpactType, string> = {
  revenue_growth: 'Revenue growth',
  time_efficiency: 'Time efficiency',
  cost_optimization: 'Cost Optimization',
  governance_excellence: 'Governance Excellence',
};

export const IMPACT_TYPE_OPTIONS: { value: ImpactType; label: string }[] = (
  Object.keys(IMPACT_TYPE_LABEL) as ImpactType[]
).map((value) => ({ value, label: IMPACT_TYPE_LABEL[value] }));

export function impactTypeLabel(type: string): string {
  return (IMPACT_TYPE_LABEL as Record<string, string>)[type] ?? type.replace(/_/g, ' ');
}
