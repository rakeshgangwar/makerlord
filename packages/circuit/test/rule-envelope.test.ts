import { describe, expect, it } from 'vitest';
import type { SafetyProfile } from '@makerlord/parts';
import { envelopeRule, MAX_SAFE_VOLTAGE } from '../src/rules/envelope.js';
import { ALL_RULES } from '../src/rules/index.js';
import { gateOpens, runRules } from '../src/rules/engine.js';
import { def, fixtureContext, net, UNO, LED, RESISTOR, UNO_PROFILE, LED_PROFILE, RESISTOR_PROFILE } from './fixtures.js';

const MAINS = def('mains', 'psu', [
  { id: 'c0', name: 'L', role: 'supply' },
  { id: 'c1', name: 'N', role: 'gnd' },
]);

const MAINS_PROFILE: SafetyProfile = {
  partId: 'mains',
  footprint: { pins: { L: [0, 0], N: [1, 0] } },
  hazardClass: 'mains',
};

const HV = def('hv', 'psu', [{ id: 'c0', name: '60V', role: 'supply' }]);
const HV_PROFILE: SafetyProfile = {
  partId: 'hv',
  footprint: { pins: { '60V': [0, 0] } },
  hazardClass: 'none',
};

describe('envelopeRule', () => {
  it('refuses a part flagged as mains', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'PS1', defId: 'mains' }],
      defs: [['mains', MAINS]],
      profiles: [['mains', MAINS_PROFILE]],
      nets: [net('l', [{ ref: 'PS1', pin: 'L' }])],
    });
    const f = envelopeRule.check(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('REFUSE');
    expect(f[0]!.ruleId).toBe('RULE_OUT_OF_SAFE_ENVELOPE');
  });

  it('refuses a net above the 48 V ceiling', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'PS1', defId: 'hv' }],
      defs: [['hv', HV]],
      profiles: [['hv', HV_PROFILE]],
      nets: [net('hv', [{ ref: 'PS1', pin: '60V' }])],
    });
    expect(envelopeRule.check(ctx)[0]!.severity).toBe('REFUSE');
  });

  it('allows a 12 V net', () => {
    const TWELVE = def('t12', 'psu', [{ id: 'c0', name: '12V', role: 'supply' }]);
    const ctx = fixtureContext({
      parts: [{ ref: 'PS1', defId: 't12' }],
      defs: [['t12', TWELVE]],
      profiles: [['t12', { partId: 't12', footprint: { pins: { '12V': [0, 0] } }, hazardClass: 'none' }]],
      nets: [net('v', [{ ref: 'PS1', pin: '12V' }])],
    });
    expect(envelopeRule.check(ctx)).toEqual([]);
  });

  it('names the breadboard as the reason, and points at a certified module', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'PS1', defId: 'mains' }],
      defs: [['mains', MAINS]],
      profiles: [['mains', MAINS_PROFILE]],
      nets: [net('l', [{ ref: 'PS1', pin: 'L' }])],
    });
    const f = envelopeRule.check(ctx)[0]!;
    expect(f.message).toMatch(/breadboard/i);
    expect(f.suggestedFix).toMatch(/certified/i);
    // Leads with help, not just a closed door.
    expect(f.suggestedFix).toMatch(/I can help|I would recommend/i);
  });

  it('still refuses on a breadboard even with tier C open', () => {
    // The absolute case: no valve opens mains on a breadboard.
    const ctx = fixtureContext({
      parts: [{ ref: 'PS1', defId: 'mains' }],
      defs: [['mains', MAINS]],
      profiles: [['mains', MAINS_PROFILE]],
      nets: [net('l', [{ ref: 'PS1', pin: 'L' }])],
    });
    const withTier = { ...ctx, circuit: { ...ctx.circuit, mainsTier: 'C' as const } };
    const f = envelopeRule.check(withTier);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('REFUSE');
    expect(f[0]!.message).toMatch(/breadboard/i);
  });

  it('is quiet on an ordinary 5 V circuit', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'U1', defId: 'uno' }],
      nets: [net('v', [{ ref: 'U1', pin: '5V' }])],
    });
    expect(envelopeRule.check(ctx)).toEqual([]);
  });
});

describe('ALL_RULES', () => {
  it('registers every implemented rule', () => {
    expect(ALL_RULES.map((r) => r.id).sort()).toEqual([
      'RULE_LED_NO_CURRENT_LIMIT',
      'RULE_OUT_OF_SAFE_ENVELOPE',
      'RULE_PIN_CURRENT_EXCEEDED',
      'RULE_POLARIZED_PART_REVERSED',
      'RULE_SUPPLY_RAIL_SHORT',
      'RULE_VOLTAGE_DOMAIN_MISMATCH',
    ]);
  });

  it('has no duplicate rule ids', () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the gate shut on a shorted board', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'U1', defId: 'uno' }],
      nets: [net('n', [{ ref: 'U1', pin: 'GND' }, { ref: 'U1', pin: '5V' }])],
    });
    expect(gateOpens(runRules(ALL_RULES, ctx))).toBe(false);
  });

  it('opens the gate on a clean board', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'U1', defId: 'uno' }],
      nets: [net('v', [{ ref: 'U1', pin: '5V' }]), net('g', [{ ref: 'U1', pin: 'GND' }])],
    });
    expect(gateOpens(runRules(ALL_RULES, ctx))).toBe(true);
  });
});
