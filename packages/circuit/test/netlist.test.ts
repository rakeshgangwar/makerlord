import { describe, expect, it } from 'vitest';
import type { Footprint } from '@makerlord/parts';
import type { Board } from '../src/board.js';
import type { Circuit } from '../src/model.js';
import { deriveNetlist } from '../src/derive/netlist.js';
import { diffNetlists } from '../src/derive/diff.js';

const board: Board = {
  id: 't',
  grid: {
    pitch: 7.2,
    holes: {
      a1: { col: 0, row: 0 }, b1: { col: 0, row: 1 },
      a2: { col: 1, row: 0 }, b2: { col: 1, row: 1 },
      a3: { col: 2, row: 0 }, b3: { col: 2, row: 1 },
    },
  },
  // Column groups: a and b in each column are tied.
  buses: [['a1', 'b1'], ['a2', 'b2'], ['a3', 'b3']],
};

const twoPin: Footprint = { pins: { p: [0, 0], q: [1, 0] } };
const footprints = new Map([['led', twoPin], ['res', twoPin]]);

function circuit(over: Partial<Circuit> = {}): Circuit {
  return { boardId: 't', parts: [], wires: [], intent: [], ...over };
}

describe('deriveNetlist', () => {
  it('ties holes that share a board bus', () => {
    const nets = deriveNetlist(board, circuit(), footprints);
    const withA1 = nets.find((n) => n.holes.includes('a1'));
    expect(withA1?.holes.sort()).toEqual(['a1', 'b1']);
  });

  it('merges nodes joined by a wire', () => {
    const c = circuit({ wires: [{ id: 'w1', from: 'b1', to: 'b2', color: 'red' }] });
    const nets = deriveNetlist(board, c, footprints);
    const n = nets.find((x) => x.holes.includes('a1'))!;
    expect(n.holes.sort()).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('attaches placed part pins to their node', () => {
    const c = circuit({
      parts: [{ ref: 'LED1', defId: 'led', placement: { originHole: 'a1', orientation: 0 } }],
    });
    const nets = deriveNetlist(board, c, footprints);
    const n = nets.find((x) => x.holes.includes('a1'))!;
    expect(n.pins).toEqual([{ ref: 'LED1', pin: 'p' }]);
  });

  it('ignores unplaced parts', () => {
    const c = circuit({ parts: [{ ref: 'LED1', defId: 'led' }] });
    const nets = deriveNetlist(board, c, footprints);
    expect(nets.flatMap((n) => n.pins)).toEqual([]);
  });

  it('throws when a part has no footprint', () => {
    const c = circuit({
      parts: [{ ref: 'X1', defId: 'unknown', placement: { originHole: 'a1', orientation: 0 } }],
    });
    expect(() => deriveNetlist(board, c, footprints)).toThrow(/unknown/);
  });
});

describe('diffNetlists', () => {
  const derived = [
    { id: 'n1', holes: ['a1', 'b1'], pins: [{ ref: 'L1', pin: 'p' }] },
    { id: 'n2', holes: ['a2', 'b2'], pins: [{ ref: 'R1', pin: 'p' }] },
  ];

  it('finds no divergence when intent matches reality', () => {
    const intent = [{ name: 'net_a', members: [{ ref: 'L1', pin: 'p' }] }];
    expect(diffNetlists(intent, derived)).toEqual([]);
  });

  it('reports a split when intended members land on different nodes', () => {
    const intent = [
      { name: 'signal', members: [{ ref: 'L1', pin: 'p' }, { ref: 'R1', pin: 'p' }] },
    ];
    const d = diffNetlists(intent, derived);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: 'split', net: 'signal' });
  });

  it('reports a merge when separate nets share a node', () => {
    const merged = [
      { id: 'n1', holes: ['a1'], pins: [{ ref: 'L1', pin: 'p' }, { ref: 'R1', pin: 'p' }] },
    ];
    const intent = [
      { name: 'vcc', members: [{ ref: 'L1', pin: 'p' }] },
      { name: 'gnd', members: [{ ref: 'R1', pin: 'p' }] },
    ];
    const d = diffNetlists(intent, merged);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: 'merged' });
    expect((d[0] as { nets: string[] }).nets.sort()).toEqual(['gnd', 'vcc']);
  });

  it('ignores intent pins that are not placed yet', () => {
    const intent = [{ name: 'later', members: [{ ref: 'NOTPLACED', pin: 'p' }] }];
    expect(diffNetlists(intent, derived)).toEqual([]);
  });
});
