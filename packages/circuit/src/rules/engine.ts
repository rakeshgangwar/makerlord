import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Board } from '../board.js';
import type { Circuit, PinRef } from '../model.js';
import type { Divergence } from '../derive/diff.js';
import type { DerivedNet } from '../derive/netlist.js';

export type Severity = 'REFUSE' | 'BLOCKER' | 'WARNING' | 'NOTE';

export interface Affected {
  readonly nets?: readonly string[];
  readonly pins?: readonly PinRef[];
  readonly parts?: readonly string[];
}

/**
 * A rule's verdict. Deliberately has no suppression, override, or dismissal
 * field — the agent can explain a Finding but can never neutralise one.
 */
export interface Finding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly message: string;
  readonly affected: Affected;
  readonly suggestedFix?: string;
}

export interface RuleContext {
  readonly board: Board;
  readonly circuit: Circuit;
  readonly nets: readonly DerivedNet[];
  readonly divergences: readonly Divergence[];
  readonly defs: ReadonlyMap<string, PartDefinition>;
  readonly profiles: ReadonlyMap<string, SafetyProfile>;
}

export interface Rule {
  readonly id: string;
  readonly severity: Severity;
  check(ctx: RuleContext): Finding[];
}

const ORDER: Record<Severity, number> = {
  REFUSE: 0,
  BLOCKER: 1,
  WARNING: 2,
  NOTE: 3,
};

export function runRules(rules: readonly Rule[], ctx: RuleContext): Finding[] {
  return rules
    .flatMap((r) => r.check(ctx))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/** The pre-power-up gate opens only when nothing refuses or blocks. */
export function gateOpens(findings: readonly Finding[]): boolean {
  return !findings.some(
    (f) => f.severity === 'REFUSE' || f.severity === 'BLOCKER',
  );
}
