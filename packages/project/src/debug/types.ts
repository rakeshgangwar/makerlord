/**
 * The debug facet (debug spec §2). Candidates, signatures, proposals and
 * prunes are ENGINE output; the symptom's free-text detail is the only
 * agent-authored field. There is deliberately no field for a manual
 * verdict — a candidate dies only by contradiction with an observation
 * (the D3/D4 absence pattern).
 */

export interface Symptom {
  kind: 'element_dead' | 'wrong_reading' | 'no_serial' | 'board_dead';
  ref?: string;
  net?: string;
  detail?: string;
}

export type Fault =
  | { kind: 'no_fault' }
  | { kind: 'open_joint'; net: string; member?: string }
  | { kind: 'bridge'; netA: string; netB: string }
  | { kind: 'reversed_part'; ref: string }
  | { kind: 'wrong_value'; ref: string; factor: number }
  | { kind: 'dead_rail' };

export interface FaultSignature {
  /** Per-intent-net predicted DC voltages of the mutated circuit. */
  netVoltages: Record<string, number>;
  /** D43: the weakest model in the signature run bounds confidence. */
  provenance: 'verified' | 'computed' | 'sourced' | 'assumed';
}

export interface FaultCandidate {
  id: string;
  fault: Fault;
  status: 'live' | 'contradicted' | 'convicted';
  signature: FaultSignature;
  /** The observation that killed it — set only by pruning. */
  contradictedBy?: string;
}

export type Observation =
  | { id: string; kind: 'voltage'; net: string; value: number; unit: string }
  | { id: string; kind: 'selftest'; role: string; ok: boolean }
  | { id: string; kind: 'log'; behavior: string; value: string };

export interface DebugSession {
  symptom: Symptom;
  candidates: FaultCandidate[];
  observations: Observation[];
  /** THE next measurement — never carries predictions (D15 structurally). */
  proposed?: { net: string; why: string };
  status: 'open' | 'localized' | 'exonerated' | 'closed';
}
