import type { FaultCandidate, Observation } from '@makerlord/project';

/**
 * Pruning is the ONLY path by which a candidate dies (spec §2): an
 * observation contradicts a prediction, or nothing happens. The band
 * absorbs meter class, contact resistance and model error — D43's
 * approximation lives inside it, never inside a silent judgment call.
 */

/** |measured − predicted| > max(10% · |predicted|, 0.2 V) */
export function contradicts(predicted: number, measured: number): boolean {
  const band = Math.max(0.1 * Math.abs(predicted), 0.2);
  return Math.abs(measured - predicted) > band + 1e-9;
}

export function applyObservation(
  candidates: FaultCandidate[],
  obs: Observation,
): FaultCandidate[] {
  if (obs.kind !== 'voltage') return candidates;
  return candidates.map((c) => {
    if (c.status !== 'live') return c;
    const predicted = c.signature.netVoltages[obs.net];
    if (predicted === undefined) return c;
    if (contradicts(predicted, obs.value)) {
      return { ...c, status: 'contradicted' as const, contradictedBy: obs.id };
    }
    return c;
  });
}

/**
 * The verdict. `localized` needs exactly one live candidate that is a
 * real fault; `exonerated` means only no-fault survived — the circuit is
 * fine and saying so is the feature. Everything contradicted stays
 * `open`: the library was too small, and honesty beats a shrug.
 */
export function verdictOf(
  candidates: FaultCandidate[],
): 'open' | 'localized' | 'exonerated' {
  const live = candidates.filter((c) => c.status !== 'contradicted');
  if (live.length !== 1) return 'open';
  return live[0]!.fault.kind === 'no_fault' ? 'exonerated' : 'localized';
}
