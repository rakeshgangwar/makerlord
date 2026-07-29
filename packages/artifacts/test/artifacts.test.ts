import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { initProjectFile, loadSession, runTool, type ToolCtx } from '@makerlord/tools';
import { commitAll, initProjectRepo, log, writeAllArtifacts } from '../src/index.js';

let dir: string;
let ctx: ToolCtx;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'makerlord-artifacts-'));
  const session = initProjectFile(join(dir, 'project.json'), 'an LED indicator');
  ctx = { session, cwd: dir };
});

async function call(name: string, input: unknown = {}) {
  const r = await runTool(name, input, ctx);
  expect(r.ok, name).toBe(true);
}

describe('the project file tree (user-journey.md §3)', () => {
  it('a fresh project writes nothing but the model — no empty stubs', () => {
    const written = writeAllArtifacts(loadSession(join(dir, 'project.json')));
    expect(written).toEqual([]);
  });

  it('requirements produce requirements.md with the provenance column', async () => {
    await call('req_propose', {
      id: 'brightness', category: 'performance', statement: 'visibly lit indoors',
      metric: 'led_current', comparator: '>=', value: 10, unit: 'mA',
      consumedBy: ['CHECK_LED'], provenance: 'assumed',
    });
    writeAllArtifacts(loadSession(join(dir, 'project.json')));
    const md = readFileSync(join(dir, 'requirements.md'), 'utf8');
    expect(md).toContain('| brightness | `led_current` | >= 10 | mA | CHECK_LED | assumed |');
    expect(md).toContain('visibly lit indoors');
  });

  it('feasibility.md carries claims with their grades and evidence', async () => {
    await call('feasibility_claim', {
      claim: 'the library has all three parts', grade: 'verified',
      evidence: { toolCall: 'parts_search' },
    });
    await call('feasibility_verdict', { verdict: 'buildable' });
    writeAllArtifacts(loadSession(join(dir, 'project.json')));
    const md = readFileSync(join(dir, 'feasibility.md'), 'utf8');
    expect(md).toContain('**Verdict: buildable**');
    expect(md).toContain('**verified**: the library has all three parts — verified via `parts_search`');
  });

  it('a circuit produces the whole circuit/ directory', async () => {
    await call('part_add', { ref: 'R1', defId: 'ResistorModuleID' });
    await call('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    await call('connect', { from: 'R1.Pin 1', to: 'LED1.anode' });
    writeAllArtifacts(loadSession(join(dir, 'project.json')));

    expect(existsSync(join(dir, 'circuit', 'netlist.json'))).toBe(true);
    expect(existsSync(join(dir, 'circuit', 'schematic.svg'))).toBe(true);
    expect(existsSync(join(dir, 'circuit', 'breadboard.svg'))).toBe(true);
    const steps = readFileSync(join(dir, 'circuit', 'build-steps.md'), 'utf8');
    expect(steps).toContain('Power goes on last');
    expect(steps).toContain('[GATE]');
    expect(steps).toContain('**Measure:**');
    const netlist = JSON.parse(readFileSync(join(dir, 'circuit', 'netlist.json'), 'utf8'));
    expect(netlist.intent).toHaveLength(1);
  });

  it('architecture produces architecture.md and its block diagram', async () => {
    await call('block_add', {
      id: 'led', name: 'indicator',
      sourcing: { type: 'buy', partId: '5mmColorLEDModuleID' },
      interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes', voltageV: 5 }],
    });
    writeAllArtifacts(loadSession(join(dir, 'project.json')));
    const md = readFileSync(join(dir, 'architecture.md'), 'utf8');
    expect(md).toContain('**indicator**');
    expect(md).toContain('buy: `5mmColorLEDModuleID`');
    expect(readFileSync(join(dir, 'architecture.svg'), 'utf8')).toContain('data-block="led"');
  });
});

describe('the history facet (D29)', () => {
  it('decision_record → DECISIONS.md with the rejected options', async () => {
    await call('decision_record', {
      id: 'D1', title: 'WeMos D1 mini over the Uno', stage: 4,
      decision: 'The D1 mini is the MCU: onboard wifi and deep sleep.',
      rejected: [
        { option: 'Arduino Uno', reason: 'no wifi; needs a shield and more power' },
        { option: 'bare ESP-12', reason: 'no USB; harder for a first build' },
      ],
      consequence: '3.3 V logic everywhere; level care at the probe.',
    });
    writeAllArtifacts(loadSession(join(dir, 'project.json')));
    const md = readFileSync(join(dir, 'DECISIONS.md'), 'utf8');
    expect(md).toContain('## D1 — WeMos D1 mini over the Uno');
    expect(md).toContain('**Rejected — Arduino Uno:** no wifi');
    expect(md).toContain('**Consequence:** 3.3 V logic');
    expect(md).toMatch(/\*\d{4}-\d{2}-\d{2}\* · stage 4/);
  });

  it('decisions are append-only — a duplicate id is refused with guidance', async () => {
    await call('decision_record', {
      id: 'D1', title: 't', decision: 'd',
      rejected: [{ option: 'o', reason: 'r' }],
    });
    const again = runTool('decision_record', {
      id: 'D1', title: 't2', decision: 'd2',
      rejected: [{ option: 'o', reason: 'r' }],
    }, ctx);
    await expect(again).rejects.toThrow(/append-only/);
  });

  it('a pre-facet project file (no history key) still writes everything else', () => {
    // emptyProject files from before the facet simply lack the key.
    const written = writeAllArtifacts(loadSession(join(dir, 'project.json')));
    expect(written).not.toContain('DECISIONS.md');
  });
});

describe('D34: a real git repo', () => {
  it('init commits the birth of the project; work commits with messages', async () => {
    initProjectRepo(dir);
    expect(log(dir)).toEqual(['Project created']);

    await call('inventory_add', { freeText: 'a drawer of LEDs' });
    writeAllArtifacts(loadSession(join(dir, 'project.json')));
    expect(commitAll(dir, 'note my LEDs and see what fits')).toBe(true);
    expect(log(dir)[0]).toBe('note my LEDs and see what fits');

    // A clean tree is a no-op, not an empty commit.
    expect(commitAll(dir, 'nothing changed')).toBe(false);
    expect(log(dir)).toHaveLength(2);
  });
});
