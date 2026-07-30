import { describe, expect, it } from 'vitest';
import type { Circuit } from '@makerlord/circuit';
import type { Fault, Symptom } from '@makerlord/project';
import { applyFault, generateCandidates } from '../src/faults.js';

/**
 * A fault IS a deterministic mutation of the circuit model (spec §3) —
 * apply it and the whole existing engine computes what that fault would
 * look like on a meter. Pure: the input circuit is never touched.
 */

function fixture(): Circuit {
  return {
    boardId: 'half',
    parts: [
      { ref: 'BAT1', defId: 'battery' },
      { ref: 'R1', defId: 'resistor' },
      { ref: 'LED1', defId: 'led' },
    ],
    wires: [],
    intent: [
      { name: 'vcc', members: [{ ref: 'BAT1', pin: '+' }, { ref: 'R1', pin: 'Pin 0' }] },
      { name: 'mid', members: [{ ref: 'R1', pin: 'Pin 1' }, { ref: 'LED1', pin: 'anode' }] },
      { name: 'gnd', members: [{ ref: 'LED1', pin: 'cathode' }, { ref: 'BAT1', pin: '-' }] },
    ],
  };
}

describe('applyFault — pure circuit mutations', () => {
  it('no_fault returns an identical circuit', () => {
    expect(applyFault(fixture(), { kind: 'no_fault' }).circuit).toEqual(fixture());
  });

  it('open_joint removes one member from the named net', () => {
    const { circuit } = applyFault(fixture(),
      { kind: 'open_joint', net: 'mid', member: 'LED1.anode' });
    const mid = circuit.intent.find((n) => n.name === 'mid')!;
    expect(mid.members).toEqual([{ ref: 'R1', pin: 'Pin 1' }]);
  });

  it('bridge merges two nets under the first name', () => {
    const { circuit } = applyFault(fixture(), { kind: 'bridge', netA: 'mid', netB: 'gnd' });
    const names = circuit.intent.map((n) => n.name);
    expect(names).toContain('mid');
    expect(names).not.toContain('gnd');
    const mid = circuit.intent.find((n) => n.name === 'mid')!;
    expect(mid.members).toHaveLength(4);
  });

  it('reversed_part swaps the pins of a polarized part across its nets', () => {
    const { circuit } = applyFault(fixture(), { kind: 'reversed_part', ref: 'LED1' });
    const mid = circuit.intent.find((n) => n.name === 'mid')!;
    const gnd = circuit.intent.find((n) => n.name === 'gnd')!;
    expect(mid.members).toContainEqual({ ref: 'LED1', pin: 'cathode' });
    expect(gnd.members).toContainEqual({ ref: 'LED1', pin: 'anode' });
  });

  it('wrong_value rides along as a profile override, circuit unchanged', () => {
    const { circuit, overrides } = applyFault(fixture(),
      { kind: 'wrong_value', ref: 'R1', factor: 10 });
    expect(circuit).toEqual(fixture());
    expect(overrides).toEqual({ resistanceFactor: { R1: 10 } });
  });

  it('dead_rail rides along as a stimulus override', () => {
    const { overrides } = applyFault(fixture(), { kind: 'dead_rail' });
    expect(overrides).toEqual({ supplyVolts: 0 });
  });

  it('never mutates the input', () => {
    const original = fixture();
    const frozen = JSON.stringify(original);
    applyFault(original, { kind: 'bridge', netA: 'vcc', netB: 'gnd' });
    applyFault(original, { kind: 'reversed_part', ref: 'LED1' });
    expect(JSON.stringify(original)).toBe(frozen);
  });
});

describe('generateCandidates — symptom-directed, generous, always with no-fault', () => {
  const polarized = new Set(['LED1', 'BAT1']);

  it('element_dead covers every fault touching the element plus dead_rail', () => {
    const symptom: Symptom = { kind: 'element_dead', ref: 'LED1' };
    const faults = generateCandidates(fixture(), symptom, polarized);
    const kinds = faults.map((f) => f.kind);
    expect(kinds).toContain('no_fault');
    expect(kinds).toContain('dead_rail');
    expect(faults).toContainEqual({ kind: 'reversed_part', ref: 'LED1' });
    // open joints on LED1's own nets — and generously, the second-degree
    // vcc joint too (an open feed at the resistor kills the LED just as dead)
    const openNets = faults.filter((f) => f.kind === 'open_joint').map((f) =>
      (f as { net: string }).net).sort();
    expect(openNets).toEqual(expect.arrayContaining(['gnd', 'mid', 'vcc']));
    // the series resistor's value is suspect too
    expect(faults).toContainEqual({ kind: 'wrong_value', ref: 'R1', factor: 10 });
  });

  it('board_dead is rail-focused', () => {
    const faults = generateCandidates(fixture(), { kind: 'board_dead' }, polarized);
    const kinds = new Set(faults.map((f) => f.kind));
    expect(kinds.has('dead_rail')).toBe(true);
    expect(kinds.has('no_fault')).toBe(true);
    expect(faults.some((f) => f.kind === 'open_joint'
      && ((f as { net: string }).net === 'vcc' || (f as { net: string }).net === 'gnd'))).toBe(true);
  });

  it('a reversed candidate only exists for polarized parts', () => {
    const faults = generateCandidates(fixture(),
      { kind: 'element_dead', ref: 'R1' }, polarized);
    expect(faults.filter((f: Fault) => f.kind === 'reversed_part'
      && (f as { ref: string }).ref === 'R1')).toEqual([]);
  });

  it('candidate ids are stable and unique', () => {
    const symptom: Symptom = { kind: 'element_dead', ref: 'LED1' };
    const a = generateCandidates(fixture(), symptom, polarized);
    const b = generateCandidates(fixture(), symptom, polarized);
    expect(a).toEqual(b);
  });
});
