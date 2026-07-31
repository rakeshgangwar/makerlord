import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { initProjectFile, runTool, type Session } from '../src/index.js';

/**
 * D56 end-to-end: the onboard-only case that motivated the spec — a
 * bare Uno, freeform target, gate opens without measurements, the
 * builtin LED binds a behavior, and the exemption VANISHES the moment
 * anything is wired.
 */

let s: Session;
let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'makerlord-freeform-'));
  s = initProjectFile(join(cwd, 'project.json'), 'onboard blink');
});

const run = (name: string, input: object = {}) =>
  runTool(name, input, { session: s, cwd });

describe('freeform mode (D56)', () => {
  it('placement refuses; the bare module opens the gate; a net restores the demand', async () => {
    await run('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
    const t = await run('circuit_target', { target: 'freeform' });
    expect(t.ok).toBe(true);

    const placed = await run('place', { ref: 'U1', hole: 'A1' });
    expect(placed.ok).toBe(false);
    if (!placed.ok) expect(placed.refused).toBe('BOARD_TARGET');

    // The empty-circuit exemption: no measurements, gate opens anyway.
    const gate = await run('gate_open');
    expect(gate.ok).toBe(true);

    // Builtin LED binds with zero wiring.
    await run('fw_behavior_set', {
      set: { id: 'blink', kind: 'drive', role: 'BUILTIN_LED', to: 'HIGH' },
    });
    const plan = await run('fw_pin_plan');
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      const roles = (plan.data as { roles: { role: string; mcuPin: string }[] }).roles;
      const builtin = roles.find((r) => r.role === 'BUILTIN_LED');
      expect(builtin?.mcuPin).toBe('D13/SCK');
    }

    // One more part + a net: the exemption vanishes.
    await run('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    await run('connect', { from: 'U1.D5 PWM', to: 'LED1.anode' });
    const gate2 = await run('gate_open');
    expect(gate2.ok).toBe(false);
    // Stricter than merely demanding measurements: the intent-net rules
    // adjudicate freeform circuits too, and this LED has no ballast.
    if (!gate2.ok) expect(gate2.refused).toBe('BLOCKERS_UNRESOLVED');
  });

  it('freeform build steps speak intent, never holes', async () => {
    await run('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
    await run('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    await run('circuit_target', { target: 'freeform' });
    await run('connect', { from: 'U1.D5 PWM', to: 'LED1.anode' });
    const { buildSequence } = await import('@makerlord/circuit');
    const { circuitRuleContext } = await import('../src/index.js');
    const steps = buildSequence(circuitRuleContext(s));
    const kinds = steps.map((x) => x.kind);
    expect(kinds[0]).toBe('POWER_OFF');
    expect(kinds).toContain('GATE');
    expect(kinds.at(-1)).toBe('POWER_ON');
    const route = steps.find((x) => x.kind === 'ROUTE_SIGNAL');
    expect(route?.instruction).toContain('U1.D5 PWM');
    expect(route?.instruction).not.toMatch(/hole|A\d\d/);
  });
});
