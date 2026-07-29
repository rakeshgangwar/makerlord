import { describe, expect, it } from 'vitest';
import type { SafetyProfile } from '@makerlord/parts';
import { sourceCapacityRule } from '../src/rules/source-capacity.js';
import { def, fixtureContext, net } from './fixtures.js';

const BAT = def('bat', 'battery', [
  { id: 'c0', name: '+', role: 'supply' },
  { id: 'c1', name: '-', role: 'gnd' },
]);
const BAT_PROFILE: SafetyProfile = {
  partId: 'bat',
  footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
  polarity: 'polarized',
  maxContinuousMa: 100,
  hazardClass: 'none',
};
const MOTOR = def('motor', 'motor', [
  { id: 'c0', name: 'pin 1', role: 'passive' },
  { id: 'c1', name: 'pin 2', role: 'passive' },
]);
const MOTOR_PROFILE: SafetyProfile = {
  partId: 'motor',
  footprint: { pins: { 'pin 1': [0, 0], 'pin 2': [0, 4] } },
  maxCurrentMa: 800,
  hazardClass: 'inductive',
};
const LED = def('led', 'LED', [
  { id: 'c0', name: 'anode', role: 'passive' },
  { id: 'c1', name: 'cathode', role: 'passive' },
]);
const LED_PROFILE: SafetyProfile = {
  partId: 'led',
  footprint: { pins: { anode: [0, 0], cathode: [1, 0] } },
  forwardVoltageV: 2,
  maxCurrentMa: 20,
  hazardClass: 'none',
};

const DEFS: [string, ReturnType<typeof def>][] = [
  ['bat', BAT], ['motor', MOTOR], ['led', LED],
];
const PROFILES: [string, SafetyProfile][] = [
  ['bat', BAT_PROFILE], ['motor', MOTOR_PROFILE], ['led', LED_PROFILE],
];

describe('RULE_SOURCE_OVER_CAPACITY — the source has a ceiling', () => {
  it('a stall-rated motor on a PP3-class source is a WARNING', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'B1', defId: 'bat' }, { ref: 'M1', defId: 'motor' }],
      nets: [
        net('v', [{ ref: 'B1', pin: '+' }, { ref: 'M1', pin: 'pin 1' }]),
        net('g', [{ ref: 'B1', pin: '-' }, { ref: 'M1', pin: 'pin 2' }]),
      ],
      defs: DEFS, profiles: PROFILES,
    });
    const findings = sourceCapacityRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('WARNING');
    expect(findings[0]!.message).toMatch(/100 mA continuous/);
    expect(findings[0]!.message).toMatch(/800 mA/);
  });

  it('a 20 mA LED load on the same source is fine', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'B1', defId: 'bat' }, { ref: 'L1', defId: 'led' }],
      nets: [
        net('v', [{ ref: 'B1', pin: '+' }, { ref: 'L1', pin: 'anode' }]),
        net('g', [{ ref: 'B1', pin: '-' }, { ref: 'L1', pin: 'cathode' }]),
      ],
      defs: DEFS, profiles: PROFILES,
    });
    expect(sourceCapacityRule.check(ctx)).toHaveLength(0);
  });

  it('a source with no declared ceiling stays silent — no invented limits', () => {
    const quiet: [string, SafetyProfile][] = [
      ['bat', { ...BAT_PROFILE }],
      ['motor', MOTOR_PROFILE], ['led', LED_PROFILE],
    ];
    delete (quiet[0]![1] as { maxContinuousMa?: number }).maxContinuousMa;
    const ctx = fixtureContext({
      parts: [{ ref: 'B1', defId: 'bat' }, { ref: 'M1', defId: 'motor' }],
      nets: [
        net('v', [{ ref: 'B1', pin: '+' }, { ref: 'M1', pin: 'pin 1' }]),
        net('g', [{ ref: 'B1', pin: '-' }, { ref: 'M1', pin: 'pin 2' }]),
      ],
      defs: DEFS, profiles: quiet,
    });
    expect(sourceCapacityRule.check(ctx)).toHaveLength(0);
  });
});
