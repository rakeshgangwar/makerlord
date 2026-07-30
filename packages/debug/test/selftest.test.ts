import { describe, expect, it } from 'vitest';
import type { FaultCandidate } from '@makerlord/project';
import { applySelftest } from '../src/selftest.js';

/**
 * Spec §6: a structured SELFTEST ok proves exactly one thing — the MCU
 * booted, setup ran, the rail lives. It contradicts dead_rail and
 * NOTHING else: the print happens whether or not the LED's wiring
 * works, and over-claiming here would be the engine lying. Raw prints
 * never reach this function at all.
 */

function cand(id: string, fault: FaultCandidate['fault']): FaultCandidate {
  return { id, fault, status: 'live', signature: { netVoltages: {}, provenance: 'computed' } };
}

describe('applySelftest', () => {
  const candidates = [
    cand('dead-rail', { kind: 'dead_rail' }),
    cand('open-mid', { kind: 'open_joint', net: 'mid' }),
    cand('no-fault', { kind: 'no_fault' }),
  ];

  it('ok contradicts dead_rail only, citing the observation', () => {
    const next = applySelftest(candidates,
      { id: 'st-1', kind: 'selftest', role: 'STATUS_LED', ok: true });
    expect(next.find((c) => c.id === 'dead-rail')!.status).toBe('contradicted');
    expect(next.find((c) => c.id === 'dead-rail')!.contradictedBy).toBe('st-1');
    expect(next.find((c) => c.id === 'open-mid')!.status).toBe('live');
    expect(next.find((c) => c.id === 'no-fault')!.status).toBe('live');
  });

  it('fail is recorded evidence but prunes nothing on its own', () => {
    const next = applySelftest(candidates,
      { id: 'st-2', kind: 'selftest', role: 'STATUS_LED', ok: false });
    expect(next.every((c) => c.status === 'live')).toBe(true);
  });

  it('already-dead candidates keep their original killer', () => {
    const dead = candidates.map((c) =>
      c.id === 'dead-rail'
        ? { ...c, status: 'contradicted' as const, contradictedBy: 'obs-0' }
        : c);
    const next = applySelftest(dead,
      { id: 'st-3', kind: 'selftest', role: 'X', ok: true });
    expect(next.find((c) => c.id === 'dead-rail')!.contradictedBy).toBe('obs-0');
  });
});
