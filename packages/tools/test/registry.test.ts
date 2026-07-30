import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_TOOLS, getTool, runTool } from '../src/registry.js';
import { initProjectFile, loadSession } from '../src/session.js';

function freshProject() {
  const dir = mkdtempSync(join(tmpdir(), 'makerlord-'));
  const path = join(dir, 'project.json');
  initProjectFile(path, 'test project');
  return { dir, path };
}

describe('registry invariants', () => {
  it('holds all 49 tools (33 core + 4 sim + decision_record + 6 firmware + 4 debug + profile_propose)', () => {
    expect(ALL_TOOLS).toHaveLength(49);
  });

  it('none of the simulation tools gate — simulation is advisory by nature', () => {
    for (const t of ALL_TOOLS.filter((x) => x.name.startsWith('sim_'))) {
      expect(t.gated, t.name).toBe(false);
    }
  });

  it('has no duplicate names', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every tool a prescriptive summary', () => {
    for (const t of ALL_TOOLS) {
      expect(t.summary.length, t.name).toBeGreaterThan(20);
      expect(t.summary, t.name).toMatch(/call this/i);
    }
  });

  it('marks every gated tool as mutating — except the one gated release', () => {
    // fw_manifest is gated (D47: flashing is powering) but mutates nothing:
    // it RELEASES an artifact. A gated read is a stronger guarantee, not a
    // weaker one — the exception is named so it stays deliberate.
    for (const t of ALL_TOOLS.filter((x) => x.gated && x.name !== 'fw_manifest')) {
      expect(t.mutates, t.name).toBe(true);
    }
  });

  it('gates exactly the six gated tools', () => {
    expect(ALL_TOOLS.filter((t) => t.gated).map((t) => t.name).sort()).toEqual([
      'advance_build_step', 'expand', 'fw_generate', 'fw_manifest',
      'gate_open', 'measure',
    ]);
  });

  it('GUARD-RAIL: no tool name suggests an escape hatch', () => {
    for (const t of ALL_TOOLS) {
      expect(t.name).not.toMatch(/dismiss|override|suppress|force|promote/);
    }
  });

  it('rejects an unknown tool name with near matches', () => {
    expect(() => getTool('req_proposse')).toThrow(/unknown tool/);
  });
});

describe('runTool', () => {
  it('validates input at the boundary — zod error for bad args', async () => {
    const { dir, path } = freshProject();
    const session = loadSession(path);
    await expect(
      runTool('req_propose', { id: 'x' }, { session, cwd: dir }),
    ).rejects.toThrow();
  });

  it('refuses STALE_PROJECT when expectHash does not match the loaded file', async () => {
    const { dir, path } = freshProject();
    const session = loadSession(path);
    const result = await runTool(
      'inventory_add',
      { freeText: 'a bag of LEDs' },
      { session, cwd: dir },
      'not-the-real-hash',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refused).toBe('STALE_PROJECT');
  });

  it('persists a successful mutation to disk', async () => {
    const { dir, path } = freshProject();
    const session = loadSession(path);
    const result = await runTool(
      'inventory_add',
      { freeText: 'a bag of LEDs' },
      { session, cwd: dir },
      session.hash,
    );
    expect(result.ok).toBe(true);
    expect(loadSession(path).file.project.inventory).toHaveLength(1);
  });
});
