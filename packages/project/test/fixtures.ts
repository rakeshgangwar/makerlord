import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Project } from '../src/model.js';
import type { Requirement } from '../src/requirements/types.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { emptyProject } from '../src/model.js';
import { makeProjectContext } from '../src/requirements/rules.js';

export function req(over: Partial<Requirement> = {}): Requirement {
  return {
    id: 'r1',
    category: 'power',
    statement: '≥6 months on 2×AA',
    metric: 'battery_runtime',
    comparator: '>=',
    value: 6,
    unit: 'months',
    consumedBy: ['CHECK_POWER_BUDGET'],
    provenance: 'stated',
    ...over,
  };
}

export const ESP32_PROFILE: SafetyProfile = {
  partId: 'esp32',
  footprint: { pins: { GND: [0, 0], '3V3': [1, 0], D4: [2, 0] } },
  logicLevelV: 3.3,
  pinMaxMa: 20,
  portTotalMaxMa: 100,
  quiescentMa: 80,
  hazardClass: 'none',
};

export const AA_PROFILE: SafetyProfile = {
  partId: 'aa-2x',
  footprint: { pins: { '+': [0, 0], '-': [1, 0] } },
  hazardClass: 'none',
};

export function ctx(
  project: Project,
  profiles: [string, SafetyProfile][] = [
    ['esp32', ESP32_PROFILE],
    ['aa-2x', AA_PROFILE],
  ],
) {
  return makeProjectContext(
    project,
    new Map<string, PartDefinition>(),
    new Map(profiles),
  );
}

export function projectWith(
  requirements: Requirement[] = [],
  blocks: Block[] = [],
  links: BlockLink[] = [],
): Project {
  const p = emptyProject('test project');
  p.requirements = requirements;
  p.architecture = { blocks, links };
  return p;
}
