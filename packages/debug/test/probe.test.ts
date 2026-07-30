import { describe, expect, it } from 'vitest';
import type { FaultCandidate } from '@makerlord/project';
import { nextProbe } from '../src/probe.js';

/**
 * The guided binary search (spec §5): propose the net whose measurement
 * maximally splits the live candidates — worst-case surviving set
 * smallest, ties broken by net name, and the proposal NEVER carries
 * predictions (D15 structurally: {net, why} only).
 */

function cand(id: string, volts: Record<string, number>): FaultCandidate {
  return {
    id, fault: { kind: 'no_fault' }, status: 'live',
    signature: { netVoltages: volts, provenance: 'computed' },
  };
}

describe('nextProbe', () => {
  it('picks the net that separates, not the one where everyone agrees', () => {
    const candidates = [
      cand('a', { n1: 5.0, n2: 5.0 }),
      cand('b', { n1: 5.0, n2: 0.0 }),
      cand('c', { n1: 5.0, n2: 2.5 }),
    ];
    const p = nextProbe(candidates)!;
    expect(p.net).toBe('n2');            // n1 predicts 5.0 for all — useless
    expect(p.why).toMatch(/n2/);
    expect(p).not.toHaveProperty('predictions');   // D15: never carried
  });

  it('worst-case split wins over a partial split', () => {
    const candidates = [
      // nA splits {a} | {b, c}: worst case 2 survive.
      // nB splits {a} | {b} | {c}: worst case 1 survives — better.
      cand('a', { nA: 0.0, nB: 0.0 }),
      cand('b', { nA: 5.0, nB: 2.5 }),
      cand('c', { nA: 5.0, nB: 5.0 }),
    ];
    expect(nextProbe(candidates)!.net).toBe('nB');
  });

  it('ties break by net name, deterministically', () => {
    const candidates = [
      cand('a', { z: 0.0, b: 0.0 }),
      cand('x', { z: 5.0, b: 5.0 }),
    ];
    expect(nextProbe(candidates)!.net).toBe('b');
  });

  it('overlapping-band predictions do not count as separated', () => {
    const candidates = [
      cand('a', { n1: 5.0 }),
      cand('b', { n1: 4.9 }),     // within each other's band — inseparable
      cand('c', { n1: 0.0 }),
    ];
    const p = nextProbe(candidates)!;
    // n1 still separates c from {a, b}; the why must not claim a/b split.
    expect(p.net).toBe('n1');
    expect(p.why).toMatch(/c|0\.0/);
  });

  it('no proposal when fewer than two candidates are live', () => {
    expect(nextProbe([cand('only', { n1: 1 })])).toBeNull();
    expect(nextProbe([
      { ...cand('dead', { n1: 1 }), status: 'contradicted' },
      cand('last', { n1: 2 }),
    ])).toBeNull();
  });

  it('the why describes what the reading would separate, in maker language', () => {
    const p = nextProbe([
      { id: 'open-mid', fault: { kind: 'open_joint', net: 'net_U1_5V__LED1_anode' },
        status: 'live', signature: { netVoltages: { mid: 0.0 }, provenance: 'computed' } },
      { id: 'reversed-LED1', fault: { kind: 'reversed_part', ref: 'LED1' },
        status: 'live', signature: { netVoltages: { mid: 4.3 }, provenance: 'computed' } },
    ])!;
    // Both groups named, as descriptions — and no raw net_ ids anywhere.
    expect(p.why).toContain('U1.5V → LED1.anode');
    expect(p.why).toContain('LED1 is in backwards');
    expect(p.why).not.toMatch(/net_/);
  });

  it('big groups are capped at two named members (the audit wall-of-text fix)', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => cand(id, { mid: 0.0 }));
    const lone = cand('z', { mid: 4.0 });
    const p = nextProbe([...many, lone])!;
    expect(p.why).toContain('+ 3 more');
  });
});
