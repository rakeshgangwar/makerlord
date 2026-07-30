import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ngspiceAvailable } from '@makerlord/sim';
import type { ToolCtx } from '../src/def.js';
import { runTool } from '../src/registry.js';
import { initProjectFile } from '../src/session.js';

/**
 * The four debug tools against the real curated bundle and — where the
 * solver is present — real ngspice signatures. No manual-conviction path
 * exists to test; that absence IS the test (see registry invariants).
 */

let ctx: ToolCtx;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'makerlord-dbgt-'));
  const session = initProjectFile(join(dir, 'project.json'), 'a lamp that stopped');
  ctx = { session, cwd: dir };
});

async function call(name: string, input: unknown = {}) {
  return runTool(name, input, ctx);
}

async function data(name: string, input: unknown = {}) {
  const r = await call(name, input);
  expect(r.ok, `${name}: ${JSON.stringify(r).slice(0, 300)}`).toBe(true);
  return (r as { ok: true; data: never }).data as Record<string, unknown>;
}

/** 9V battery → 220R → LED, wired but unpowered until a stimulus lands. */
async function wireLamp() {
  await data('part_add', { ref: 'BAT1', defId: '1000AFDF10011leg' });
  await data('part_add', { ref: 'R1', defId: 'ResistorModuleID' });
  await data('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
  await data('connect', { from: 'BAT1.+', to: 'R1.Pin 0' });
  await data('connect', { from: 'R1.Pin 1', to: 'LED1.anode' });
  await data('connect', { from: 'LED1.cathode', to: 'BAT1.-' });
}

describe('debug_start preconditions', () => {
  it('REFUSES without a DC stimulus, naming the fix', async () => {
    await wireLamp();
    const r = await call('debug_start', { kind: 'element_dead', ref: 'LED1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refused).toBe('STIMULUS_REQUIRED');
      expect(r.message).toMatch(/sim_stimulus_set/);
    }
  });

  it('debug_observe without a session is a clean error', async () => {
    await wireLamp();
    await expect(call('debug_observe', {
      kind: 'voltage', net: 'x', value: 1, unit: 'V',
    })).rejects.toThrow(/debug_start/);
  });
});

const solver = await ngspiceAvailable();
if (!solver) {
  // eslint-disable-next-line no-console
  console.warn('\n⚠️  ngspice missing — debug tool walk SKIPPED.\n');
}

describe.skipIf(!solver)('the guided search, end to end through the registry', () => {
  it('an open joint at the LED is localized from real readings', async () => {
    await wireLamp();
    await data('sim_stimulus_set', {
      id: 's1', target: 'BAT1.+', kind: 'dc', params: { volts: 9 },
      provenance: 'stated', rationale: 'fresh PP3 on the bench',
    });

    const started = await data('debug_start', { kind: 'element_dead', ref: 'LED1' });
    expect(started.candidates as number).toBeGreaterThan(4);
    expect(started.proposed).not.toBeNull();

    // The bench truth we simulate: the LED anode joint is open. Answer
    // every proposal with the open-anode reality: the anode net floats
    // to the rail through the resistor; every other net is healthy.
    const reality: Record<string, number> = {
      // net names are derived from connect(): net_<from>__<to>
    };
    const session = (await data('debug_status')).session as {
      candidates: { id: string; signature: { netVoltages: Record<string, number> } }[];
    };
    const openLed = session.candidates.find((c) => c.id.startsWith('open-net_R1'));
    expect(openLed, 'an open-joint candidate on the R1→LED net exists').toBeDefined();
    Object.assign(reality, openLed!.signature.netVoltages);

    for (let i = 0; i < 10; i += 1) {
      const status = await data('debug_status');
      const s = status.session as { status: string; proposed?: { net: string } };
      if (s.status !== 'open' || !s.proposed) break;
      const net = s.proposed.net;
      await data('debug_observe', {
        kind: 'voltage', net, value: reality[net] ?? 0, unit: 'V',
      });
    }

    const final = (await data('debug_status')).session as {
      status: string; candidates: { id: string; status: string }[];
    };
    const live = final.candidates.filter((c) => c.status === 'live').map((c) => c.id);
    expect(live).toContain(openLed!.id);
    // Localized outright, or an honest tie that still contains the truth.
    if (final.status === 'localized') expect(live).toHaveLength(1);

    const closed = await data('debug_close');
    expect(closed.status).toBe(final.status === 'open' ? 'closed' : final.status);
  }, 300_000);

  it('a SELFTEST ok kills dead-rail through the tool surface', async () => {
    await wireLamp();
    await data('sim_stimulus_set', {
      id: 's1', target: 'BAT1.+', kind: 'dc', params: { volts: 9 },
      provenance: 'stated', rationale: 'bench',
    });
    await data('debug_start', { kind: 'board_dead' });
    const r = await data('debug_observe', {
      kind: 'selftest', role: 'STATUS_LED', ok: true,
    });
    expect((r.contradicted as { id: string }[]).map((x) => x.id)).toContain('dead-rail');
  }, 300_000);
});
