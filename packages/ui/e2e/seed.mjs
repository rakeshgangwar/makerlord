import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Seeds the e2e projects root through the REAL tool registry — the §7
 * golden script and a BLOCKER-carrying danger project — so every browser
 * assertion sits on engine truth, not fixtures of our own invention.
 * Runs as Playwright globalSetup; the API server reads projects lazily,
 * so ordering against the webServer does not matter.
 *
 * Project ids must be hex (the server's route regexes) — 'e2e' is hex.
 */
const here = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = join(here, '.projects');
const GOLDEN = 'e2e0001';
const DANGER = 'e2e0002';

// The engine's reference-data paths default to cwd; pin them to the repo
// before the registry loads, so the seeder runs from anywhere.
const repo = resolve(here, '../../..');
process.env.MAKERLORD_CURATED_PATH ??= join(repo, 'data/curated.json');
process.env.MAKERLORD_BOARD_GRID_PATH ??= join(repo, 'data/boards/half-breadboard.json');
process.env.MAKERLORD_PROFILES_PATH ??= join(repo, 'data/profiles');
process.env.MAKERLORD_FRITZING_PATH ??= join(repo, 'vendor/fritzing-parts');

const tools = await import('../../tools/dist/index.js');
const artifacts = await import('../../artifacts/dist/index.js');

async function seedProject(id, intent, script) {
  const dir = join(ROOT, id);
  mkdirSync(dir, { recursive: true });
  const session = tools.initProjectFile(join(dir, 'project.json'), intent);
  const ctx = { session, cwd: dir };

  const step = async (name, input = {}) => {
    const r = await tools.runTool(name, input, ctx);
    if (!r.ok && !input.expectRefusal) {
      throw new Error(`seed ${id}: ${name} failed: ${JSON.stringify(r)}`);
    }
    return r;
  };

  const out = await script(step, ctx);
  await artifacts.writeAllArtifacts(tools.loadSession(join(dir, 'project.json')));
  artifacts.initProjectRepo(dir);
  artifacts.commitAll(dir, 'e2e seed');
  return out;
}

/** A hole whose right-hand neighbour exists — same trick as tools.test.ts. */
function ledOrigin() {
  const grid = tools.board().grid;
  const byCell = new Map(
    Object.entries(grid.holes).map(([id, c]) => [`${c.col},${c.row}`, id]),
  );
  return Object.entries(grid.holes).find(([, c]) =>
    byCell.has(`${c.col + 1},${c.row}`),
  )[0];
}

export default async function seed() {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });

  // ── golden: the tool-surface §7 script, clean ─────────────────────────
  await seedProject(GOLDEN, 'a desk lamp indicator', async (step) => {
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
    await step('check_architecture');
    await step('expand');
    await step('check_circuit');
  });

  // ── danger: LED with no series resistor — a LIVE engine BLOCKER ──────
  await seedProject(DANGER, 'an LED wired straight to 5V', async (step) => {
    await step('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
    await step('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    await step('connect', { from: 'U1.5V', to: 'LED1.anode' });
    await step('connect', { from: 'U1.GND', to: 'LED1.cathode' });
    await step('place', { ref: 'LED1', hole: ledOrigin(), orientation: 0 });

    const check = await step('check_circuit');
    const blockers = check.data.findings.filter((f) => f.severity === 'BLOCKER');
    if (blockers.length === 0) {
      throw new Error('seed danger: expected a live BLOCKER from check_circuit');
    }

    // The engine's own refusal, verbatim — the transcript below embeds it.
    const refusal = await step('gate_open', { expectRefusal: true });
    if (refusal.ok || refusal.refused !== 'BLOCKERS_UNRESOLVED') {
      throw new Error(`seed danger: gate_open should refuse, got ${JSON.stringify(refusal)}`);
    }

    // A conversation where the agent CLAIMS the problem is fixed — §14's
    // "prose does not remove the card". Every event is a real engine
    // result; only the prose is the lie, which is exactly the point.
    const transcript = [
      { kind: 'maker', text: 'power it up' },
      { kind: 'event', event: { t: 'tool.start', name: 'gate_open' } },
      { kind: 'event', event: { t: 'tool.end', name: 'gate_open', result: refusal } },
      { kind: 'event', event: {
        t: 'message.delta',
        text: 'Good news — I checked again and the resistor issue is resolved. ' +
          'The blocker is cleared; go ahead and power it up.',
      } },
      { kind: 'event', event: { t: 'turn.end' } },
    ];
    for (const record of transcript) {
      appendFileSync(join(ROOT, DANGER, 'transcript.jsonl'), `${JSON.stringify(record)}\n`);
    }
  });

  process.stdout.write(`e2e seed: ${GOLDEN} (golden) + ${DANGER} (danger) in ${ROOT}\n`);
}
