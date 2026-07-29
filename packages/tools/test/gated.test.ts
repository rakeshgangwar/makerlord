import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Finding } from '@makerlord/circuit';
import { refusalFor } from '../src/tools/gated.js';
import { board } from '../src/data.js';
import type { ToolCtx } from '../src/def.js';
import { runTool } from '../src/registry.js';
import { initProjectFile } from '../src/session.js';

let ctx: ToolCtx;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'makerlord-'));
  const session = initProjectFile(join(dir, 'project.json'), 'a lamp');
  ctx = { session, cwd: dir };
});

async function call(name: string, input: unknown = {}) {
  return runTool(name, input, ctx);
}

async function data(name: string, input: unknown = {}) {
  const r = await call(name, input);
  expect(r.ok, `${name} should succeed`).toBe(true);
  return (r as { ok: true; data: never }).data as Record<string, unknown>;
}

function finding(over: Partial<Finding>): Finding {
  return {
    ruleId: 'X', severity: 'BLOCKER', message: 'm', affected: {}, ...over,
  } as Finding;
}

describe('refusalFor — the finding→refusal mapping', () => {
  it('is null when nothing blocks', () => {
    expect(refusalFor([finding({ severity: 'WARNING' })])).toBeNull();
  });

  it('maps a live BLOCKER to BLOCKERS_UNRESOLVED', () => {
    expect(refusalFor([finding({ severity: 'BLOCKER' })])?.code).toBe(
      'BLOCKERS_UNRESOLVED',
    );
  });

  it('maps an envelope REFUSE to MAINS_ON_BREADBOARD, outranking blockers', () => {
    const r = refusalFor([
      finding({ severity: 'BLOCKER' }),
      finding({ severity: 'REFUSE', ruleId: 'RULE_OUT_OF_SAFE_ENVELOPE' }),
    ]);
    expect(r?.code).toBe('MAINS_ON_BREADBOARD');
  });
});

describe('expand', () => {
  it('refuses BLOCK_UNDECIDED while any block has no sourcing', async () => {
    await data('block_add', { id: 'psu', name: 'psu' });
    const r = await call('expand');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refused).toBe('BLOCK_UNDECIDED');
  });

  it('refuses BLOCKERS_UNRESOLVED while an architecture blocker stands', async () => {
    await data('block_add', {
      id: 'mcu', name: 'mcu',
      sourcing: { type: 'buy', partId: 'arduino_Uno_Rev3(fix)' },
      interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes' }],
    });
    const r = await call('expand');   // vin is unlinked → ARCH_INTERFACE_UNMET
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refused).toBe('BLOCKERS_UNRESOLVED');
      expect(r.findings.map((f) => f.ruleId)).toContain('ARCH_INTERFACE_UNMET');
    }
  });

  it('expands a clean architecture into a circuit', async () => {
    await data('block_add', {
      id: 'led', name: 'indicator',
      sourcing: { type: 'buy', partId: '5mmColorLEDModuleID' },
      interfaces: [],
    });
    const d = await data('expand');
    expect(d.parts).toBe(1);
    const inspect = await data('project_inspect');
    const file = inspect.file as {
      project: { circuit?: { parts: { blockId?: string }[] } };
    };
    expect(file.project.circuit?.parts[0]?.blockId).toBe('led');
  });
});

async function placedBlockedCircuit() {
  // A placed LED intent-wired to the Uno rails with no resistor: BLOCKER.
  await data('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
  await data('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
  await data('connect', { from: 'U1.5V', to: 'LED1.anode' });
  const grid = board().grid;
  const byCell = new Map(
    Object.entries(grid.holes).map(([id, c]) => [`${c.col},${c.row}`, id]),
  );
  const origin = Object.entries(grid.holes).find(([, c]) =>
    byCell.has(`${c.col + 1},${c.row}`),
  )![0];
  await data('place', { ref: 'LED1', hole: origin, orientation: 0 });
}

describe('advance_build_step', () => {
  it('refuses BLOCKERS_UNRESOLVED with the findings attached', async () => {
    await placedBlockedCircuit();
    const r = await call('advance_build_step', { to: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refused).toBe('BLOCKERS_UNRESOLVED');
      expect(r.findings.length).toBeGreaterThan(0);
    }
  });

  it('errors on a step index past the end of the sequence', async () => {
    await data('part_add', { ref: 'R1', defId: 'ResistorModuleID' });
    await expect(call('advance_build_step', { to: 99 })).rejects.toThrow(
      /does not exist/,
    );
  });

  it('advances a clean circuit up to the gate, then refuses past it', async () => {
    await data('part_add', { ref: 'R1', defId: 'ResistorModuleID' });
    const ok1 = await call('advance_build_step', { to: 1 });
    expect(ok1.ok).toBe(true);
    // The generated sequence for one unplaced resistor: POWER_OFF, ROUTE_POWER,
    // GATE, POWER_ON — stepping to the end must refuse while the gate is shut.
    const past = await call('advance_build_step', { to: 3 });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.refused).toBe('GATE_NOT_OPEN');
  });
});

describe('measure and gate_open', () => {
  it('gate_open refuses MEASUREMENT_REQUIRED with no readings', async () => {
    await data('part_add', { ref: 'R1', defId: 'ResistorModuleID' });
    const r = await call('gate_open');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refused).toBe('MEASUREMENT_REQUIRED');
  });

  it('gate_open refuses while blockers stand, even with measurements', async () => {
    await placedBlockedCircuit();
    await data('measure', { name: 'rail continuity', value: 0, unit: 'ohm' });
    const r = await call('gate_open');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refused).toBe('BLOCKERS_UNRESOLVED');
  });

  it('measure then gate_open opens a clean circuit, and the gate persists', async () => {
    await data('part_add', { ref: 'R1', defId: 'ResistorModuleID' });
    await data('measure', { name: 'rail-to-rail', value: 0, unit: 'OL' });
    const d = await data('gate_open');
    expect(d.gateOpen).toBe(true);
    const status = await data('project_status');
    expect((status.build as { gateOpen: boolean }).gateOpen).toBe(true);
    const past = await call('advance_build_step', { to: 3 });
    expect(past.ok).toBe(true);
  });
});
