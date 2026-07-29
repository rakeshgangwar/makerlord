import { describe, expect, it } from 'vitest';
import type { SafetyProfile } from '@makerlord/parts';
import {
  BREADBOARD_MAX_A,
  breadboardCurrentRule,
  resistorDissipationRule,
} from '../src/rules/dissipation.js';
import { ALL_RULES } from '../src/rules/index.js';
import { fixtureContext, net, LED_PROFILE, RESISTOR_PROFILE, UNO_PROFILE } from './fixtures.js';

const parts = [
  { ref: 'U1', defId: 'uno' },
  { ref: 'R1', defId: 'res' },
  { ref: 'LED1', defId: 'led' },
];

function withResistor(ohms: number, ratingW: number) {
  const profile: SafetyProfile = {
    ...RESISTOR_PROFILE,
    resistanceOhms: ohms,
    powerRatingW: ratingW,
  };
  return fixtureContext({
    parts,
    profiles: [
      ['uno', UNO_PROFILE],
      ['led', LED_PROFILE],
      ['res', profile],
    ],
    nets: [
      net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'R1', pin: '0' }]),
      net('mid', [{ ref: 'R1', pin: '1' }, { ref: 'LED1', pin: 'anode' }]),
      net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
    ],
  });
}

describe('resistorDissipationRule', () => {
  it('stays quiet for a 220 Ohm quarter-watt in a normal LED branch', () => {
    // I = (5-2)/220 = 13.6 mA; P = I^2 R = 0.041 W, well under 0.25 W
    expect(resistorDissipationRule.check(withResistor(220, 0.25))).toEqual([]);
  });

  it('fires when dissipation exceeds the rating', () => {
    // I = (5-2)/10 = 300 mA; P = 0.3^2 * 10 = 0.9 W, over 0.25 W
    const f = resistorDissipationRule.check(withResistor(10, 0.25));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('RULE_RESISTOR_DISSIPATION');
    expect(f[0]!.severity).toBe('WARNING');
  });

  it('reports both the dissipation and the rating', () => {
    const m = resistorDissipationRule.check(withResistor(10, 0.25))[0]!.message;
    expect(m).toMatch(/0\.9|0\.90/);
    expect(m).toMatch(/0\.25/);
  });

  it('stays quiet for a resistor with no declared rating', () => {
    const noRating: SafetyProfile = { ...RESISTOR_PROFILE, resistanceOhms: 10 };
    delete (noRating as { powerRatingW?: number }).powerRatingW;
    const ctx = fixtureContext({
      parts,
      profiles: [
        ['uno', UNO_PROFILE],
        ['led', LED_PROFILE],
        ['res', noRating],
      ],
      nets: [
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'R1', pin: '0' }]),
        net('mid', [{ ref: 'R1', pin: '1' }, { ref: 'LED1', pin: 'anode' }]),
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    expect(resistorDissipationRule.check(ctx)).toEqual([]);
  });
});

describe('breadboardCurrentRule', () => {
  it('stays quiet for a milliamp-scale circuit', () => {
    expect(breadboardCurrentRule.check(withResistor(220, 0.25))).toEqual([]);
  });

  it('fires when total draw passes the rail rating', () => {
    // 1 Ohm gives 3 A, well over 1.5 A
    const f = breadboardCurrentRule.check(withResistor(1, 100));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('RULE_BREADBOARD_CURRENT');
    expect(f[0]!.severity).toBe('WARNING');
  });

  it('states the rail limit it is using', () => {
    const m = breadboardCurrentRule.check(withResistor(1, 100))[0]!.message;
    expect(m).toMatch(new RegExp(String(BREADBOARD_MAX_A)));
  });
});

describe('ALL_RULES', () => {
  it('now registers eleven rules', () => {
    expect(ALL_RULES).toHaveLength(11);
    expect(ALL_RULES.map((r) => r.id)).toContain('RULE_RESISTOR_DISSIPATION');
    expect(ALL_RULES.map((r) => r.id)).toContain('RULE_BREADBOARD_CURRENT');
  });
});
