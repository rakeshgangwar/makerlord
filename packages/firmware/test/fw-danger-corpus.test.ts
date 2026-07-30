import { describe, expect, it } from 'vitest';
import type { Circuit, Finding } from '@makerlord/circuit';
import { gateOpens } from '@makerlord/circuit';
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Firmware } from '@makerlord/project';
import { lintApplicationRegion } from '../src/lint.js';
import { checkFirmware, type FwRuleContext } from '../src/rules.js';

/**
 * ── THE FIRMWARE DANGER CORPUS — RELEASE-BLOCKING ─────────────────────
 * The same contract as the Tier-1 corpus in @makerlord/circuit: every
 * entry is a fault that destroys hardware or bricks a board, paired with
 * a benign twin that must stay silent. A failure here is not a flaky
 * test — it is a maker's dead MCU. Never weaken it to get to green.
 *
 * These are the D9 cross-checks: faults invisible to any hardware-only
 * or code-only tool, caught because ONE model holds both.
 */

function def(id: string, pins: [string, PartDefinition['pins'][0]['role']][]): PartDefinition {
  return {
    id, title: id, family: 'x', properties: {},
    pins: pins.map(([name, role], i) => ({ id: `c${i}`, name, role })),
    buses: [], views: {},
  };
}

const MCU = def('mcu-x', [
  ['A0', 'io'], ['D3', 'io'], ['D5', 'io'], ['D8', 'io'],
  ['5V', 'supply'], ['G', 'gnd'],
]);
const LED = def('led-x', [['anode', 'passive'], ['cathode', 'passive']]);
const SENSOR = def('sensor-x', [['AOUT', 'io'], ['VCC', 'supply'], ['GND', 'gnd']]);

const MCU_PROFILE: SafetyProfile = {
  partId: 'mcu-x',
  footprint: { pins: { A0: [0, 0], D3: [0, 1], D5: [0, 2], D8: [0, 3], '5V': [0, 4], G: [0, 5] } },
  hazardClass: 'none',
  fqbn: 'esp8266:esp8266:d1_mini',
  flash: { protocol: 'esptool-js' },
  gpio: {
    A0: { analogIn: true, analogMaxV: 3.2 },
    D3: { digital: true, strap: { atBoot: 'HIGH', why: 'GPIO0 LOW enters flash mode' } },
    D5: { digital: true, pwm: true },
    D8: { digital: true, strap: { atBoot: 'LOW', why: 'GPIO15 HIGH prevents boot' } },
  },
};

interface Case {
  name: string;
  expectRule: string;
  /** The fault. */
  danger: () => Finding[];
  /** The twin that must stay SILENT for this rule. */
  benign: () => Finding[];
}

function fw(roles: Firmware['roles'], intent: Circuit['intent'], extra: {
  unbound?: { behaviorId: string; role: string }[];
  netVoltages?: Map<string, number>;
} = {}): Finding[] {
  const ctx: FwRuleContext = {
    circuit: {
      boardId: 'half',
      parts: [
        { ref: 'U1', defId: 'mcu-x' },
        { ref: 'LED1', defId: 'led-x' },
        { ref: 'SENS1', defId: 'sensor-x' },
      ],
      wires: [],
      intent,
    },
    defs: new Map([['mcu-x', MCU], ['led-x', LED], ['sensor-x', SENSOR]]),
    profiles: new Map([['mcu-x', MCU_PROFILE]]),
    firmware: { target: { ref: 'U1' }, behaviors: [], roles },
    unbound: extra.unbound ?? [],
    ...(extra.netVoltages ? { netVoltages: extra.netVoltages } : {}),
  };
  return checkFirmware(ctx);
}

const CASES: Case[] = [
  {
    // The canonical D9 killer: OUTPUT HIGH into ground = dead pin driver.
    name: 'pin driven as OUTPUT wired straight to ground',
    expectRule: 'RULE_FW_OUTPUT_INTO_RAIL',
    danger: () => fw(
      [{ role: 'R', ref: 'SENS1', pin: 'GND', mcuPin: 'D5', mode: 'OUTPUT' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'SENS1', pin: 'GND' }] }],
    ),
    benign: () => fw(
      [{ role: 'R', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'OUTPUT' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'LED1', pin: 'anode' }] }],
    ),
  },
  {
    name: 'analog sensor wired to a pin with no ADC',
    expectRule: 'RULE_FW_PIN_CAPABILITY',
    danger: () => fw(
      [{ role: 'R', ref: 'SENS1', pin: 'AOUT', mcuPin: 'D5', mode: 'ANALOG_IN' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'SENS1', pin: 'AOUT' }] }],
    ),
    benign: () => fw(
      [{ role: 'R', ref: 'SENS1', pin: 'AOUT', mcuPin: 'A0', mode: 'ANALOG_IN' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'A0' }, { ref: 'SENS1', pin: 'AOUT' }] }],
    ),
  },
  {
    // GPIO15 pulled high: the board simply never boots again — until the
    // maker, mystified, unwires it. The engine says so before power-up.
    name: 'strap-LOW pin (GPIO15/D8) netted to the supply rail',
    expectRule: 'RULE_FW_STRAP_PIN_CONFLICT',
    danger: () => fw(
      [{ role: 'R', ref: 'SENS1', pin: 'VCC', mcuPin: 'D8', mode: 'OUTPUT' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'D8' }, { ref: 'SENS1', pin: 'VCC' }] }],
    ),
    benign: () => fw(
      [{ role: 'R', ref: 'LED1', pin: 'anode', mcuPin: 'D8', mode: 'OUTPUT' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'D8' }, { ref: 'LED1', pin: 'anode' }] }],
    ),
  },
  {
    name: 'strap-HIGH pin (GPIO0/D3) netted to ground',
    expectRule: 'RULE_FW_STRAP_PIN_CONFLICT',
    danger: () => fw(
      [{ role: 'R', ref: 'SENS1', pin: 'GND', mcuPin: 'D3', mode: 'INPUT' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'D3' }, { ref: 'SENS1', pin: 'GND' }] }],
    ),
    benign: () => fw(
      [{ role: 'R', ref: 'LED1', pin: 'anode', mcuPin: 'D3', mode: 'OUTPUT' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'D3' }, { ref: 'LED1', pin: 'anode' }] }],
    ),
  },
  {
    // A 5V sensor into a 3.2V ADC: works for a demo, dies in a week.
    name: 'predicted 5V on a 3.2V-max analog input',
    expectRule: 'RULE_FW_ANALOG_OVERVOLTAGE',
    danger: () => fw(
      [{ role: 'R', ref: 'SENS1', pin: 'AOUT', mcuPin: 'A0', mode: 'ANALOG_IN' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'A0' }, { ref: 'SENS1', pin: 'AOUT' }] }],
      { netVoltages: new Map([['n', 5.0]]) },
    ),
    benign: () => fw(
      [{ role: 'R', ref: 'SENS1', pin: 'AOUT', mcuPin: 'A0', mode: 'ANALOG_IN' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'A0' }, { ref: 'SENS1', pin: 'AOUT' }] }],
      { netVoltages: new Map([['n', 2.5]]) },
    ),
  },
  {
    name: 'behavior driving a role no wiring supports',
    expectRule: 'RULE_FW_ROLE_UNBOUND',
    danger: () => fw([], [], { unbound: [{ behaviorId: 'buzz', role: 'BUZZER' }] }),
    benign: () => fw(
      [{ role: 'BUZZER', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'OUTPUT' }],
      [{ name: 'n', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'LED1', pin: 'anode' }] }],
    ),
  },
];

describe('the firmware danger corpus — release-blocking', () => {
  for (const c of CASES) {
    it(`${c.name} → ${c.expectRule}, and its benign twin stays silent`, () => {
      const danger = c.danger();
      expect(danger.map((f) => f.ruleId)).toContain(c.expectRule);
      // A BLOCKER here must actually block the gate.
      const worst = danger.find((f) => f.ruleId === c.expectRule)!;
      if (worst.severity === 'BLOCKER' || worst.severity === 'REFUSE') {
        expect(gateOpens(danger)).toBe(false);
      }
      expect(c.benign().map((f) => f.ruleId)).not.toContain(c.expectRule);
    });
  }

  it('raw pin literal in application code → BLOCKER, and the gate shuts', () => {
    const findings = lintApplicationRegion(
      'digitalWrite(D5, HIGH);',
      MCU_PROFILE,
      [{ role: 'STATUS_LED', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'OUTPUT' }],
    );
    expect(findings.map((f) => f.ruleId)).toContain('RULE_FW_RAW_PIN_LITERAL');
    expect(gateOpens(findings)).toBe(false);
    // The twin: the same statement through the role symbol is clean.
    expect(lintApplicationRegion('digitalWrite(STATUS_LED, HIGH);', MCU_PROFILE, []))
      .toEqual([]);
  });
});
