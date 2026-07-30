import { describe, expect, it } from 'vitest';
import type { Circuit } from '@makerlord/circuit';
import type { SafetyProfile } from '@makerlord/parts';
import type { Behavior } from '@makerlord/project';
import { derivePinPlan } from '../src/pinplan.js';

/**
 * Spec §2: roles are DERIVED, never authored. Every intent net joining an
 * MCU gpio pin to a part pin yields a role candidate named from the block
 * it serves; modes come from the behaviors that reference the role. The
 * maker renames; nobody edits mcuPin.
 */

const MCU_PROFILE: SafetyProfile = {
  partId: 'mcu-x',
  footprint: { pins: { A0: [0, 0], D5: [0, 1], D8: [0, 2], '5V': [0, 3], G: [0, 4] } },
  hazardClass: 'none',
  fqbn: 'esp8266:esp8266:d1_mini',
  flash: { protocol: 'esptool-js' },
  gpio: {
    A0: { analogIn: true, analogMaxV: 3.2 },
    D5: { digital: true, pwm: true, interrupt: true },
    D8: { digital: true, strap: { atBoot: 'LOW', why: 'GPIO15 HIGH prevents boot' } },
  },
};

const SENSOR_PROFILE: SafetyProfile = {
  partId: 'sensor-x',
  footprint: { pins: { AOUT: [0, 0], VCC: [0, 1], GND: [0, 2] } },
  hazardClass: 'none',
};

const profiles = new Map<string, SafetyProfile>([
  ['mcu-x', MCU_PROFILE],
  ['sensor-x', SENSOR_PROFILE],
]);

function circuit(): Circuit {
  return {
    boardId: 'half',
    parts: [
      { ref: 'U1', defId: 'mcu-x' },
      { ref: 'SENS1', defId: 'sensor-x', blockId: 'moisture-sense' },
      { ref: 'LED1', defId: 'led-x', blockId: 'status-led' },
    ],
    wires: [],
    intent: [
      { name: 'n1', members: [{ ref: 'U1', pin: 'A0' }, { ref: 'SENS1', pin: 'AOUT' }] },
      { name: 'n2', members: [{ ref: 'U1', pin: 'D5' }, { ref: 'LED1', pin: 'anode' }] },
      // Power wiring — NOT roles: 5V/G are not gpio pins.
      { name: 'n3', members: [{ ref: 'U1', pin: '5V' }, { ref: 'SENS1', pin: 'VCC' }] },
      { name: 'n4', members: [{ ref: 'U1', pin: 'G' }, { ref: 'SENS1', pin: 'GND' }] },
    ],
  };
}

const behaviors: Behavior[] = [
  { id: 'read-soil', kind: 'sample', role: 'MOISTURE_SENSE', everyMs: 60000 },
  { id: 'alert', kind: 'threshold', watch: 'read-soil', above: 700,
    drive: 'STATUS_LED', to: 'HIGH' },
];

describe('derivePinPlan', () => {
  it('derives roles from block-served gpio nets; power pins never become roles', () => {
    const plan = derivePinPlan(circuit(), profiles, behaviors);
    expect(plan.roles).toEqual([
      { role: 'MOISTURE_SENSE', ref: 'SENS1', pin: 'AOUT', mcuPin: 'A0', mode: 'ANALOG_IN' },
      { role: 'STATUS_LED', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'OUTPUT' },
    ]);
    expect(plan.unbound).toEqual([]);
  });

  it('an unreferenced role defaults to INPUT', () => {
    const plan = derivePinPlan(circuit(), profiles, []);
    for (const r of plan.roles) expect(r.mode).toBe('INPUT');
  });

  it('a behavior naming a role no wiring supports is reported, not invented', () => {
    const plan = derivePinPlan(circuit(), profiles, [
      { id: 'buzz', kind: 'drive', role: 'BUZZER', to: 'HIGH' },
    ]);
    expect(plan.unbound).toEqual([{ behaviorId: 'buzz', role: 'BUZZER' }]);
    expect(plan.roles.map((r) => r.role)).not.toContain('BUZZER');
  });

  it('a rename survives re-derivation after a rewire, and mcuPin updates', () => {
    const first = derivePinPlan(circuit(), profiles, behaviors);
    const renamed = first.roles.map((r) =>
      r.role === 'MOISTURE_SENSE' ? { ...r, role: 'SOIL_PROBE' } : r);
    const rewired = circuit();
    // The sensor moves from A0… nowhere else analog — move the LED instead.
    rewired.intent[1] = {
      name: 'n2', members: [{ ref: 'U1', pin: 'D8' }, { ref: 'LED1', pin: 'anode' }],
    };
    const second = derivePinPlan(rewired, profiles,
      [{ id: 'read-soil', kind: 'sample', role: 'SOIL_PROBE', everyMs: 1000 }],
      renamed);
    const soil = second.roles.find((r) => r.ref === 'SENS1')!;
    expect(soil.role).toBe('SOIL_PROBE');          // the rename held
    const led = second.roles.find((r) => r.ref === 'LED1')!;
    expect(led.mcuPin).toBe('D8');                 // the rewire tracked
    expect(led.role).toBe('STATUS_LED');           // name from prior plan
  });

  it('a circuit with no MCU is a clean error, not an empty plan', () => {
    const c = circuit();
    c.parts = c.parts.filter((p) => p.ref !== 'U1');
    expect(() => derivePinPlan(c, profiles, [])).toThrow(/MCU/i);
  });

  it('name collisions get a disambiguating suffix, never a silent merge', () => {
    const c = circuit();
    c.parts.push({ ref: 'LED2', defId: 'led-x', blockId: 'status-led' });
    c.intent.push({
      name: 'n5', members: [{ ref: 'U1', pin: 'D8' }, { ref: 'LED2', pin: 'anode' }],
    });
    const plan = derivePinPlan(c, profiles, []);
    const names = plan.roles.map((r) => r.role).sort();
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => n.startsWith('STATUS_LED'))).toHaveLength(2);
  });
});
