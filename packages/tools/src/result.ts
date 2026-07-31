import type { Finding } from '@makerlord/circuit';

/**
 * Spec §3: three outcomes, not two. Success and refusal are values; genuine
 * breakage throws and is not a ToolResult at all. "You may not do this yet,
 * and here is exactly why" is a successful call.
 */
export type RefusalCode =
  | 'BLOCKERS_UNRESOLVED'
  | 'GATE_NOT_OPEN'
  | 'MEASUREMENT_REQUIRED'
  | 'BLOCK_UNDECIDED'
  | 'MAINS_ON_BREADBOARD'
  | 'TIER_NOT_OPEN'
  | 'STALE_PROJECT'
  | 'EVIDENCE_UNFETCHED'
  | 'STIMULUS_REQUIRED'
  | 'PROFILE_UNVERIFIED'
  | 'TOOL_ERROR'   // the tool itself crashed — the loop reports, never dies
  | 'BOARD_TARGET';   // a placement tool on a freeform circuit (D56)

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; refused: RefusalCode; findings: Finding[]; message: string };

export function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function refuse<T>(
  refused: RefusalCode,
  message: string,
  findings: Finding[] = [],
): ToolResult<T> {
  return { ok: false, refused, findings, message };
}
