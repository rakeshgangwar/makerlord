import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Board } from '../src/board.js';
import type { Circuit, PartInstance } from '../src/model.js';
import type { DerivedNet } from '../src/derive/netlist.js';
import type { RuleContext } from '../src/rules/engine.js';
import { makeContext } from '../src/rules/context.js';

export const board: Board = { id: 't', grid: { pitch: 7.2, holes: {} }, buses: [] };

export function def(
  id: string,
  family: string,
  pins: PartDefinition['pins'],
): PartDefinition {
  return { id, title: id, family, properties: {}, pins, buses: [], views: {} };
}

export const UNO = def('uno', 'microcontroller board (arduino)', [
  { id: 'c0', name: 'GND', role: 'gnd' },
  { id: 'c1', name: '5V', role: 'supply' },
  { id: 'c2', name: '3V3', role: 'supply' },
  { id: 'c3', name: 'D13', role: 'io' },
  { id: 'c4', name: 'D9', role: 'io' },
]);

export const LED = def('led', 'LED', [
  { id: 'c0', name: 'cathode', role: 'passive' },
  { id: 'c1', name: 'anode', role: 'passive' },
]);

export const RESISTOR = def('res', 'Resistor', [
  { id: 'c0', name: '0', role: 'passive' },
  { id: 'c1', name: '1', role: 'passive' },
]);

export const UNO_PROFILE: SafetyProfile = {
  partId: 'uno',
  footprint: { pins: { GND: [0, 0], '5V': [1, 0], '3V3': [2, 0], D13: [3, 0], D9: [4, 0] } },
  logicLevelV: 5,
  pinMaxMa: 20,
  portTotalMaxMa: 100,
  regulatorMaxMa: 400,
  absMaxVoltageV: 5.5,
  hazardClass: 'none',
};

export const LED_PROFILE: SafetyProfile = {
  partId: 'led',
  footprint: { pins: { cathode: [0, 0], anode: [1, 0] } },
  polarity: 'polarized',
  forwardVoltageV: 2,
  maxCurrentMa: 20,
  hazardClass: 'none',
};

export const RESISTOR_PROFILE: SafetyProfile = {
  partId: 'res',
  footprint: { pins: { '0': [0, 0], '1': [4, 0] } },
  polarity: 'nonpolarized',
  resistanceOhms: 220,
  powerRatingW: 0.25,
  hazardClass: 'none',
};

export interface FixtureOpts {
  parts?: PartInstance[];
  nets?: DerivedNet[];
  defs?: [string, PartDefinition][];
  profiles?: [string, SafetyProfile][];
  intent?: Circuit['intent'];
}

export function fixtureContext(o: FixtureOpts = {}): RuleContext {
  const circuit: Circuit = {
    boardId: 't',
    parts: o.parts ?? [],
    wires: [],
    intent: o.intent ?? [],
  };
  return makeContext(
    board,
    circuit,
    o.nets ?? [],
    [],
    new Map(o.defs ?? [['uno', UNO], ['led', LED], ['res', RESISTOR]]),
    new Map(
      o.profiles ?? [
        ['uno', UNO_PROFILE],
        ['led', LED_PROFILE],
        ['res', RESISTOR_PROFILE],
      ],
    ),
  );
}

export function net(id: string, pins: DerivedNet['pins']): DerivedNet {
  return { id, holes: [], pins };
}
