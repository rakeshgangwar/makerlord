import type { HoleGrid, PartDefinition } from '@makerlord/parts';

export interface Board {
  id: string;
  grid: HoleGrid;
  /** Each entry is a set of hole ids that are electrically one node. */
  buses: string[][];
}

export function makeBoard(id: string, grid: HoleGrid, def: PartDefinition): Board {
  const known = new Set(Object.keys(grid.holes));
  const buses = def.buses.map((b) => {
    const members = b.members.filter((m) => known.has(m));
    if (members.length === 0) {
      throw new Error(`board ${id}: bus ${b.id} has no members present in the grid`);
    }
    return members;
  });
  return { id, grid, buses };
}

export function holeAt(board: Board, col: number, row: number): string | undefined {
  for (const [hole, cell] of Object.entries(board.grid.holes)) {
    if (cell.col === col && cell.row === row) return hole;
  }
  return undefined;
}
