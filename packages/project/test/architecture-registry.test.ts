import { describe, expect, it } from 'vitest';
import type { PartDefinition } from '@makerlord/parts';
import {
  ARCHITECTURE_RULES, architectureGateOpens, checkArchitecture, pinCountRule,
} from '../src/architecture/rules.js';
import { makeProjectContext } from '../src/requirements/rules.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { ESP32_PROFILE, AA_PROFILE, projectWith, req } from './fixtures.js';

const TINY_MCU: PartDefinition = {
  id: 'tiny', title: 'Tiny MCU', family: 'microcontroller board',
  properties: {},
  pins: [
    { id: 'c0', name: 'GND', role: 'gnd' },
    { id: 'c1', name: 'D0', role: 'io' },
    { id: 'c2', name: 'D1', role: 'io' },
  ],
  buses: [], views: {},
};

function ctxWithDefs(project: ReturnType<typeof projectWith>) {
  return makeProjectContext(
    project,
    new Map([['tiny', TINY_MCU]]),
    new Map([['esp32', ESP32_PROFILE], ['aa-2x', AA_PROFILE]]),
  );
}

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'tiny' },
  interfaces: [{ id: 'io', kind: 'gpio', direction: 'provides' }],
};

function sensor(id: string): Block {
  return {
    id, name: id,
    sourcing: { type: 'buy', partId: 'esp32' },
    interfaces: [{ id: 'sig', kind: 'gpio', direction: 'consumes' }],
  };
}

function wire(id: string): BlockLink {
  return {
    from: { blockId: id, interfaceId: 'sig' },
    to: { blockId: 'mcu', interfaceId: 'io' },
  };
}

describe('pinCountRule', () => {
  it('passes when demand fits the available io pins', () => {
    const p = projectWith([], [mcu, sensor('a'), sensor('b')], [wire('a'), wire('b')]);
    expect(pinCountRule.check(ctxWithDefs(p))).toEqual([]);
  });

  it('blocks when demand exceeds the available io pins', () => {
    const p = projectWith(
      [], [mcu, sensor('a'), sensor('b'), sensor('c')],
      [wire('a'), wire('b'), wire('c')],
    );
    const f = pinCountRule.check(ctxWithDefs(p));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_PIN_COUNT_EXCEEDED');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('reports demand and capacity', () => {
    const p = projectWith(
      [], [mcu, sensor('a'), sensor('b'), sensor('c')],
      [wire('a'), wire('b'), wire('c')],
    );
    expect(pinCountRule.check(ctxWithDefs(p))[0]!.message).toMatch(/3.*2|2.*3/);
  });

  it('stays quiet when the part definition is unknown', () => {
    const unknown: Block = { ...mcu, sourcing: { type: 'buy', partId: 'nope' } };
    const p = projectWith([], [unknown, sensor('a')], [wire('a')]);
    expect(pinCountRule.check(ctxWithDefs(p))).toEqual([]);
  });
});

describe('ARCHITECTURE_RULES', () => {
  it('registers all five architecture rules', () => {
    expect(ARCHITECTURE_RULES.map((r) => r.id).sort()).toEqual([
      'ARCH_INTERFACE_UNMET',
      'ARCH_PIN_COUNT_EXCEEDED',
      'ARCH_POWER_BUDGET_EXCEEDED',
      'ARCH_REQUIREMENT_UNSATISFIED',
      'ARCH_VOLTAGE_MISMATCH',
    ]);
  });

  it('has no duplicate ids', () => {
    const ids = ARCHITECTURE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('architectureGateOpens', () => {
  it('opens on a clean architecture', () => {
    const p = projectWith([], [mcu, sensor('a')], [wire('a')]);
    expect(architectureGateOpens(checkArchitecture(ctxWithDefs(p)))).toBe(true);
  });

  it('stays shut when a port is unlinked', () => {
    const p = projectWith([], [mcu, sensor('a')], []);
    expect(architectureGateOpens(checkArchitecture(ctxWithDefs(p)))).toBe(false);
  });

  it('opens despite a WARNING — a degraded check does not gate', () => {
    // An assumed input degrades the computed rules to WARNING, which by
    // spec §4 must not block progress.
    const p = projectWith(
      [req({ id: 'cap', metric: 'supply_capacity', value: 1, unit: 'mAh' }),
       req({ id: 'rt', metric: 'battery_runtime', value: 99999, unit: 'months' })],
      [mcu, sensor('a')], [wire('a')],
    );
    const findings = checkArchitecture(ctxWithDefs(p));
    expect(findings.some((f) => f.severity === 'WARNING')).toBe(true);
    expect(architectureGateOpens(findings)).toBe(true);
  });
});
