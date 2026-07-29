import { describe, expect, it } from 'vitest';
import { expectedContinuity, predictDc } from '../src/solve/dc.js';
import { fixtureContext, net } from './fixtures.js';

const parts = [
  { ref: 'U1', defId: 'uno' },
  { ref: 'R1', defId: 'res' },
  { ref: 'LED1', defId: 'led' },
];

describe('predictDc', () => {
  it('reports the rail voltage it found', () => {
    const ctx = fixtureContext({
      parts,
      nets: [net('v', [{ ref: 'U1', pin: '5V' }])],
    });
    expect(predictDc(ctx).railVoltage).toBe(5);
  });

  it('includes the quiescent draw of every part', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'U1', defId: 'uno' }],
      nets: [net('v', [{ ref: 'U1', pin: '5V' }])],
    });
    // UNO_PROFILE declares quiescentMa: 45
    expect(predictDc(ctx).totalCurrentMa).toBeCloseTo(45, 1);
  });

  it('computes an LED branch as (Vrail - Vf) / R', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'R1', pin: '0' }]),
        net('mid', [{ ref: 'R1', pin: '1' }, { ref: 'LED1', pin: 'anode' }]),
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    // (5 - 2) / 220 = 13.6 mA
    const b = predictDc(ctx).branches.find((x) => x.parts.includes('LED1'));
    expect(b?.currentMa).toBeCloseTo(13.6, 1);
  });

  it('adds branch current to the total', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'R1', pin: '0' }]),
        net('mid', [{ ref: 'R1', pin: '1' }, { ref: 'LED1', pin: 'anode' }]),
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    expect(predictDc(ctx).totalCurrentMa).toBeCloseTo(45 + 13.6, 1);
  });

  it('reports no rail voltage when nothing supplies one', () => {
    const ctx = fixtureContext({ parts, nets: [net('s', [{ ref: 'U1', pin: 'D13' }])] });
    expect(predictDc(ctx).railVoltage).toBeUndefined();
  });

  it('skips a resistor branch with no LED', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'R1', defId: 'res' }],
      nets: [net('v', [{ ref: 'R1', pin: '0' }])],
    });
    expect(predictDc(ctx).branches).toEqual([]);
  });
});

describe('expectedContinuity', () => {
  it('reports short for holes on one node', () => {
    const ctx = fixtureContext({
      nets: [{ id: 'n', holes: ['a1', 'b1'], pins: [] }],
    });
    expect(expectedContinuity(ctx, 'a1', 'b1')).toBe('short');
  });

  it('reports open for holes on different nodes', () => {
    const ctx = fixtureContext({
      nets: [
        { id: 'n1', holes: ['a1'], pins: [] },
        { id: 'n2', holes: ['b1'], pins: [] },
      ],
    });
    expect(expectedContinuity(ctx, 'a1', 'b1')).toBe('open');
  });

  it('reports open for a hole on no node at all', () => {
    const ctx = fixtureContext({ nets: [{ id: 'n1', holes: ['a1'], pins: [] }] });
    expect(expectedContinuity(ctx, 'a1', 'zz')).toBe('open');
  });
});
