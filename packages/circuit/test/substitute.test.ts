import { describe, expect, it } from 'vitest';
import type { SafetyProfile } from '@makerlord/parts';
import { checkSubstitution } from '../src/substitute.js';
import { fixtureContext, net, LED_PROFILE, RESISTOR_PROFILE, UNO_PROFILE } from './fixtures.js';

const parts = [
  { ref: 'U1', defId: 'uno' },
  { ref: 'R1', defId: 'res' },
  { ref: 'LED1', defId: 'led' },
];

function litCircuit() {
  return fixtureContext({
    parts,
    nets: [
      net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'R1', pin: '0' }]),
      net('mid', [{ ref: 'R1', pin: '1' }, { ref: 'LED1', pin: 'anode' }]),
      net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
    ],
  });
}

const r330: SafetyProfile = { ...RESISTOR_PROFILE, resistanceOhms: 330 };
const r10: SafetyProfile = { ...RESISTOR_PROFILE, resistanceOhms: 10 };

describe('checkSubstitution', () => {
  it('accepts a 330 Ohm in place of a 220 Ohm', () => {
    expect(checkSubstitution(litCircuit(), 'res', r330).accepted).toBe(true);
  });

  it('reports the current change so the maker sees the trade', () => {
    const v = checkSubstitution(litCircuit(), 'res', r330);
    expect(v.before.branches[0]!.currentMa).toBeCloseTo(13.6, 1);
    expect(v.after.branches[0]!.currentMa).toBeCloseTo(9.1, 1);
  });

  it('introduces no findings for a safe swap', () => {
    expect(checkSubstitution(litCircuit(), 'res', r330).introduced).toEqual([]);
  });

  it('still accepts a 10 Ohm on rule grounds but shows the current spike', () => {
    // No rule covers resistor dissipation yet; the DC delta is the signal.
    const v = checkSubstitution(litCircuit(), 'res', r10);
    expect(v.after.branches[0]!.currentMa).toBeCloseTo(300, 0);
  });

  it('rejects a swap that introduces a blocker', () => {
    // A "resistor" with no resistance is no longer current limiting.
    const notAResistor: SafetyProfile = {
      partId: 'res',
      footprint: RESISTOR_PROFILE.footprint,
      hazardClass: 'none',
    };
    const v = checkSubstitution(litCircuit(), 'res', notAResistor);
    expect(v.accepted).toBe(false);
    expect(v.introduced.map((f) => f.ruleId)).toContain('RULE_LED_NO_CURRENT_LIMIT');
  });

  it('reports findings the swap resolves', () => {
    // Start with no resistance, swap in a real resistor.
    const broken = fixtureContext({
      parts,
      profiles: [
        ['uno', UNO_PROFILE],
        ['led', LED_PROFILE],
        ['res', { partId: 'res', footprint: RESISTOR_PROFILE.footprint, hazardClass: 'none' as const }],
      ],
      nets: [
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'R1', pin: '0' }]),
        net('mid', [{ ref: 'R1', pin: '1' }, { ref: 'LED1', pin: 'anode' }]),
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    const v = checkSubstitution(broken, 'res', RESISTOR_PROFILE);
    expect(v.resolved.map((f) => f.ruleId)).toContain('RULE_LED_NO_CURRENT_LIMIT');
    expect(v.accepted).toBe(true);
  });

  it('leaves the original context untouched', () => {
    const ctx = litCircuit();
    checkSubstitution(ctx, 'res', r330);
    expect(ctx.profiles.get('res')?.resistanceOhms).toBe(220);
  });
});
