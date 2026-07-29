import type { Severity } from '@makerlord/circuit';

/**
 * Severity is NEVER carried by colour alone (UI spec §7, §13) — icon, label
 * and colour together. An accessibility requirement everywhere and a safety
 * requirement here.
 */
export interface SeverityPresentation {
  icon: string;
  label: string;
  color: string;
}

const PRESENTATION: Record<Severity, SeverityPresentation> = {
  REFUSE: { icon: '🚫', label: 'REFUSED', color: '#7f1d1d' },
  BLOCKER: { icon: '⛔', label: 'BLOCKER', color: '#b91c1c' },
  WARNING: { icon: '⚠️', label: 'WARNING', color: '#b45309' },
  NOTE: { icon: 'ℹ️', label: 'NOTE', color: '#1d4ed8' },
};

export function presentSeverity(severity: Severity): SeverityPresentation {
  return PRESENTATION[severity];
}

export type ProvenanceBadge =
  | 'verified' | 'computed' | 'sourced' | 'inferred' | 'assumed';

/** Provenance is visible because it bounds severity (spec §7). */
export function ceilingFor(badge: ProvenanceBadge): Severity {
  switch (badge) {
    case 'verified':
    case 'computed':
      return 'BLOCKER';
    case 'sourced':
      return 'WARNING';
    case 'inferred':
    case 'assumed':
      return 'NOTE';
  }
}

const SEVERITY_RANK: Record<Severity, number> = {
  REFUSE: 0, BLOCKER: 1, WARNING: 2, NOTE: 3,
};

/** True when a card's severity is legal under its provenance badge. */
export function badgeConsistent(severity: Severity, badge: ProvenanceBadge): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[ceilingFor(badge)];
}
