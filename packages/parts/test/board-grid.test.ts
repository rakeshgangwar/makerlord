import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpusRoot } from '../src/corpus.js';
import { extractHoleGrid } from '../src/board-grid.js';

function halfBreadboardSvg(): string {
  return readFileSync(
    join(corpusRoot(), 'svg/core/breadboard/halfBreadboard.svg'),
    'utf8',
  );
}

describe('extractHoleGrid', () => {
  it('finds all 420 holes', () => {
    const g = extractHoleGrid(halfBreadboardSvg());
    expect(Object.keys(g.holes)).toHaveLength(420);
  });

  it('reports the 0.1 inch pitch', () => {
    expect(extractHoleGrid(halfBreadboardSvg()).pitch).toBeCloseTo(7.2, 2);
  });

  it('puts A1, E1 and X1 in the same column', () => {
    const g = extractHoleGrid(halfBreadboardSvg());
    expect(g.holes.A1!.col).toBe(g.holes.E1!.col);
    expect(g.holes.X1!.col).toBe(g.holes.A1!.col);
  });

  it('separates rows A through E by one lattice step each', () => {
    const g = extractHoleGrid(halfBreadboardSvg());
    expect(g.holes.E1!.row - g.holes.A1!.row).toBe(4);
  });

  it('places A98 to the left of A1, proving names do not imply order', () => {
    const g = extractHoleGrid(halfBreadboardSvg());
    expect(g.holes.A98!.col).toBeLessThan(g.holes.A1!.col);
  });

  it('assigns every hole a distinct cell', () => {
    const g = extractHoleGrid(halfBreadboardSvg());
    const cells = Object.values(g.holes).map((h) => `${h.col},${h.row}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('throws when hole centres are not on a regular lattice', () => {
    const bad = `<svg><g id="A1pin"><path d="M0,0c0-1,1-2,2-2"/></g>
      <g id="B1pin"><path d="M3.3,0c0-1,1-2,2-2"/></g></svg>`;
    expect(() => extractHoleGrid(bad)).toThrow(/lattice/i);
  });
});
