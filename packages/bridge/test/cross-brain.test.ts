import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionEvent } from '@makerlord/protocol';
import { loadSession, runTool, type ToolCtx } from '@makerlord/tools';
import { AcpAgent } from '../src/acp.js';

const FAKE = resolve('packages/bridge/test/fake-agent.mjs');
const CLI = resolve('packages/cli/dist/main.js');
const REPO = resolve('.');

/**
 * ACP host spec §8: run the tool-surface golden script through the fake ACP
 * agent (whose tool calls shell out to the real maker CLI) and assert the
 * SAME refusals fire and the SAME project.json results as a direct-registry
 * run. This is the executable form of "equally gated" — if it fails, the
 * BYO path must be disabled until it passes.
 */

const SCRIPT: [string, Record<string, unknown>][] = [
  ['req_propose', {
    id: 'runtime', category: 'power', statement: 'runs from USB continuously',
    metric: 'supply_capacity', comparator: '>=', value: 500, unit: 'mAh',
    consumedBy: ['CHECK_POWER_BUDGET'], provenance: 'assumed',
  }],
  ['req_confirm', { id: 'runtime' }],
  ['block_add', { id: 'psu', name: 'psu' }],           // left undecided on purpose
  ['expand', {}],                                      // must refuse BLOCK_UNDECIDED
  ['block_sourcing', { id: 'psu', sourcing: { type: 'buy', partId: 'ResistorModuleID' } }],
  ['expand', {}],                                      // now succeeds
];

async function runDirect(dir: string) {
  const ctx: ToolCtx = { cwd: dir };
  await runTool('project_init', { intent: 'cross-brain test' }, ctx);
  const outcomes: unknown[] = [];
  for (const [name, args] of SCRIPT) {
    ctx.session = loadSession(join(dir, 'project.json'));
    outcomes.push(await runTool(name, args, ctx));
  }
  return { outcomes, file: loadSession(join(dir, 'project.json')).file };
}

async function runViaAcp(dir: string) {
  const ctx: ToolCtx = { cwd: dir };
  await runTool('project_init', { intent: 'cross-brain test' }, ctx);

  const started = await AcpAgent.start({
    command: process.execPath,
    args: [FAKE, '--run-tools'],
    cwd: dir,
    env: {
      FAKE_AGENT_CLI: CLI,
      MAKERLORD_PROJECT: join(dir, 'project.json'),
      MAKERLORD_FRITZING_PATH: join(REPO, 'vendor/fritzing-parts'),
      MAKERLORD_PROFILES_PATH: join(REPO, 'data/profiles'),
      MAKERLORD_CURATED_PATH: join(REPO, 'data/curated.json'),
      MAKERLORD_BOARD_GRID_PATH: join(REPO, 'data/boards/half-breadboard.json'),
    },
    initTimeoutMs: 5000,
  });
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error('fake agent failed to start');

  const sessionId = await started.agent.newSession(dir, []);
  const prompt = SCRIPT.map(([n, a]) => `TOOL ${n} ${JSON.stringify(a)}`).join('\n');
  const events: SessionEvent[] = [];
  await started.agent.prompt(sessionId, prompt, (e) => events.push(e));
  started.agent.kill();

  const outcomes = events
    .filter((e): e is Extract<SessionEvent, { t: 'tool.end' }> => e.t === 'tool.end')
    .map((e) => e.result);
  return { outcomes, file: loadSession(join(dir, 'project.json')).file };
}

describe('cross-brain: the BYO path is equally gated', () => {
  it('same refusals, same project.json as the direct-registry run', async () => {
    const directDir = mkdtempSync(join(tmpdir(), 'makerlord-direct-'));
    const acpDir = mkdtempSync(join(tmpdir(), 'makerlord-acp-'));

    const direct = await runDirect(directDir);
    const viaAcp = await runViaAcp(acpDir);

    // The same number of tool outcomes, and the refusal fires identically.
    expect(viaAcp.outcomes).toHaveLength(direct.outcomes.length);
    const directRefusals = direct.outcomes
      .map((o) => (o as { ok: boolean; refused?: string }))
      .map((o) => (o.ok ? null : o.refused));
    const acpRefusals = viaAcp.outcomes
      .map((o) => (o.ok ? null : (o as { refused: string }).refused));
    expect(acpRefusals).toEqual(directRefusals);
    expect(directRefusals).toContain('BLOCK_UNDECIDED');

    // The artefact agrees: same requirements, same blocks, same circuit.
    expect(viaAcp.file.project.requirements).toEqual(direct.file.project.requirements);
    expect(viaAcp.file.project.architecture).toEqual(direct.file.project.architecture);
    expect(viaAcp.file.project.circuit?.parts.map((p) => p.defId)).toEqual(
      direct.file.project.circuit?.parts.map((p) => p.defId),
    );
  }, 30_000);
});
