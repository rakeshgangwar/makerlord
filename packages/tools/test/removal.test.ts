import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { initProjectFile, runTool, type Session } from '../src/index.js';

/** D55 cascades, each pinned (spec §3/§6). */

let s: Session;
let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'makerlord-removal-'));
  s = initProjectFile(join(cwd, 'project.json'), 'a lamp to unbuild');
});

const run = (name: string, input: object = {}) =>
  runTool(name, input, { session: s, cwd });
const circuit = () => s.file.project.circuit!;

async function buildLamp() {
  await run('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
  await run('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
  await run('connect', { from: 'U1.D5 PWM', to: 'LED1.anode' });
  await run('place', { ref: 'LED1', hole: 'A98' });
}

describe('removal tools (D55)', () => {
  it('part_remove cascades placement, wires, and net memberships', async () => {
    await buildLamp();
    // A wire serving LED1's hole, and one that does not.
    await run('wire', { from: 'A98', to: 'C1' });
    await run('wire', { from: 'C5', to: 'C9' });
    expect(circuit().wires).toHaveLength(2);
    expect(circuit().intent).toHaveLength(1);

    const r = await run('part_remove', { ref: 'LED1' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = r.data as { wiresRemoved: number; netsRemoved: number };
      expect(d.wiresRemoved).toBe(1);
      expect(d.netsRemoved).toBe(1);   // the two-member net died with it
    }
    expect(circuit().parts.map((p) => p.ref)).toEqual(['U1']);
    expect(circuit().wires).toHaveLength(1);   // the unrelated wire survives
    expect(circuit().intent).toHaveLength(0);

    const missing = await run('part_remove', { ref: 'LED1' });
    expect(missing.ok).toBe(false);
  });

  it('disconnect kills exactly the named net; wire_remove the exact pair', async () => {
    await buildLamp();
    const no = await run('disconnect', { from: 'U1.GND', to: 'LED1.cathode' });
    expect(no.ok).toBe(false);   // no such net
    const yes = await run('disconnect', { from: 'LED1.anode', to: 'U1.D5 PWM' });
    expect(yes.ok).toBe(true);   // order-free
    expect(circuit().intent).toHaveLength(0);

    await run('wire', { from: 'C5', to: 'C9' });
    expect((await run('wire_remove', { from: 'C9', to: 'C5' })).ok).toBe(true);
    expect((await run('wire_remove', { from: 'C9', to: 'C5' })).ok).toBe(false);
    expect(circuit().wires).toHaveLength(0);
  });

  it('unplace lifts the part but keeps it and its nets', async () => {
    await buildLamp();
    await run('wire', { from: 'A98', to: 'C1' });
    const r = await run('unplace', { ref: 'LED1' });
    expect(r.ok).toBe(true);
    expect(circuit().parts.find((p) => p.ref === 'LED1')?.placement).toBeUndefined();
    expect(circuit().intent).toHaveLength(1);   // intent survives
    expect(circuit().wires).toHaveLength(0);    // its wire went
    expect((await run('unplace', { ref: 'LED1' })).ok).toBe(false);   // already off
  });

  it('block_remove refuses while expanded; unlink mirrors link', async () => {
    await run('block_add', {
      id: 'mcu', name: 'controller',
      sourcing: { type: 'buy', partId: 'arduino_Uno_Rev3(fix)' },
      interfaces: [{ id: 'rail', kind: 'power', direction: 'provides', voltageV: 5, currentMa: 400 }],
      power: { activeMa: 45, sleepMa: 45 },
    });
    await run('block_add', {
      id: 'ind', name: 'indicator',
      sourcing: { type: 'build', partIds: ['5mmColorLEDModuleID', 'ResistorModuleID'] },
      interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes', voltageV: 5 }],
    });
    await run('block_link', { fromBlock: 'mcu', fromInterface: 'rail', toBlock: 'ind', toInterface: 'vin' });
    await run('check_architecture');
    await run('expand');

    const refused = await run('block_remove', { id: 'ind' });
    expect(refused.ok).toBe(false);   // expanded parts carry the blockId
    // Remove its parts, then the block goes.
    for (const p of [...circuit().parts].filter((x) => x.blockId === 'ind')) {
      await run('part_remove', { ref: p.ref });
    }
    expect((await run('block_remove', { id: 'ind' })).ok).toBe(true);
    expect((await run('block_unlink', {
      fromBlock: 'mcu', fromInterface: 'rail', toBlock: 'ind', toInterface: 'vin',
    })).ok).toBe(false);   // link died with the block
  });

  it('removal re-adjudicates: pulling the offender clears the blocker', async () => {
    // The danger pattern: LED with no ballast → BLOCKER; remove it → clean.
    // Freeform, so the rules adjudicate the intent nets directly (D56).
    await run('circuit_target', { target: 'freeform' });
    await run('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
    await run('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' });
    await run('connect', { from: 'U1.5V', to: 'LED1.anode' });
    await run('connect', { from: 'U1.GND', to: 'LED1.cathode' });
    const dirty = await run('check_circuit');
    const dirtyFindings = dirty.ok
      ? (dirty.data as { findings: { severity: string }[] }).findings : [];
    expect(dirtyFindings.some((f) => f.severity === 'BLOCKER')).toBe(true);

    await run('part_remove', { ref: 'LED1' });
    const clean = await run('check_circuit');
    const cleanFindings = clean.ok
      ? (clean.data as { findings: { severity: string }[] }).findings : [];
    expect(cleanFindings.some((f) => f.severity === 'BLOCKER')).toBe(false);
  });
});
