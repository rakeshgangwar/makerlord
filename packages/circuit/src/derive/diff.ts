import type { IntentNet, PinRef } from '../model.js';
import { pinKey } from '../model.js';
import type { DerivedNet } from './netlist.js';

export type Divergence =
  | { kind: 'split'; net: string; groups: PinRef[][] }
  | { kind: 'merged'; nets: string[]; pins: PinRef[] };

export function diffNetlists(
  intent: IntentNet[],
  derived: DerivedNet[],
): Divergence[] {
  const nodeOf = new Map<string, string>();
  for (const net of derived) {
    for (const p of net.pins) nodeOf.set(pinKey(p), net.id);
  }

  const out: Divergence[] = [];

  // A split: members of one intent net sitting on different derived nodes.
  for (const net of intent) {
    const byNode = new Map<string, PinRef[]>();
    for (const m of net.members) {
      const node = nodeOf.get(pinKey(m));
      if (node === undefined) continue; // not placed yet
      const g = byNode.get(node);
      if (g) g.push(m);
      else byNode.set(node, [m]);
    }
    if (byNode.size > 1) {
      out.push({ kind: 'split', net: net.name, groups: [...byNode.values()] });
    }
  }

  // A merge: one derived node carrying pins from more than one intent net.
  const netOfPin = new Map<string, string>();
  for (const net of intent) {
    for (const m of net.members) netOfPin.set(pinKey(m), net.name);
  }
  for (const node of derived) {
    const names = new Set<string>();
    for (const p of node.pins) {
      const n = netOfPin.get(pinKey(p));
      if (n !== undefined) names.add(n);
    }
    if (names.size > 1) {
      out.push({ kind: 'merged', nets: [...names], pins: node.pins });
    }
  }

  return out;
}
