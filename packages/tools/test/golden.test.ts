import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ToolCtx } from '../src/def.js';
import { runTool } from '../src/registry.js';
import { loadSession } from '../src/session.js';

/**
 * Spec §7: the golden end-to-end script, with no LLM at all. Every step goes
 * through the registry exactly as an agent would call it, and the assertions
 * are on the resulting project.json — the artefact, not the chatter.
 */
describe('golden end-to-end: front door to circuit, no LLM', () => {
  it('runs project_init → requirements → architecture → expand → check_circuit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-'));
    const ctx: ToolCtx = { cwd: dir };

    const step = async (name: string, input: unknown = {}) => {
      const r = await runTool(name, input, ctx);
      expect(r.ok, `${name} should succeed`).toBe(true);
      return (r as { ok: true; data: never }).data as Record<string, unknown>;
    };

    await step('project_init', { intent: 'a desk lamp indicator' });

    await step('req_propose', {
      id: 'runtime', category: 'power', statement: 'runs from USB continuously',
      metric: 'supply_capacity', comparator: '>=', value: 500, unit: 'mAh',
      consumedBy: ['CHECK_POWER_BUDGET'], provenance: 'assumed',
    });
    await step('req_confirm', { id: 'runtime' });

    await step('block_add', {
      id: 'mcu', name: 'controller',
      sourcing: { type: 'buy', partId: 'arduino_Uno_Rev3(fix)' },
      interfaces: [
        { id: 'rail', kind: 'power', direction: 'provides', voltageV: 5, currentMa: 400 },
      ],
      power: { activeMa: 45, sleepMa: 45 },
    });
    await step('block_add', {
      id: 'indicator', name: 'indicator LED',
      sourcing: { type: 'build', partIds: ['5mmColorLEDModuleID', 'ResistorModuleID'] },
      interfaces: [
        { id: 'vin', kind: 'power', direction: 'consumes', voltageV: 5 },
      ],
    });
    await step('block_link', {
      fromBlock: 'mcu', fromInterface: 'rail',
      toBlock: 'indicator', toInterface: 'vin',
    });

    const arch = await step('check_architecture');
    expect(arch.findings).toEqual([]);

    const expanded = await step('expand');
    expect(expanded.parts).toBe(3);       // uno + led + resistor
    expect(expanded.intent).toBe(1);

    const checked = await step('check_circuit');
    // Nothing is placed yet, so no layout-derived findings can fire.
    expect(checked.findings).toEqual([]);

    // The artefact, not the chatter: assert on project.json itself.
    const onDisk = loadSession(join(dir, 'project.json'));
    expect(onDisk.file.project.requirements[0]).toMatchObject({
      id: 'runtime', provenance: 'stated',
    });
    expect(onDisk.file.project.architecture.blocks).toHaveLength(2);
    expect(onDisk.file.project.circuit?.parts.map((p) => p.blockId).sort())
      .toEqual(['indicator', 'indicator', 'mcu']);

    // ── the firmware leg (spec §7 grown): behavior → plan → check →
    // generate, still no LLM anywhere. Wire the indicator to a gpio pin
    // first — expand only strung the power rail.
    const parts = onDisk.file.project.circuit!.parts;
    const mcuRef = parts.find((p) => p.blockId === 'mcu')!.ref;
    const ledRef = parts.find(
      (p) => p.blockId === 'indicator' && p.defId === '5mmColorLEDModuleID',
    )!.ref;
    await step('connect', { from: `${mcuRef}.D5 PWM`, to: `${ledRef}.anode` });

    await step('fw_behavior_set', {
      set: { id: 'blink-on', kind: 'drive', role: 'INDICATOR', to: 'HIGH' },
    });
    const plan = await step('fw_pin_plan');
    expect(plan.roles).toEqual([
      { role: 'INDICATOR', ref: ledRef, pin: 'anode', mcuPin: 'D5 PWM', mode: 'OUTPUT' },
    ]);
    const fwCheck = await step('check_firmware');
    expect(fwCheck.findings).toEqual([]);
    const gen = await step('fw_generate');
    expect(gen.files).toContain('firmware/pins.h');
    expect(readFileSync(join(dir, 'firmware', 'pins.h'), 'utf8'))
      .toContain('#define INDICATOR 5');
  });
});
