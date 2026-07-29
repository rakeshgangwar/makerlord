export type RequirementCategory =
  | 'power' | 'environment' | 'interface'
  | 'performance' | 'physical' | 'cost';

export type Provenance = 'stated' | 'derived' | 'assumed';

export type Comparator = '>=' | '<=' | '==' | 'range';

export interface Requirement {
  id: string;
  category: RequirementCategory;
  statement: string;
  metric: string;
  comparator: Comparator;
  value: number;
  max?: number;
  unit: string;
  consumedBy: string[];
  provenance: Provenance;
}
