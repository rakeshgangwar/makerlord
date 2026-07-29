import { describe, expect, it } from 'vitest';
import type { SafetyProfile } from '@makerlord/parts';
import { flybackRule } from '../src/rules/flyback.js';
import { def, fixtureContext, net } from './fixtures.js';

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
const DIODE = def('fly', 'diode', [
  { id: 'c0', name: 'anode', role: 'passive' },
  { id: 'c1', name: 'cathode', role: 'passive' },
]);
const DIODE_PROFILE: SafetyProfile = {
  partId: 'fly',
  footprint: { pins: { anode: [0, 0], cathode: [4, 0] } },
  polarity: 'polarized',
  hazardClass: 'none',
};
const SERVO = def('servo', 'servo', [
  { id: 'c0', name: 'vcc', role: 'supply' },
  { id: 'c1', name: 'gnd', role: 'gnd' },
  { id: 'c2', name: 'signal', role: 'io' },
]);
const SERVO_PROFILE: SafetyProfile = {
  partId: 'servo',
  footprint: { pins: { vcc: [0, 0], gnd: [1, 0], signal: [2, 0] } },
  maxCurrentMa: 800,
  hazardClass: 'inductive',
};

const DEFS: [string, ReturnType<typeof def>][] = [
  ['motor', MOTOR], ['fly', DIODE], ['servo', SERVO],
];
const PROFILES: [string, SafetyProfile][] = [
  ['motor', MOTOR_PROFILE], ['fly', DIODE_PROFILE], ['servo', SERVO_PROFILE],
];

describe('RULE_FLYBACK_MISSING — the collapsing field kills the driver', () => {
  it('a bare motor winding with no diode is a BLOCKER', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'M1', defId: 'motor' }],
      nets: [
        net('a', [{ ref: 'M1', pin: 'pin 1' }]),
        net('b', [{ ref: 'M1', pin: 'pin 2' }]),
      ],
      defs: DEFS, profiles: PROFILES,
    });
    const findings = flybackRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('BLOCKER');
    expect(findings[0]!.suggestedFix).toMatch(/1N4001/);
  });

  it('a diode bridging both winding nets clears it', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'M1', defId: 'motor' }, { ref: 'D1', defId: 'fly' }],
      nets: [
        net('a', [{ ref: 'M1', pin: 'pin 1' }, { ref: 'D1', pin: 'cathode' }]),
        net('b', [{ ref: 'M1', pin: 'pin 2' }, { ref: 'D1', pin: 'anode' }]),
      ],
      defs: DEFS, profiles: PROFILES,
    });
    expect(flybackRule.check(ctx)).toHaveLength(0);
  });

  it('a fully-wired servo (three nets, driver on board) is not flagged', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'S1', defId: 'servo' }],
      nets: [
        net('v', [{ ref: 'S1', pin: 'vcc' }]),
        net('g', [{ ref: 'S1', pin: 'gnd' }]),
        net('s', [{ ref: 'S1', pin: 'signal' }]),
      ],
      defs: DEFS, profiles: PROFILES,
    });
    expect(flybackRule.check(ctx)).toHaveLength(0);
  });
});
