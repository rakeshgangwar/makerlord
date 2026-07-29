import { describe, expect, it } from 'vitest';
import { netVoltage, pinNameToVolts, voltageDomainRule } from '../src/rules/voltage.js';
import { def, fixtureContext, net, UNO, LED, RESISTOR, UNO_PROFILE, LED_PROFILE, RESISTOR_PROFILE } from './fixtures.js';
import type { SafetyProfile } from '@makerlord/parts';

const SENSOR = def('sensor', 'sensor', [
  { id: 'c0', name: 'VCC', role: 'supply' },
  { id: 'c1', name: 'GND', role: 'gnd' },
]);

const SENSOR_PROFILE: SafetyProfile = {
  partId: 'sensor',
  footprint: { pins: { VCC: [0, 0], GND: [1, 0] } },
  absMaxVoltageV: 3.6,
  hazardClass: 'none',
};

function ctxWith(nets: ReturnType<typeof net>[]) {
  return fixtureContext({
    parts: [{ ref: 'U1', defId: 'uno' }, { ref: 'S1', defId: 'sensor' }],
    defs: [['uno', UNO], ['led', LED], ['res', RESISTOR], ['sensor', SENSOR]],
    profiles: [
      ['uno', UNO_PROFILE], ['led', LED_PROFILE],
      ['res', RESISTOR_PROFILE], ['sensor', SENSOR_PROFILE],
    ],
    nets,
  });
}

describe('pinNameToVolts', () => {
  it('reads a whole-number rail', () => {
    expect(pinNameToVolts('5V')).toBe(5);
    expect(pinNameToVolts('12V')).toBe(12);
  });

  it('reads the V-as-decimal-point convention', () => {
    expect(pinNameToVolts('3V3')).toBeCloseTo(3.3);
  });

  it('is case insensitive', () => {
    expect(pinNameToVolts('5v')).toBe(5);
  });

  it('returns undefined for a non-rail name', () => {
    expect(pinNameToVolts('D13')).toBeUndefined();
    expect(pinNameToVolts('GND')).toBeUndefined();
  });
});

describe('netVoltage', () => {
  it('reads the rail voltage from a supply pin', () => {
    const c = ctxWith([net('v', [{ ref: 'U1', pin: '5V' }])]);
    expect(netVoltage(c, c.nets[0]!)).toBe(5);
  });

  it('takes the highest when several rails meet', () => {
    const c = ctxWith([net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'U1', pin: '3V3' }])]);
    expect(netVoltage(c, c.nets[0]!)).toBe(5);
  });

  it('returns undefined for a signal net', () => {
    const c = ctxWith([net('s', [{ ref: 'U1', pin: 'D13' }])]);
    expect(netVoltage(c, c.nets[0]!)).toBeUndefined();
  });
});

describe('voltageDomainRule', () => {
  it('fires when 5 V reaches a 3.6 V part', () => {
    const c = ctxWith([net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'S1', pin: 'VCC' }])]);
    const f = voltageDomainRule.check(c);
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('RULE_VOLTAGE_DOMAIN_MISMATCH');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('stays quiet on the 3V3 rail', () => {
    const c = ctxWith([net('v', [{ ref: 'U1', pin: '3V3' }, { ref: 'S1', pin: 'VCC' }])]);
    expect(voltageDomainRule.check(c)).toEqual([]);
  });

  it('stays quiet for a part with no declared maximum', () => {
    const c = ctxWith([net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'U1', pin: 'D13' }])]);
    expect(voltageDomainRule.check(c)).toEqual([]);
  });

  it('reports both the rail and the limit', () => {
    const c = ctxWith([net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'S1', pin: 'VCC' }])]);
    const m = voltageDomainRule.check(c)[0]!.message;
    expect(m).toMatch(/5/);
    expect(m).toMatch(/3\.6/);
  });
});
