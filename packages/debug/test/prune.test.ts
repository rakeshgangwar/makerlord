import { describe, expect, it } from 'vitest';
import type { FaultCandidate, Observation } from '@makerlord/project';
import { applyObservation, contradicts, verdictOf } from '../src/prune.js';

/**
 * Pruning is the ONLY way a candidate dies (spec §2/§8 — no manual
 * conviction exists). The tolerance band absorbs meter class and model
 * error; conviction requires every rival contradicted.
 */

function cand(id: string, volts: Record<string, number>): FaultCandidate {
  return {
    id, fault: { kind: 'no_fault' }, status: 'live',
    signature: { netVoltages: volts, provenance: 'computed' },
  };
}

const volts = (net: string, value: number): Observation =>
  ({ id: `obs-${net}-${value}`, kind: 'voltage', net, value, unit: 'V' });

describe('contradicts — the band: max(10%, 0.2V)', () => {
  it('within band survives; outside dies', () => {
    expect(contradicts(5.0, 4.8)).toBe(false);    // 0.2 exactly on band
    expect(contradicts(5.0, 4.4)).toBe(true);     // 0.6 > 0.5 (10%)
    expect(contradicts(0.0, 0.15)).toBe(false);   // absolute floor covers ~0V
    expect(contradicts(0.0, 0.3)).toBe(true);
  });
});

describe('applyObservation', () => {
  const candidates = [
    cand('a', { n1: 5.0, n2: 2.0 }),
    cand('b', { n1: 0.0, n2: 2.0 }),
    cand('c', { n1: 5.0, n2: 0.0 }),
  ];

  it('contradicted candidates carry the killing observation id', () => {
    const obs = volts('n1', 4.9);
    const next = applyObservation(candidates, obs);
    expect(next.find((x) => x.id === 'b')!.status).toBe('contradicted');
    expect(next.find((x) => x.id === 'b')!.contradictedBy).toBe(obs.id);
    expect(next.find((x) => x.id === 'a')!.status).toBe('live');
    expect(next.find((x) => x.id === 'c')!.status).toBe('live');
  });

  it('a net absent from a signature neither kills nor saves', () => {
    const next = applyObservation([cand('x', { n1: 5 })], volts('unknown', 1));
    expect(next[0]!.status).toBe('live');
  });

  it('already-contradicted candidates stay dead with their original killer', () => {
    const first = applyObservation(candidates, volts('n1', 4.9));
    const second = applyObservation(first, volts('n2', 1.9));
    const b = second.find((x) => x.id === 'b')!;
    expect(b.contradictedBy).toBe('obs-n1-4.9');
    expect(second.find((x) => x.id === 'c')!.status).toBe('contradicted');
  });

  it('non-voltage observations pass through untouched here', () => {
    const next = applyObservation(candidates,
      { id: 'o', kind: 'log', behavior: 'read', value: '42' });
    expect(next.every((c) => c.status === 'live')).toBe(true);
  });
});

describe('verdictOf — conviction needs a last candidate standing', () => {
  it('open while rivals live; localized at exactly one non-no-fault survivor', () => {
    expect(verdictOf([cand('a', {}), cand('b', {})])).toBe('open');
    const one = [
      { ...cand('open-n1', {}), fault: { kind: 'open_joint', net: 'n1' } as const },
      { ...cand('no-fault', {}), status: 'contradicted' as const },
    ];
    expect(verdictOf(one)).toBe('localized');
  });

  it('exonerated when only no-fault survives', () => {
    const survivors = [
      cand('no-fault', {}),
      { ...cand('open-n1', {}), status: 'contradicted' as const },
    ];
    expect(verdictOf(survivors)).toBe('exonerated');
  });

  it('everything contradicted is open — the fault library was too small, say so', () => {
    const all = [
      { ...cand('a', {}), status: 'contradicted' as const },
      { ...cand('no-fault', {}), status: 'contradicted' as const },
    ];
    expect(verdictOf(all)).toBe('open');
  });
});
