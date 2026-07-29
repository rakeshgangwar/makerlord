import type { Footprint } from '@makerlord/parts';
import type { Board } from '../board.js';
import { holeAt } from '../board.js';
import type { Orientation, PartInstance, PinRef } from '../model.js';

export interface PinHole {
  pin: PinRef;
  hole: string;
}

/** Negate without producing -0, which Object.is (and toEqual) distinguishes. */
function neg(n: number): number {
  return n === 0 ? 0 : -n;
}

/** Clockwise on screen: col increases right, row increases down. */
export function rotate(
  [dx, dy]: [number, number],
  orientation: Orientation,
): [number, number] {
  switch (orientation) {
    case 0:
      return [dx, dy];
    case 90:
      return [neg(dy), dx];
    case 180:
      return [neg(dx), neg(dy)];
    case 270:
      return [dy, neg(dx)];
  }
}

export function resolvePins(
  board: Board,
  inst: PartInstance,
  footprint: Footprint,
): PinHole[] {
  const placement = inst.placement;
  if (!placement) return [];

  const origin = board.grid.holes[placement.originHole];
  if (!origin) {
    throw new Error(
      `placement: ${inst.ref} origin hole ${placement.originHole} is not on board ${board.id}`,
    );
  }

  const out: PinHole[] = [];
  for (const [pin, offset] of Object.entries(footprint.pins)) {
    const [dx, dy] = rotate(offset, placement.orientation);
    const hole = holeAt(board, origin.col + dx, origin.row + dy);
    if (!hole) {
      throw new Error(
        `placement: ${inst.ref}.${pin} lands off the board at (${origin.col + dx}, ${origin.row + dy})`,
      );
    }
    out.push({ pin: { ref: inst.ref, pin }, hole });
  }
  return out;
}
