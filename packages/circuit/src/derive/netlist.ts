import type { Footprint } from '@makerlord/parts';
import type { Board } from '../board.js';
import type { Circuit, PinRef } from '../model.js';
import { resolvePins } from './placement.js';
import { DisjointSet } from './union-find.js';

export interface DerivedNet {
  id: string;
  holes: string[];
  pins: PinRef[];
}

export function deriveNetlist(
  board: Board,
  circuit: Circuit,
  footprints: Map<string, Footprint>,
): DerivedNet[] {
  const ds = new DisjointSet();
  for (const hole of Object.keys(board.grid.holes)) ds.add(hole);

  // 1. The board's own topology.
  for (const bus of board.buses) {
    const first = bus[0]!;
    for (const member of bus.slice(1)) ds.union(first, member);
  }

  // 2. Jumper wires.
  for (const w of circuit.wires) ds.union(w.from, w.to);

  // 3. Part pins land in holes.
  const pinsByHole = new Map<string, PinRef[]>();
  for (const inst of circuit.parts) {
    if (!inst.placement) continue;
    const footprint = footprints.get(inst.defId);
    if (!footprint) {
      throw new Error(`netlist: no footprint for part definition ${inst.defId}`);
    }
    for (const { pin, hole } of resolvePins(board, inst, footprint)) {
      const list = pinsByHole.get(hole);
      if (list) list.push(pin);
      else pinsByHole.set(hole, [pin]);
    }
  }

  return ds.groups().map((holes) => {
    const sorted = [...holes].sort();
    return {
      id: sorted[0]!,
      holes: sorted,
      pins: sorted.flatMap((h) => pinsByHole.get(h) ?? []),
    };
  });
}
