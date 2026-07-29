import { describe, expect, it } from 'vitest';
import type { Board } from '../src/board.js';
import { resolvePins, rotate } from '../src/derive/placement.js';

const board: Board = {
  id: 't',
  grid: {
    pitch: 7.2,
    holes: {
      h00: { col: 0, row: 0 }, h10: { col: 1, row: 0 },
      h20: { col: 2, row: 0 }, h30: { col: 3, row: 0 },
      h40: { col: 4, row: 0 }, h01: { col: 0, row: 1 },
      hneg: { col: -1, row: 0 },
    },
  },
  buses: [],
};

const led = { pins: { cathode: [0, 0] as [number, number], anode: [1, 0] as [number, number] } };

describe('rotate', () => {
  it('leaves offsets alone at 0 degrees', () => {
    expect(rotate([1, 0], 0)).toEqual([1, 0]);
  });

  it('turns clockwise at 90 degrees', () => {
    expect(rotate([1, 0], 90)).toEqual([0, 1]);
  });

  it('inverts at 180 degrees', () => {
    expect(rotate([1, 0], 180)).toEqual([-1, 0]);
  });

  it('turns anticlockwise at 270 degrees', () => {
    expect(rotate([1, 0], 270)).toEqual([0, -1]);
  });
});

describe('resolvePins', () => {
  it('maps each pin to the hole under it', () => {
    const out = resolvePins(
      board,
      { ref: 'LED1', defId: 'led', placement: { originHole: 'h00', orientation: 0 } },
      led,
    );
    expect(out).toEqual([
      { pin: { ref: 'LED1', pin: 'cathode' }, hole: 'h00' },
      { pin: { ref: 'LED1', pin: 'anode' }, hole: 'h10' },
    ]);
  });

  it('honours orientation', () => {
    const out = resolvePins(
      board,
      { ref: 'LED1', defId: 'led', placement: { originHole: 'h00', orientation: 90 } },
      led,
    );
    expect(out.find((p) => p.pin.pin === 'anode')?.hole).toBe('h01');
  });

  it('returns nothing for an unplaced part', () => {
    expect(resolvePins(board, { ref: 'LED1', defId: 'led' }, led)).toEqual([]);
  });

  it('throws when the origin hole is not on the board', () => {
    expect(() =>
      resolvePins(
        board,
        { ref: 'LED1', defId: 'led', placement: { originHole: 'nope', orientation: 0 } },
        led,
      ),
    ).toThrow(/nope/);
  });

  it('throws when a pin lands off the board', () => {
    expect(() =>
      resolvePins(
        board,
        { ref: 'R1', defId: 'r', placement: { originHole: 'h40', orientation: 0 } },
        { pins: { a: [0, 0], b: [4, 0] } },
      ),
    ).toThrow(/off the board/i);
  });
});
