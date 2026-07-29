import { describe, expect, it } from 'vitest';
import type { SafetyProfile } from '@makerlord/parts';
import { gateOpens, runRules } from '../src/rules/engine.js';
import { ALL_RULES } from '../src/rules/index.js';
import {
  def, fixtureContext, net,
  UNO, LED, RESISTOR, UNO_PROFILE, LED_PROFILE, RESISTOR_PROFILE,
} from './fixtures.js';

const MAINS = def('mains', 'psu', [
  { id: 'c0', name: 'L', role: 'supply' },
  { id: 'c1', name: 'N', role: 'gnd' },
]);
const MAINS_PROFILE: SafetyProfile = {
  partId: 'mains',
  footprint: { pins: { L: [0, 0], N: [1, 0] } },
  hazardClass: 'mains',
};

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

const ALL_DEFS: [string, ReturnType<typeof def>][] = [
  ['uno', UNO], ['led', LED], ['res', RESISTOR],
  ['mains', MAINS], ['sensor', SENSOR],
];
const ALL_PROFILES: [string, SafetyProfile][] = [
  ['uno', UNO_PROFILE], ['led', LED_PROFILE], ['res', RESISTOR_PROFILE],
  ['mains', MAINS_PROFILE], ['sensor', SENSOR_PROFILE],
];

interface Danger {
  name: string;
  expectRule: string;
  ctx: () => ReturnType<typeof fixtureContext>;
}

function build(parts: { ref: string; defId: string }[], nets: ReturnType<typeof net>[]) {
  return () =>
    fixtureContext({ parts, nets, defs: ALL_DEFS, profiles: ALL_PROFILES });
}

const DANGERS: Danger[] = [
  {
    name: 'supply rail shorted straight to ground',
    expectRule: 'RULE_SUPPLY_RAIL_SHORT',
    ctx: build(
      [{ ref: 'U1', defId: 'uno' }],
      [net('n', [{ ref: 'U1', pin: 'GND' }, { ref: 'U1', pin: '5V' }])],
    ),
  },
  {
    name: 'LED straight across 5V with no resistor',
    expectRule: 'RULE_LED_NO_CURRENT_LIMIT',
    ctx: build(
      [{ ref: 'U1', defId: 'uno' }, { ref: 'LED1', defId: 'led' }],
      [
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'LED1', pin: 'anode' }]),
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    ),
  },
  {
    name: 'LED fitted backwards across the rails',
    expectRule: 'RULE_POLARIZED_PART_REVERSED',
    ctx: build(
      [{ ref: 'U1', defId: 'uno' }, { ref: 'LED1', defId: 'led' }, { ref: 'R1', defId: 'res' }],
      [
        net('g', [
          { ref: 'U1', pin: 'GND' },
          { ref: 'LED1', pin: 'anode' },
          { ref: 'R1', pin: '0' },
        ]),
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    ),
  },
  {
    name: 'too many LEDs on one GPIO pin',
    expectRule: 'RULE_PIN_CURRENT_EXCEEDED',
    ctx: build(
      [
        { ref: 'U1', defId: 'uno' },
        { ref: 'L1', defId: 'led' },
        { ref: 'L2', defId: 'led' },
        { ref: 'R1', defId: 'res' },
      ],
      [
        net('a', [
          { ref: 'U1', pin: 'D13' },
          { ref: 'R1', pin: '0' },
          { ref: 'L1', pin: 'anode' },
          { ref: 'L2', pin: 'anode' },
        ]),
      ],
    ),
  },
  {
    name: '5V applied to a 3.3V-only sensor',
    expectRule: 'RULE_VOLTAGE_DOMAIN_MISMATCH',
    ctx: build(
      [{ ref: 'U1', defId: 'uno' }, { ref: 'S1', defId: 'sensor' }],
      [net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'S1', pin: 'VCC' }])],
    ),
  },
  {
    name: 'mains-rated part on a breadboard (absolute refusal, no tier opens it)',
    expectRule: 'RULE_OUT_OF_SAFE_ENVELOPE',
    ctx: build(
      [{ ref: 'PS1', defId: 'mains' }],
      [net('l', [{ ref: 'PS1', pin: 'L' }])],
    ),
  },
];

describe('Tier 1 — known-dangerous circuits', () => {
  for (const d of DANGERS) {
    it(`catches: ${d.name}`, () => {
      const findings = runRules(ALL_RULES, d.ctx());
      expect(findings.map((f) => f.ruleId)).toContain(d.expectRule);
    });

    it(`keeps the gate shut for: ${d.name}`, () => {
      expect(gateOpens(runRules(ALL_RULES, d.ctx()))).toBe(false);
    });

    it(`explains itself for: ${d.name}`, () => {
      const f = runRules(ALL_RULES, d.ctx()).find((x) => x.ruleId === d.expectRule)!;
      expect(f.message.length).toBeGreaterThan(40);
      expect(f.suggestedFix?.length ?? 0).toBeGreaterThan(20);
    });
  }
});

describe('Tier 1 — safe circuits must not be blocked', () => {
  it('passes a correctly built LED circuit', () => {
    const ctx = build(
      [
        { ref: 'U1', defId: 'uno' },
        { ref: 'R1', defId: 'res' },
        { ref: 'LED1', defId: 'led' },
      ],
      [
        net('v', [{ ref: 'U1', pin: 'D13' }, { ref: 'R1', pin: '0' }]),
        net('mid', [{ ref: 'R1', pin: '1' }, { ref: 'LED1', pin: 'anode' }]),
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    )();
    expect(runRules(ALL_RULES, ctx)).toEqual([]);
    expect(gateOpens(runRules(ALL_RULES, ctx))).toBe(true);
  });

  it('passes a bare powered board with nothing attached', () => {
    const ctx = build(
      [{ ref: 'U1', defId: 'uno' }],
      [net('v', [{ ref: 'U1', pin: '5V' }]), net('g', [{ ref: 'U1', pin: 'GND' }])],
    )();
    expect(gateOpens(runRules(ALL_RULES, ctx))).toBe(true);
  });
});
