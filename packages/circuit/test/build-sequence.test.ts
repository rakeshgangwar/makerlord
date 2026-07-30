import { describe, expect, it } from 'vitest';
import { buildSequence } from '../src/build-sequence.js';
import { fixtureContext, net } from './fixtures.js';

function ctx() {
  return fixtureContext({
    parts: [
      { ref: 'U1', defId: 'uno', placement: { originHole: 'a1', orientation: 0 } },
      { ref: 'R1', defId: 'res', placement: { originHole: 'c1', orientation: 0 } },
      { ref: 'LED1', defId: 'led', placement: { originHole: 'e1', orientation: 0 } },
    ],
    nets: [
      { id: 'v', holes: ['x1'], pins: [{ ref: 'U1', pin: '5V' }, { ref: 'R1', pin: '0' }] },
      { id: 'g', holes: ['y1'], pins: [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }] },
      { id: 'mid', holes: ['m1'], pins: [{ ref: 'R1', pin: '1' }, { ref: 'LED1', pin: 'anode' }] },
    ],
  });
}

describe('buildSequence', () => {
  it('always starts by disconnecting power', () => {
    expect(buildSequence(ctx())[0]!.kind).toBe('POWER_OFF');
  });

  it('places modules before passives', () => {
    const kinds = buildSequence(ctx()).map((s) => s.kind);
    expect(kinds.indexOf('PLACE_MODULE')).toBeLessThan(kinds.indexOf('PLACE_PASSIVE'));
  });

  it('routes power after signal', () => {
    const kinds = buildSequence(ctx()).map((s) => s.kind);
    expect(kinds.indexOf('ROUTE_SIGNAL')).toBeLessThan(kinds.indexOf('ROUTE_POWER'));
  });

  it('puts the gate immediately before power-on', () => {
    const kinds = buildSequence(ctx()).map((s) => s.kind);
    expect(kinds.indexOf('GATE')).toBe(kinds.indexOf('POWER_ON') - 1);
  });

  it('numbers steps consecutively from zero', () => {
    const steps = buildSequence(ctx());
    expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i));
  });

  it('asks the gate for a measured value, never a yes/no', () => {
    const gate = buildSequence(ctx()).find((s) => s.kind === 'GATE')!;
    expect(gate.measurement?.prompt).toMatch(/what does it read|reading/i);
    expect(gate.measurement?.prompt).not.toMatch(/\bdid you\b|\byes\b/i);
  });

  it('tells the gate what continuity to expect', () => {
    const gate = buildSequence(ctx()).find((s) => s.kind === 'GATE')!;
    expect(gate.measurement?.expected).toMatch(/open/i);
  });

  it('states the predicted current on the power-on step', () => {
    const on = buildSequence(ctx()).find((s) => s.kind === 'POWER_ON')!;
    expect(on.instruction).toMatch(/mA/);
  });

  it('names each part in its placement step', () => {
    const steps = buildSequence(ctx());
    expect(steps.some((s) => s.instruction.includes('U1'))).toBe(true);
    expect(steps.some((s) => s.instruction.includes('LED1'))).toBe(true);
  });

  it('skips placement steps for unplaced parts', () => {
    const c = fixtureContext({ parts: [{ ref: 'U1', defId: 'uno' }], nets: [] });
    expect(buildSequence(c).some((s) => s.kind === 'PLACE_MODULE')).toBe(false);
  });
});

it('ROUTE_SIGNAL names part pins, never a bare net/hole id (2026-07-30 audit)', () => {
  const steps = buildSequence(ctx());
  const routes = steps.filter((s) => s.kind === 'ROUTE_SIGNAL');
  expect(routes.length).toBeGreaterThan(0);
  for (const r of routes) {
    expect(r.instruction).toMatch(/connecting .+\..+ to .+\..+|wire to .+\..+/);
    expect(r.instruction).not.toMatch(/net "/);
  }
});
