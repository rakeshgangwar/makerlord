import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { arduinoCliAvailable } from '@makerlord/firmware';
import type { ToolCtx } from '../src/def.js';
import { runTool } from '../src/registry.js';
import { initProjectFile } from '../src/session.js';

/**
 * The six firmware tools against the REAL curated bundle. Handlers as
 * plain functions (spec §7 of the tool-surface spec); the compile pair
 * runs only where arduino-cli exists — loudly skipped otherwise.
 */

let ctx: ToolCtx;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'makerlord-fwt-'));
  const session = initProjectFile(join(dir, 'project.json'), 'a status lamp');
  ctx = { session, cwd: dir };
});

async function call(name: string, input: unknown = {}) {
  return runTool(name, input, ctx);
}

async function data(name: string, input: unknown = {}) {
  const r = await call(name, input);
  expect(r.ok, `${name}: ${JSON.stringify(r)}`).toBe(true);
  return (r as { ok: true; data: never }).data as Record<string, unknown>;
}

/** Uno + resistor + LED, wired D5→R→LED→GND — clean, unplaced. */
async function wireLamp() {
  await data('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
  await data('part_add', { ref: 'R1', defId: 'ResistorModuleID' });
  await data('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
  await data('connect', { from: 'U1.D5 PWM', to: 'R1.Pin 0' });
  await data('connect', { from: 'R1.Pin 1', to: 'LED1.anode' });
  await data('connect', { from: 'LED1.cathode', to: 'U1.GND' });
}

describe('fw_behavior_set + fw_pin_plan', () => {
  it('stores a behavior, derives the plan, and reports what is unbound', async () => {
    await wireLamp();
    await data('fw_behavior_set', {
      set: { id: 'lamp', kind: 'drive', role: 'R1', to: 'HIGH' },
    });
    const plan = await data('fw_pin_plan');
    expect(plan.roles).toEqual([
      { role: 'R1', ref: 'R1', pin: 'Pin 0', mcuPin: 'D5 PWM', mode: 'OUTPUT' },
    ]);
    expect(plan.unbound).toEqual([]);

    // A behavior with no wiring shows up as unbound data.
    await data('fw_behavior_set', {
      set: { id: 'buzz', kind: 'drive', role: 'BUZZER', to: 'HIGH' },
    });
    const plan2 = await data('fw_pin_plan');
    expect(plan2.unbound).toEqual([{ behaviorId: 'buzz', role: 'BUZZER' }]);
  });

  it('remove deletes by id; an unknown behavior kind is rejected', async () => {
    await wireLamp();
    await data('fw_behavior_set', {
      set: { id: 'lamp', kind: 'drive', role: 'R1', to: 'HIGH' },
    });
    await data('fw_behavior_set', { remove: 'lamp' });
    const plan = await data('fw_pin_plan');
    expect((plan.roles as { mode: string }[])[0]!.mode).toBe('INPUT');   // unreferenced
    await expect(call('fw_behavior_set', {
      set: { id: 'x', kind: 'quantum', role: 'R1' },
    })).rejects.toThrow();
  });

  it('fw_behavior_set without an MCU is a clean error, before and after parts exist', async () => {
    await expect(call('fw_behavior_set', {
      set: { id: 'x', kind: 'drive', role: 'R', to: 'HIGH' },
    })).rejects.toThrow(/circuit/i);
    await data('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    await expect(call('fw_behavior_set', {
      set: { id: 'x', kind: 'drive', role: 'R', to: 'HIGH' },
    })).rejects.toThrow(/MCU/i);
  });
});

describe('check_firmware', () => {
  it('a clean model has no findings; a raw pin literal is a BLOCKER', async () => {
    await wireLamp();
    await data('fw_behavior_set', {
      set: { id: 'lamp', kind: 'drive', role: 'R1', to: 'HIGH' },
    });
    await data('fw_pin_plan');
    const clean = await data('check_firmware');
    expect(clean.findings).toEqual([]);

    const withLiteral = await data('check_firmware', {
      applicationRegion: '  digitalWrite(5, HIGH);',
    });
    const findings = withLiteral.findings as { ruleId: string; severity: string }[];
    expect(findings.map((f) => f.ruleId)).toContain('RULE_FW_RAW_PIN_LITERAL');
  });
});

describe('fw_generate — gated like every state-changer', () => {
  it('writes the projections for a clean model', async () => {
    await wireLamp();
    await data('fw_behavior_set', {
      set: { id: 'lamp', kind: 'drive', role: 'R1', to: 'HIGH' },
    });
    await data('fw_pin_plan');
    const g = await data('fw_generate');
    expect(g.files).toContain('firmware/pins.h');
    expect(readFileSync(join(dir, 'firmware/pins.h'), 'utf8'))
      .toContain('#define R1 5');
    expect(readFileSync(join(dir, 'firmware/main.cpp'), 'utf8'))
      .toContain('digitalWrite(R1, HIGH);');
  });

  it('REFUSES on a raw pin literal in the application region — and stores nothing', async () => {
    await wireLamp();
    await data('fw_pin_plan');
    const r = await call('fw_generate', { applicationRegion: 'pinMode(13, OUTPUT);' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refused).toBe('BLOCKERS_UNRESOLVED');
      expect(r.findings.map((f) => f.ruleId)).toContain('RULE_FW_RAW_PIN_LITERAL');
    }
    expect(ctx.session!.file.project.firmware?.applicationRegion).toBeUndefined();
    expect(existsSync(join(dir, 'firmware/main.cpp'))).toBe(false);
  });

  it('a valid region is stored and survives regeneration', async () => {
    await wireLamp();
    await data('fw_pin_plan');
    await data('fw_generate', { applicationRegion: '  // steady state\n  delay(10);' });
    const again = await data('fw_generate');   // regenerate, no region arg
    expect(again.files).toContain('firmware/main.cpp');
    expect(readFileSync(join(dir, 'firmware/main.cpp'), 'utf8'))
      .toContain('steady state');
  });
});

describe('fw_manifest — flashing is powering (D47)', () => {
  it('refuses while the power gate is shut, naming the gate', async () => {
    await wireLamp();
    await data('fw_pin_plan');
    const r = await call('fw_manifest');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refused).toBe('GATE_NOT_OPEN');
  });
});

const cli = await arduinoCliAvailable();
if (!cli) {
  // eslint-disable-next-line no-console
  console.warn('\n⚠️  arduino-cli missing — fw_compile tool tests SKIPPED.\n');
}

describe.skipIf(!cli)('fw_compile — the gate against the real compiler', () => {
  it('compiles, records lastBuild, and fw_manifest releases once the gate opens', async () => {
    await wireLamp();
    await data('fw_behavior_set', {
      set: { id: 'lamp', kind: 'drive', role: 'R1', to: 'HIGH' },
    });
    await data('fw_pin_plan');
    await data('fw_generate');
    const c = await data('fw_compile');
    expect(c.ok).toBe(true);
    expect(ctx.session!.file.project.firmware?.lastBuild?.ok).toBe(true);

    // Open the power gate the honest way: record the two measurements.
    await data('measure', { name: 'continuity_vcc_gnd', value: 1, unit: 'ohm' });
    await data('measure', { name: 'supply_voltage', value: 5.0, unit: 'V' });
    await data('gate_open');
    const m = await data('fw_manifest');
    expect(m.fqbn).toBe('arduino:avr:uno');
    expect(m.flash).toMatchObject({ protocol: 'stk500v1' });
    expect(m.bin).toMatch(/^firmware\/build\//);
  }, 300_000);
});

describe('inventory_gap — the library/inventory split (D49)', () => {
  it('derives toAcquire = BOM minus what the maker owns, titled', async () => {
    await wireLamp();   // uno + resistor + LED in the circuit
    await data('inventory_add', { partId: 'ResistorModuleID', quantity: 5 });
    await data('inventory_add', { freeText: 'a drawer of mystery wires' });
    const gap = await data('inventory_gap');
    const toAcquire = gap.toAcquire as { partId: string; needed: number; owned: number }[];
    // The resistor is covered; the uno and LED are not.
    expect(toAcquire.map((t) => t.partId).sort()).toEqual([
      '5mmColorLEDModuleID', 'arduino_Uno_Rev3(fix)',
    ]);
    for (const t of toAcquire) {
      expect(t.needed).toBe(1);
      expect(t.owned).toBe(0);
      expect((t as { title?: string }).title).toBeTruthy();
    }
    expect((gap.owned as unknown[]).length).toBe(2);
  });

  it('an empty circuit means nothing to acquire, not an error', async () => {
    const gap = await data('inventory_gap');
    expect(gap.toAcquire).toEqual([]);
  });
});
