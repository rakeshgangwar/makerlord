import type { Comparator, RequirementCategory } from './types.js';

export interface RequirementSlot {
  metric: string;
  category: RequirementCategory;
  unit: string;
  comparator: Comparator;
  consumedBy: string[];
  prompt: string;
  /** Used when the maker declines to answer; the requirement is then assumed. */
  default?: number;
}

export const UNIVERSAL_SLOTS: readonly RequirementSlot[] = [
  {
    metric: 'supply_capacity', category: 'power', unit: 'mAh', comparator: '>=',
    consumedBy: ['CHECK_POWER_BUDGET'],
    prompt: 'What powers it — USB, a battery, or a wall adapter? If battery, which?',
  },
  {
    metric: 'operating_temperature', category: 'environment', unit: 'C',
    comparator: 'range', consumedBy: ['TEST_PLAN'], default: 0,
    prompt: 'Where does it live — indoors, outdoors, a fridge, a greenhouse?',
  },
  {
    metric: 'host_interface', category: 'interface', unit: 'enum',
    comparator: '==', consumedBy: ['CHECK_INTERFACE_COMPAT'],
    prompt: 'What does it talk to, and over what — WiFi, USB, Bluetooth, nothing?',
  },
  {
    metric: 'max_dimension', category: 'physical', unit: 'mm', comparator: '<=',
    consumedBy: ['CHECK_ENCLOSURE_FIT'],
    prompt: 'Does it have to fit anywhere in particular?',
  },
];

export interface Archetype {
  id: string;
  name: string;
  matches: string[];
  slots: RequirementSlot[];
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'sensor-node', name: 'Sensor node',
    matches: ['sensor', 'monitor', 'measure', 'soil', 'temperature', 'humidity'],
    slots: [
      {
        metric: 'sample_interval', category: 'performance', unit: 's',
        comparator: '==', consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How often should it take a reading?',
      },
      {
        metric: 'active_duration', category: 'performance', unit: 's',
        comparator: '==', consumedBy: ['CHECK_POWER_BUDGET'], default: 3,
        prompt: 'Roughly how long is it awake per reading?',
      },
      {
        metric: 'battery_runtime', category: 'power', unit: 'months',
        comparator: '>=', consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How long should it run before you touch it again?',
      },
    ],
  },
  {
    id: 'actuator', name: 'Actuator / controller',
    matches: ['relay', 'motor', 'switch', 'valve', 'servo', 'control'],
    slots: [
      {
        metric: 'load_current', category: 'power', unit: 'mA', comparator: '<=',
        consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'What is it switching or driving, and how much current does that draw?',
      },
      {
        metric: 'switching_rate', category: 'performance', unit: 'Hz',
        comparator: '<=', consumedBy: ['TEST_PLAN'], default: 1,
        prompt: 'How often does it actuate?',
      },
    ],
  },
  {
    id: 'audio', name: 'Audio device',
    matches: ['audio', 'speaker', 'microphone', 'sound', 'music'],
    slots: [
      {
        metric: 'sample_rate', category: 'performance', unit: 'Hz',
        comparator: '>=', consumedBy: ['TEST_PLAN'], default: 16000,
        prompt: 'What audio quality do you need?',
      },
    ],
  },
  {
    id: 'wearable', name: 'Wearable',
    matches: ['wearable', 'watch', 'badge', 'wrist', 'pocket'],
    slots: [
      {
        metric: 'max_mass', category: 'physical', unit: 'g', comparator: '<=',
        consumedBy: ['CHECK_ENCLOSURE_FIT'],
        prompt: 'How heavy can it be before it stops being wearable?',
      },
      {
        metric: 'battery_runtime', category: 'power', unit: 'months',
        comparator: '>=', consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How long between charges?',
      },
    ],
  },
  {
    id: 'robot', name: 'Robot',
    matches: ['robot', 'rover', 'drive', 'wheels', 'line follower'],
    slots: [
      {
        metric: 'stall_current', category: 'power', unit: 'mA', comparator: '<=',
        consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'What motors, and what do they draw when stalled?',
      },
      {
        metric: 'runtime', category: 'power', unit: 'months', comparator: '>=',
        consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How long should it run on a charge?',
      },
    ],
  },
  {
    id: 'data-logger', name: 'Data logger',
    matches: ['logger', 'log', 'record', 'sd card', 'datalogger'],
    slots: [
      {
        metric: 'sample_interval', category: 'performance', unit: 's',
        comparator: '==', consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How often does it record?',
      },
      {
        metric: 'storage_duration', category: 'performance', unit: 'days',
        comparator: '>=', consumedBy: ['TEST_PLAN'],
        prompt: 'How much history must it hold before you collect it?',
      },
    ],
  },
  {
    id: 'display', name: 'Display device',
    matches: ['display', 'screen', 'e-ink', 'oled', 'lcd', 'dashboard'],
    slots: [
      {
        metric: 'refresh_interval', category: 'performance', unit: 's',
        comparator: '==', consumedBy: ['CHECK_POWER_BUDGET'], default: 60,
        prompt: 'How often does the display update?',
      },
    ],
  },
  {
    id: 'gateway', name: 'Gateway / bridge',
    matches: ['gateway', 'bridge', 'hub', 'router', 'relay station'],
    slots: [
      {
        metric: 'node_count', category: 'performance', unit: 'count',
        comparator: '<=', consumedBy: ['TEST_PLAN'],
        prompt: 'How many devices does it serve?',
      },
    ],
  },
];

export function suggestArchetype(intent: string): Archetype | undefined {
  const text = intent.toLowerCase();
  return ARCHETYPES.find((a) => a.matches.some((m) => text.includes(m)));
}

/** Universal core plus the archetype's slots, de-duplicated by metric. */
export function slotsFor(archetypeId?: string): RequirementSlot[] {
  const extra =
    ARCHETYPES.find((a) => a.id === archetypeId)?.slots ?? [];
  const seen = new Set<string>();
  const out: RequirementSlot[] = [];
  for (const slot of [...UNIVERSAL_SLOTS, ...extra]) {
    if (seen.has(slot.metric)) continue;
    seen.add(slot.metric);
    out.push(slot);
  }
  return out;
}
