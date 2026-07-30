import { describe, expect, it } from 'vitest';
import type { Circuit } from '@makerlord/circuit';
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Firmware } from '@makerlord/project';
import { checkFirmware, type FwRuleContext } from '../src/rules.js';

/**
 * The cross-check family (spec §4): deterministic rules over circuit ×
 * firmware — faults neither side sees alone. Every fixture here has a
 * benign twin in the danger corpus; these tests pin each rule's firing
 * and silent case at unit level.
 */

function def(id: string, pins: [string, PartDefinition['pins'][0]['role']][]): PartDefinition {
  return {
    id, title: id, family: 'x', properties: {},
    pins: pins.map(([name, role], i) => ({ id: `c${i}`, name, role })),
    buses: [], views: {},
  };
}

const MCU_DEF = def('mcu-x', [
  ['A0', 'io'], ['D3', 'io'], ['D5', 'io'], ['D8', 'io'],
  ['5V', 'supply'], ['G', 'gnd'],
]);
const LED_DEF = def('led-x', [['anode', 'passive'], ['cathode', 'passive']]);
const SENSOR_DEF = def('sensor-x', [
  ['AOUT', 'io'], ['VCC', 'supply'], ['GND', 'gnd'],
]);

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

function ctx(over: {
  intent?: Circuit['intent'];
  firmware?: Partial<Firmware>;
  netVoltages?: Map<string, number>;
  unbound?: { behaviorId: string; role: string }[];
}): FwRuleContext {
  const circuit: Circuit = {
    boardId: 'half',
    parts: [
      { ref: 'U1', defId: 'mcu-x' },
      { ref: 'LED1', defId: 'led-x' },
      { ref: 'SENS1', defId: 'sensor-x' },
    ],
    wires: [],
    intent: over.intent ?? [],
  };
  const base: Firmware = {
    target: { ref: 'U1' },
    behaviors: [],
    roles: [],
    ...over.firmware,
  };
  const c: FwRuleContext = {
    circuit,
    defs: new Map([['mcu-x', MCU_DEF], ['led-x', LED_DEF], ['sensor-x', SENSOR_DEF]]),
    profiles: new Map([['mcu-x', MCU_PROFILE]]),
    firmware: base,
    unbound: over.unbound ?? [],
  };
  if (over.netVoltages) c.netVoltages = over.netVoltages;
  return c;
}

const ids = (f: ReturnType<typeof checkFirmware>) => f.map((x) => x.ruleId);

describe('RULE_FW_OUTPUT_INTO_RAIL — the D9 canonical MCU-killer', () => {
  it('fires when an OUTPUT role net ties to ground', () => {
    const c = ctx({
      intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'SENS1', pin: 'GND' }] }],
      firmware: { roles: [{ role: 'R', ref: 'SENS1', pin: 'GND', mcuPin: 'D5', mode: 'OUTPUT' }] },
    });
    const f = checkFirmware(c);
    expect(ids(f)).toContain('RULE_FW_OUTPUT_INTO_RAIL');
    expect(f.find((x) => x.ruleId === 'RULE_FW_OUTPUT_INTO_RAIL')!.severity).toBe('BLOCKER');
  });

  it('stays silent for an OUTPUT into a passive pin', () => {
    const c = ctx({
      intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'LED1', pin: 'anode' }] }],
      firmware: { roles: [{ role: 'R', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'OUTPUT' }] },
    });
    expect(ids(checkFirmware(c))).not.toContain('RULE_FW_OUTPUT_INTO_RAIL');
  });
});

describe('RULE_FW_PIN_CAPABILITY', () => {
  it('fires for ANALOG_IN on a pin with no ADC', () => {
    const c = ctx({
      intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'SENS1', pin: 'AOUT' }] }],
      firmware: { roles: [{ role: 'R', ref: 'SENS1', pin: 'AOUT', mcuPin: 'D5', mode: 'ANALOG_IN' }] },
    });
    const f = checkFirmware(c);
    const hit = f.find((x) => x.ruleId === 'RULE_FW_PIN_CAPABILITY')!;
    expect(hit.severity).toBe('BLOCKER');
    expect(hit.message).toMatch(/D5/);
  });

  it('stays silent for ANALOG_IN on the ADC pin', () => {
    const c = ctx({
      intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'A0' }, { ref: 'SENS1', pin: 'AOUT' }] }],
      firmware: { roles: [{ role: 'R', ref: 'SENS1', pin: 'AOUT', mcuPin: 'A0', mode: 'ANALOG_IN' }] },
    });
    expect(ids(checkFirmware(c))).not.toContain('RULE_FW_PIN_CAPABILITY');
  });
});

describe('RULE_FW_STRAP_PIN_CONFLICT', () => {
  it('fires when a strap-LOW pin nets to supply', () => {
    const c = ctx({
      intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'D8' }, { ref: 'SENS1', pin: 'VCC' }] }],
      firmware: { roles: [{ role: 'R', ref: 'SENS1', pin: 'VCC', mcuPin: 'D8', mode: 'OUTPUT' }] },
    });
    const f = checkFirmware(c);
    const hit = f.find((x) => x.ruleId === 'RULE_FW_STRAP_PIN_CONFLICT')!;
    expect(hit.severity).toBe('BLOCKER');
    expect(hit.message).toMatch(/boot/i);
  });

  it('fires when a strap-HIGH pin nets to ground', () => {
    const c = ctx({
      intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'D3' }, { ref: 'SENS1', pin: 'GND' }] }],
      firmware: { roles: [{ role: 'R', ref: 'SENS1', pin: 'GND', mcuPin: 'D3', mode: 'INPUT' }] },
    });
    expect(ids(checkFirmware(c))).toContain('RULE_FW_STRAP_PIN_CONFLICT');
  });

  it('stays silent for a strap pin on a signal net', () => {
    const c = ctx({
      intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'D3' }, { ref: 'LED1', pin: 'anode' }] }],
      firmware: { roles: [{ role: 'R', ref: 'LED1', pin: 'anode', mcuPin: 'D3', mode: 'OUTPUT' }] },
    });
    expect(ids(checkFirmware(c))).not.toContain('RULE_FW_STRAP_PIN_CONFLICT');
  });
});

describe('RULE_FW_ANALOG_OVERVOLTAGE', () => {
  const wired = (volts: number) => ctx({
    intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'A0' }, { ref: 'SENS1', pin: 'AOUT' }] }],
    firmware: { roles: [{ role: 'R', ref: 'SENS1', pin: 'AOUT', mcuPin: 'A0', mode: 'ANALOG_IN' }] },
    netVoltages: new Map([['n1', volts]]),
  });

  it('fires when the predicted net voltage exceeds analogMaxV', () => {
    const f = checkFirmware(wired(5.0));
    const hit = f.find((x) => x.ruleId === 'RULE_FW_ANALOG_OVERVOLTAGE')!;
    expect(hit.severity).toBe('BLOCKER');
    expect(hit.message).toMatch(/5(\.0)?\s*V/);
  });

  it('stays silent at a safe predicted voltage — and with no prediction at all', () => {
    expect(ids(checkFirmware(wired(2.5)))).not.toContain('RULE_FW_ANALOG_OVERVOLTAGE');
    const noPrediction = ctx({
      intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'A0' }, { ref: 'SENS1', pin: 'AOUT' }] }],
      firmware: { roles: [{ role: 'R', ref: 'SENS1', pin: 'AOUT', mcuPin: 'A0', mode: 'ANALOG_IN' }] },
    });
    expect(ids(checkFirmware(noPrediction))).not.toContain('RULE_FW_ANALOG_OVERVOLTAGE');
  });
});

describe('RULE_FW_INPUT_FLOATING', () => {
  it('warns for an INPUT role on a rail-less net', () => {
    const c = ctx({
      intent: [{ name: 'n1', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'LED1', pin: 'anode' }] }],
      firmware: { roles: [{ role: 'R', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'INPUT' }] },
    });
    const hit = checkFirmware(c).find((x) => x.ruleId === 'RULE_FW_INPUT_FLOATING')!;
    expect(hit.severity).toBe('WARNING');
  });

  it('stays silent when the net reaches a rail', () => {
    const c = ctx({
      intent: [{ name: 'n1', members: [
        { ref: 'U1', pin: 'D5' }, { ref: 'LED1', pin: 'anode' }, { ref: 'SENS1', pin: 'GND' },
      ] }],
      firmware: { roles: [{ role: 'R', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'INPUT' }] },
    });
    expect(ids(checkFirmware(c))).not.toContain('RULE_FW_INPUT_FLOATING');
  });
});

describe('RULE_FW_ROLE_UNBOUND', () => {
  it('one BLOCKER per behavior naming a role no wiring supports', () => {
    const c = ctx({ unbound: [{ behaviorId: 'buzz', role: 'BUZZER' }] });
    const hit = checkFirmware(c).find((x) => x.ruleId === 'RULE_FW_ROLE_UNBOUND')!;
    expect(hit.severity).toBe('BLOCKER');
    expect(hit.message).toMatch(/BUZZER/);
    expect(hit.message).toMatch(/buzz/);
  });
});

describe('every finding carries a suggestedFix', () => {
  it('all six rules suggest the way out', () => {
    const c = ctx({
      intent: [
        { name: 'n1', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'SENS1', pin: 'GND' }] },
        { name: 'n2', members: [{ ref: 'U1', pin: 'D8' }, { ref: 'SENS1', pin: 'VCC' }] },
      ],
      firmware: { roles: [
        { role: 'R1', ref: 'SENS1', pin: 'GND', mcuPin: 'D5', mode: 'OUTPUT' },
        { role: 'R2', ref: 'SENS1', pin: 'VCC', mcuPin: 'D8', mode: 'ANALOG_IN' },
      ] },
      unbound: [{ behaviorId: 'b', role: 'X' }],
    });
    for (const f of checkFirmware(c)) {
      expect(f.suggestedFix, f.ruleId).toBeTruthy();
    }
  });
});
