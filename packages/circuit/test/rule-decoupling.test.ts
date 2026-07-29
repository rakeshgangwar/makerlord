import { describe, expect, it } from 'vitest';
import type { SafetyProfile } from '@makerlord/parts';
import { decouplingRule } from '../src/rules/decoupling.js';
import { def, fixtureContext, net, UNO, UNO_PROFILE } from './fixtures.js';

const CAP = def('cap', 'capacitor', [
  { id: 'c0', name: 'p0', role: 'passive' },
  { id: 'c1', name: 'p1', role: 'passive' },
]);
const CAP_PROFILE: SafetyProfile = {
  partId: 'cap',
  footprint: { pins: { p0: [0, 0], p1: [1, 0] } },
  hazardClass: 'none',
};

const DEFS: [string, ReturnType<typeof def>][] = [['uno', UNO], ['cap', CAP]];
const PROFILES: [string, SafetyProfile][] = [
  ['uno', UNO_PROFILE], ['cap', CAP_PROFILE],
];

describe('RULE_DECOUPLING_MISSING — bursts need a local reservoir', () => {
  it('a computing module with a bare supply net is a WARNING', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'U1', defId: 'uno' }],
      nets: [net('v', [{ ref: 'U1', pin: '5V' }])],
      defs: DEFS, profiles: PROFILES,
    });
    const findings = decouplingRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('WARNING');
    expect(findings[0]!.suggestedFix).toMatch(/100 nF/);
  });

  it('a capacitor on the supply net clears it', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'U1', defId: 'uno' }, { ref: 'C1', defId: 'cap' }],
      nets: [net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'C1', pin: 'p0' }])],
      defs: DEFS, profiles: PROFILES,
    });
    expect(decouplingRule.check(ctx)).toHaveLength(0);
  });

  it('a part with no quiescent draw (a resistor) is never asked to decouple', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'C1', defId: 'cap' }],
      nets: [net('v', [{ ref: 'C1', pin: 'p0' }])],
      defs: DEFS, profiles: PROFILES,
    });
    expect(decouplingRule.check(ctx)).toHaveLength(0);
  });
});
