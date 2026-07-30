import type { FaultCandidate, Observation } from '@makerlord/project';

/**
 * Spec §6: the scaffold's structured SELFTEST is the only device output
 * the engine consumes, and `ok` proves exactly one thing — the MCU
 * booted, setup ran, the rail lives. It contradicts dead_rail and
 * nothing else; the print happens whether or not the load's wiring
 * works, and over-claiming here would be the engine lying. A `fail` is
 * recorded evidence for the agent and the maker, but prunes nothing on
 * its own in slice 1.
 */
export function applySelftest(
  candidates: FaultCandidate[],
  obs: Extract<Observation, { kind: 'selftest' }>,
): FaultCandidate[] {
  if (!obs.ok) return candidates;
  return candidates.map((c) => {
    if (c.status !== 'live' || c.fault.kind !== 'dead_rail') return c;
    return { ...c, status: 'contradicted' as const, contradictedBy: obs.id };
  });
}
