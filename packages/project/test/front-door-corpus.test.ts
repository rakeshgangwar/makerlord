import { describe, expect, it } from 'vitest';
import type { PartDefinition } from '@makerlord/parts';
import {
  architectureGateOpens, checkArchitecture,
} from '../src/architecture/rules.js';
import { checkRequirements, makeProjectContext } from '../src/requirements/rules.js';
import { expandArchitecture } from '../src/architecture/expand.js';
import { slotsFor, suggestArchetype } from '../src/requirements/archetypes.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { ESP32_PROFILE, AA_PROFILE, projectWith, req } from './fixtures.js';

const ESP32_DEF: PartDefinition = {
  id: 'esp32', title: 'ESP32 DevKit', family: 'microcontroller board',
  properties: {},
  pins: [
    { id: 'c0', name: 'GND', role: 'gnd' },
    { id: 'c1', name: '3V3', role: 'supply' },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `io${i}`, name: `D${i}`, role: 'io' as const,
    })),
  ],
  buses: [], views: {},
};

function ctxOf(project: ReturnType<typeof projectWith>) {
  return makeProjectContext(
    project,
    new Map([['esp32', ESP32_DEF]]),
    new Map([['esp32', ESP32_PROFILE], ['aa-2x', AA_PROFILE]]),
  );
}

const battery: Block = {
  id: 'supply', name: 'power',
  sourcing: { type: 'buy', partId: 'aa-2x' },
  interfaces: [
    { id: 'out', kind: 'power', direction: 'provides', voltageV: 3.3, currentMa: 200 },
  ],
  power: { activeMa: 0, sleepMa: 0 },
};

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes', voltageV: 3.3 }],
  power: { activeMa: 80, sleepMa: 0.01 },
};

const powered: BlockLink = {
  from: { blockId: 'supply', interfaceId: 'out' },
  to: { blockId: 'mcu', interfaceId: 'vin' },
};

const timing = [
  req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
  req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
  req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
];

const runtime6mo = req({
  id: 'rt', metric: 'battery_runtime', comparator: '>=',
  value: 6, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
});

describe('Front door — the good path', () => {
  it('an hourly soil sensor on 2×AA passes every architecture check', () => {
    const p = projectWith([...timing, runtime6mo], [battery, mcu], [powered]);
    const findings = checkArchitecture(ctxOf(p));
    expect(findings).toEqual([]);
    expect(architectureGateOpens(findings)).toBe(true);
  });

  it('and expands into a circuit that keeps its block grouping', () => {
    const p = projectWith([...timing, runtime6mo], [battery, mcu], [powered]);
    const circuit = expandArchitecture(p);
    expect(circuit.parts.map((x) => x.blockId).sort()).toEqual(['mcu', 'supply']);
    expect(circuit.intent).toHaveLength(1);
  });
});

describe('Front door — cases that must be caught', () => {
  it('per-minute sampling cannot meet a 6-month runtime', () => {
    const perMinute = [
      req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
      req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
    ];
    const p = projectWith([...perMinute, runtime6mo], [battery, mcu], [powered]);
    const findings = checkArchitecture(ctxOf(p));
    expect(findings.map((f) => f.ruleId)).toContain('ARCH_REQUIREMENT_UNSATISFIED');
    expect(architectureGateOpens(findings)).toBe(false);
  });

  it('an unpowered block is caught before anything is bought', () => {
    const p = projectWith([...timing, runtime6mo], [battery, mcu], []);
    const findings = checkArchitecture(ctxOf(p));
    expect(findings.map((f) => f.ruleId)).toContain('ARCH_INTERFACE_UNMET');
    expect(architectureGateOpens(findings)).toBe(false);
  });

  it('a 5 V supply into a 3V3 board is caught', () => {
    const wrong: Block = {
      ...battery,
      interfaces: [
        { id: 'out', kind: 'power', direction: 'provides', voltageV: 5, currentMa: 200 },
      ],
    };
    const p = projectWith([...timing, runtime6mo], [wrong, mcu], [powered]);
    expect(checkArchitecture(ctxOf(p)).map((f) => f.ruleId)).toContain(
      'ARCH_VOLTAGE_MISMATCH',
    );
  });

  it('a requirement with no unit blocks before architecture is reached', () => {
    const p = projectWith([req({ id: 'vague', unit: '' })], [], []);
    expect(checkRequirements(ctxOf(p)).map((f) => f.ruleId)).toContain(
      'REQ_NOT_MEASURABLE',
    );
  });

  it('an undecided block cannot be expanded', () => {
    const undecided: Block = {
      id: 'psu', name: 'psu', sourcing: { type: 'undecided' }, interfaces: [],
    };
    expect(() => expandArchitecture(projectWith([], [undecided], []))).toThrow();
  });
});

describe('Front door — provenance bounds severity (spec §4)', () => {
  it('an assumed duty cycle degrades the runtime finding to WARNING', () => {
    // No sample_interval/active_duration -> duty is assumed always-on.
    const p = projectWith(
      [req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
       runtime6mo],
      [battery, mcu], [powered],
    );
    const findings = checkArchitecture(ctxOf(p));
    const rt = findings.find((f) => f.ruleId === 'ARCH_REQUIREMENT_UNSATISFIED')!;
    expect(rt.severity).toBe('WARNING');
    expect(rt.message).toMatch(/assumed/i);
    expect(architectureGateOpens(findings)).toBe(true);   // WARNING must not gate
  });
});

describe('Front door — elicitation', () => {
  it('a soil sensor intent suggests the sensor-node archetype', () => {
    const a = suggestArchetype('a soil moisture sensor for Home Assistant');
    expect(a?.id).toBe('sensor-node');
    expect(slotsFor(a?.id).some((s) => s.metric === 'battery_runtime')).toBe(true);
  });
});
