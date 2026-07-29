import type { Finding, Severity } from '@makerlord/circuit';

/**
 * D43: a simulation is exactly as good as its device models, and a run's
 * provenance is THE WEAKEST MODEL IN THE LOOP, not the average — because the
 * idealised part is precisely where the error will be.
 */
export type ModelProvenance = 'verified' | 'computed' | 'sourced' | 'assumed';

const RANK: Record<ModelProvenance, number> = {
  verified: 0,
  computed: 1,
  sourced: 2,
  assumed: 3,
};

export function weakest(provenances: ModelProvenance[]): ModelProvenance {
  let worst: ModelProvenance = 'verified';
  for (const p of provenances) {
    if (RANK[p] > RANK[worst]) worst = p;
  }
  return worst;
}

/** The severity a finding from this run may reach — never higher. */
export function severityCeiling(provenance: ModelProvenance): Severity {
  switch (provenance) {
    case 'verified':
    case 'computed':
      return 'BLOCKER';
    case 'sourced':
      return 'WARNING';
    case 'assumed':
      return 'NOTE';
  }
}

const SEVERITY_RANK: Record<Severity, number> = {
  REFUSE: 0, BLOCKER: 1, WARNING: 2, NOTE: 3,
};

/** Cap a finding's severity at the run's ceiling, recording why. */
export function capFinding(finding: Finding, ceiling: Severity): Finding {
  if (SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[ceiling]) return finding;
  return {
    ...finding,
    severity: ceiling,
    message:
      `${finding.message} (severity capped at ${ceiling}: the weakest model ` +
      'in this run is not strong enough to support a harder claim)',
  };
}
