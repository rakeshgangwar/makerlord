import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { board } from '../src/data.js';
import type { ToolCtx } from '../src/def.js';
import { runTool } from '../src/registry.js';
import { initProjectFile } from '../src/session.js';

let ctx: ToolCtx;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'makerlord-'));
  const session = initProjectFile(join(dir, 'project.json'), 'a soil moisture sensor');
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

describe('project group', () => {
  it('project_status summarises a fresh project', async () => {
    const d = await data('project_status');
    expect(d.intent).toBe('a soil moisture sensor');
    expect(d.counts).toMatchObject({ requirements: 0, blocks: 0 });
  });

  it('project_inspect returns the whole file and its hash', async () => {
    const d = await data('project_inspect');
    expect((d.file as { version: number }).version).toBe(1);
    expect(typeof d.hash).toBe('string');
  });
});

describe('parts group — over the real corpus', () => {
  it('parts_search with an empty query lists the whole curated library', async () => {
    const d = await data('parts_search', { query: '' });
    expect(d.hits.length).toBeGreaterThanOrEqual(20);
    // every hit carries what the browse view groups by
    for (const h of d.hits) {
      expect(typeof h.family).toBe('string');
      expect(h.family.length).toBeGreaterThan(0);
    }
  });

  it('parts_search finds the curated LED', async () => {
    const d = await data('parts_search', { query: 'LED' });
    const hits = d.hits as { id: string }[];
    expect(hits.some((h) => h.id === '5mmColorLEDModuleID')).toBe(true);
  });

  it('parts_get returns definition plus safety profile', async () => {
    const d = await data('parts_get', { id: '5mmColorLEDModuleID' });
    expect((d.definition as { pins: unknown[] }).pins).toHaveLength(2);
    expect((d.profile as { polarity: string }).polarity).toBe('polarized');
  });

  it('parts_get errors for a hallucinated id', async () => {
    await expect(call('parts_get', { id: 'made-up-part' })).rejects.toThrow(
      /unknown part/,
    );
  });
});

describe('feasibility group', () => {
  it('rejects a sourced claim without evidence — validation error, not finding', async () => {
    await expect(
      call('feasibility_claim', { claim: 'others built this', grade: 'sourced' }),
    ).rejects.toThrow(/evidence/i);
  });

  it('accepts and stores an evidenced claim, then a verdict', async () => {
    await data('feasibility_claim', {
      claim: 'three prior builds found',
      grade: 'sourced',
      evidence: { url: 'https://example.com/b', fetchedAt: '2026-07-29T10:00:00Z' },
    });
    await data('feasibility_verdict', { verdict: 'buildable' });
    const d = await data('feasibility_show');
    expect((d.feasibility as { verdict: string }).verdict).toBe('buildable');
  });
});

describe('requirements group', () => {
  it('req_slots suggests the sensor-node archetype from the intent', async () => {
    const d = await data('req_slots');
    expect((d.archetype as { id: string }).id).toBe('sensor-node');
    expect((d.slots as unknown[]).length).toBeGreaterThan(4);
  });

  it('propose → confirm flips provenance to stated', async () => {
    await data('req_propose', {
      id: 'rt', category: 'power', statement: '6 months on AA',
      metric: 'battery_runtime', comparator: '>=', value: 6, unit: 'months',
      consumedBy: ['CHECK_POWER_BUDGET'], provenance: 'assumed',
    });
    await data('req_confirm', { id: 'rt', value: 12 });
    const d = await data('req_list');
    const reqs = d.requirements as { id: string; provenance: string; value: number }[];
    expect(reqs[0]).toMatchObject({ id: 'rt', provenance: 'stated', value: 12 });
  });

  it('req_propose rejects a duplicate id', async () => {
    const r = {
      id: 'dup', category: 'power', statement: 's', metric: 'm',
      comparator: '>=', value: 1, unit: 'u', consumedBy: ['X'], provenance: 'stated',
    };
    await data('req_propose', r);
    await expect(call('req_propose', r)).rejects.toThrow(/already exists/);
  });
});

describe('architecture group', () => {
  it('block_link validates both ends exist', async () => {
    await data('block_add', {
      id: 'mcu', name: 'mcu',
      interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes' }],
    });
    await expect(
      call('block_link', {
        fromBlock: 'ghost', fromInterface: 'out',
        toBlock: 'mcu', toInterface: 'vin',
      }),
    ).rejects.toThrow(/no block "ghost"/);
  });

  it('block_sourcing rejects a part not in the curated library', async () => {
    await data('block_add', { id: 'b', name: 'b' });
    await expect(
      call('block_sourcing', {
        id: 'b', sourcing: { type: 'buy', partId: 'esp32-imaginary' },
      }),
    ).rejects.toThrow(/curated/);
  });
});

describe('circuit group — boundary validation', () => {
  it('part_add rejects a hallucinated definition', async () => {
    await expect(call('part_add', { ref: 'X1', defId: 'nope' })).rejects.toThrow(
      /curated/,
    );
  });

  it('connect rejects a hallucinated pin, listing the real ones', async () => {
    await data('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    await data('part_add', { ref: 'R1', defId: 'ResistorModuleID' });
    await expect(
      call('connect', { from: 'LED1.plus', to: 'R1.Pin 0' }),
    ).rejects.toThrow(/no pin named "plus".*anode/s);
  });

  it('connect accepts real pins and records intent', async () => {
    await data('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    await data('part_add', { ref: 'R1', defId: 'ResistorModuleID' });
    const d = await data('connect', { from: 'LED1.anode', to: 'R1.Pin 1' });
    expect(d.nets).toBe(1);
  });

  it('wire rejects a hole that does not exist', async () => {
    await expect(call('wire', { from: 'A1', to: 'ZZ99' })).rejects.toThrow(
      /does not exist/,
    );
  });

  it('place seats a part when every pin lands on the board', async () => {
    await data('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    // Find a hole whose right-neighbour exists, so the LED fits.
    const grid = board().grid;
    const byCell = new Map(
      Object.entries(grid.holes).map(([id, c]) => [`${c.col},${c.row}`, id]),
    );
    const origin = Object.entries(grid.holes).find(([, c]) =>
      byCell.has(`${c.col + 1},${c.row}`),
    )![0];
    const d = await data('place', { ref: 'LED1', hole: origin, orientation: 0 });
    expect(d.ref).toBe('LED1');
  });
});

describe('checks group', () => {
  it('check_circuit surfaces the LED-without-resistor blocker', async () => {
    await data('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
    await data('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    await data('connect', { from: 'U1.5V', to: 'LED1.anode' });
    await data('connect', { from: 'U1.GND', to: 'LED1.cathode' });
    // Place the LED so its pins land on derived nets.
    const grid = board().grid;
    const byCell = new Map(
      Object.entries(grid.holes).map(([id, c]) => [`${c.col},${c.row}`, id]),
    );
    const origin = Object.entries(grid.holes).find(([, c]) =>
      byCell.has(`${c.col + 1},${c.row}`),
    )![0];
    await data('place', { ref: 'LED1', hole: origin, orientation: 0 });
    const d = await data('check_circuit');
    const findings = d.findings as { ruleId: string }[];
    expect(findings.map((f) => f.ruleId)).toContain('RULE_LED_NO_CURRENT_LIMIT');
  });

  it('predict_dc reports a prediction for an empty-ish circuit', async () => {
    await data('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
    const d = await data('predict_dc');
    expect(d.prediction).toHaveProperty('totalCurrentMa');
  });
});
