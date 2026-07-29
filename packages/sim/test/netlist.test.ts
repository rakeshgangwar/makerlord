import { describe, expect, it } from 'vitest';

describe('the virtual bench data (pure)', () => {
  it('computeBranchCurrents: resistors direct, series neighbours inherit', async () => {
    const { computeBranchCurrents } = await import('../src/op.js');
    // 9V — R(440Ω) — LED — gnd: one series chain.
    const v = new Map([['vcc', 9], ['mid', 4], ['led_in', 2], ['0', 0]]);
    const currents = computeBranchCurrents(
      [
        { ref: 'R1', kind: 'resistor', ohms: 440, nodes: ['vcc', 'mid'] },
        { ref: 'LED1', kind: 'diode', nodes: ['mid', '0'] },
      ],
      (n) => v.get(n) ?? 0,
    );
    expect(currents.get('R1')).toBeCloseTo((5 / 440) * 1000, 3);
    expect(currents.get('LED1')).toBeCloseTo(currents.get('R1')!, 6);
  });
});
