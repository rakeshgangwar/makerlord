import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpusRoot, extractHoleGrid, loadPart } from '@makerlord/parts';
import { holeAt, makeBoard } from '../src/board.js';

function halfBreadboard() {
  const grid = extractHoleGrid(
    readFileSync(join(corpusRoot(), 'svg/core/breadboard/halfBreadboard.svg'), 'utf8'),
  );
  return makeBoard('half', grid, loadPart('core/halfBreadboard.fzp'));
}

describe('makeBoard', () => {
  it('carries all 420 holes', () => {
    expect(Object.keys(halfBreadboard().grid.holes)).toHaveLength(420);
  });

  it('carries the 68 declared buses as member lists', () => {
    expect(halfBreadboard().buses).toHaveLength(68);
  });

  it('models a column group as five tied holes', () => {
    const b = halfBreadboard();
    const col = b.buses.find((m) => m.includes('A98'));
    expect(col?.sort()).toEqual(['A98', 'B98', 'C98', 'D98', 'E98']);
  });

  it('models a rail as a long bus', () => {
    const b = halfBreadboard();
    const rail = b.buses.find((m) => m.includes('X1'));
    expect(rail!.length).toBe(25);
  });
});

describe('holeAt', () => {
  it('finds a hole by its grid cell', () => {
    const b = halfBreadboard();
    const a1 = b.grid.holes.A1!;
    expect(holeAt(b, a1.col, a1.row)).toBe('A1');
  });

  it('returns undefined for an empty cell', () => {
    expect(holeAt(halfBreadboard(), 9999, 9999)).toBeUndefined();
  });
});
