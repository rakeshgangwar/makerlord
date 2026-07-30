import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Circuit } from '@makerlord/circuit';
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Stimulus } from '@makerlord/sim';
import { ngspiceAvailable } from '@makerlord/sim';
import { contradicts } from '../src/prune.js';
import { computeSignatures } from '../src/signatures.js';

/**
 * The real-solver leg of spec §11: the library faults on the LED fixture
 * must produce SEPARABLE signatures — the physics the canned convergence
 * table hand-authored, now confirmed by ngspice. Loud skip without it.
 */

const available = await ngspiceAvailable();
if (!available) {
  // eslint-disable-next-line no-console
  console.warn('\n⚠️  ngspice missing — debug signature integration SKIPPED.\n');
}

function def(id: string, pins: [string, PartDefinition['pins'][0]['role']][]): PartDefinition {
  return {
    id, title: id, family: id, properties: {},
    pins: pins.map(([name, role], i) => ({ id: `c${i}`, name, role })),
    buses: [], views: {},
  };
}

const DEFS = new Map<string, PartDefinition>([
  ['bat', def('bat', [['+', 'supply'], ['-', 'gnd']])],
  ['res', def('res', [['Pin 0', 'passive'], ['Pin 1', 'passive']])],
  ['led', def('led', [['anode', 'passive'], ['cathode', 'passive']])],
]);
const PROFILES = new Map<string, SafetyProfile>([
  ['bat', { partId: 'bat', footprint: { pins: { '+': [0, 0], '-': [0, 1] } }, hazardClass: 'none' }],
  ['res', { partId: 'res', footprint: { pins: { 'Pin 0': [0, 0], 'Pin 1': [0, 1] } }, hazardClass: 'none', resistanceOhms: 220 }],
  ['led', { partId: 'led', footprint: { pins: { anode: [0, 0], cathode: [0, 1] } }, hazardClass: 'none', forwardVoltageV: 2.0, maxCurrentMa: 20 }],
]);

const CIRCUIT: Circuit = {
  boardId: 'half',
  parts: [
    { ref: 'BAT1', defId: 'bat' },
    { ref: 'R1', defId: 'res' },
    { ref: 'LED1', defId: 'led' },
  ],
  wires: [],
  intent: [
    { name: 'vcc', members: [{ ref: 'BAT1', pin: '+' }, { ref: 'R1', pin: 'Pin 0' }] },
    { name: 'mid', members: [{ ref: 'R1', pin: 'Pin 1' }, { ref: 'LED1', pin: 'anode' }] },
    { name: 'gnd', members: [{ ref: 'LED1', pin: 'cathode' }, { ref: 'BAT1', pin: '-' }] },
  ],
};

const STIMULI: Stimulus[] = [{
  id: 's1', target: 'vcc', kind: 'dc', params: { volts: 5 },
  provenance: 'stated', rationale: 'the bench supply on the vcc net',
}];

describe.skipIf(!available)('signatures from the real solver', () => {
  it('healthy, open-mid, reversed and dead-rail separate at the mid net', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-dbg-'));
    const candidates = await computeSignatures({
      circuit: CIRCUIT,
      faults: [
        { kind: 'no_fault' },
        { kind: 'open_joint', net: 'mid', member: 'LED1.anode' },
        { kind: 'reversed_part', ref: 'LED1' },
        { kind: 'dead_rail' },
      ],
      defs: DEFS, profiles: PROFILES, stimuli: STIMULI, workDir: dir,
    });
    const at = (id: string, net: string): number => {
      const c = candidates.find((x) => x.id === id)!;
      const v = c.signature.netVoltages[net];
      expect(v, `${id} has no ${net}`).toBeDefined();
      return v!;
    };

    // Healthy: the LED clamps mid near its forward voltage.
    expect(at('no-fault', 'mid')).toBeGreaterThan(1.5);
    expect(at('no-fault', 'mid')).toBeLessThan(2.6);
    // Open at the LED anode: no current, mid floats to the rail.
    expect(at('open-mid', 'mid')).toBeGreaterThan(4.5);
    // Reversed: blocking direction, mid near the rail too — but vcc-side
    // still separates it from dead-rail.
    expect(at('reversed-LED1', 'mid')).toBeGreaterThan(4.0);
    expect(at('dead-rail', 'vcc')).toBeLessThan(0.3);
    expect(at('no-fault', 'vcc')).toBeGreaterThan(4.5);

    // The separations the search relies on are real, per the band:
    expect(contradicts(at('no-fault', 'mid'), at('open-mid', 'mid'))).toBe(true);
    expect(contradicts(at('no-fault', 'vcc'), at('dead-rail', 'vcc'))).toBe(true);
  }, 120_000);

  it('the x10 resistor stays within the band of healthy at mid — the honest tie is physics', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-dbg-'));
    const candidates = await computeSignatures({
      circuit: CIRCUIT,
      faults: [{ kind: 'no_fault' }, { kind: 'wrong_value', ref: 'R1', factor: 10 }],
      defs: DEFS, profiles: PROFILES, stimuli: STIMULI, workDir: dir,
    });
    const healthy = candidates[0]!.signature.netVoltages;
    const x10 = candidates[1]!.signature.netVoltages;
    expect(contradicts(healthy.mid!, x10.mid!)).toBe(false);
    expect(contradicts(healthy.vcc!, x10.vcc!)).toBe(false);
  }, 120_000);
});
