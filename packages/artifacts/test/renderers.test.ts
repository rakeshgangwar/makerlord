import { describe, expect, it } from 'vitest';
import type { Board, Circuit } from '@makerlord/circuit';
import type { Footprint, PartDefinition } from '@makerlord/parts';
import type { Trace } from '@makerlord/sim';
import { renderBreadboard } from '../src/renderers/breadboard.js';
import { renderBlockDiagram } from '../src/renderers/blocks.js';
import { layoutSchematic, renderSchematic } from '../src/renderers/schematic.js';
import { waveformView } from '../src/renderers/waveform.js';

const board: Board = {
  id: 't',
  grid: {
    pitch: 7.2,
    holes: {
      a1: { col: 0, row: 0 }, a2: { col: 1, row: 0 },
      b1: { col: 0, row: 1 }, b2: { col: 1, row: 1 },
    },
  },
  buses: [],
};

const led: Footprint = { pins: { cathode: [0, 0], anode: [1, 0] } };

const circuit: Circuit = {
  boardId: 't',
  parts: [
    { ref: 'LED1', defId: 'led', placement: { originHole: 'a1', orientation: 0 } },
  ],
  wires: [{ id: 'w1', from: 'b1', to: 'b2', color: 'red' }],
  intent: [],
};

describe('renderers are deterministic projections (D2)', () => {
  it('breadboard: byte-identical across runs — a real equality assertion', () => {
    const a = renderBreadboard(board, circuit, new Map([['led', led]]));
    const b = renderBreadboard(board, circuit, new Map([['led', led]]));
    expect(a).toBe(b);
    expect(a).toContain('data-hole="a1"');
    expect(a).toContain('data-wire="w1"');
    expect(a).toContain('data-part="LED1"');
  });

  it('breadboard: selection is marked, not restyled into a fork', () => {
    const svg = renderBreadboard(board, circuit, new Map([['led', led]]), 'LED1');
    expect(svg).toContain('data-selected="true"');
  });

  it('block diagram: deterministic with links and sourcing labels', () => {
    const blocks = [
      {
        id: 'mcu', name: 'controller',
        sourcing: { type: 'buy' as const, partId: 'esp32' },
        interfaces: [{ id: 'rail', kind: 'power' as const, direction: 'provides' as const }],
      },
      {
        id: 'led', name: 'indicator',
        sourcing: { type: 'undecided' as const },
        interfaces: [{ id: 'vin', kind: 'power' as const, direction: 'consumes' as const }],
      },
    ];
    const links = [{
      from: { blockId: 'mcu', interfaceId: 'rail' },
      to: { blockId: 'led', interfaceId: 'vin' },
    }];
    const a = renderBlockDiagram(blocks, links);
    expect(a).toBe(renderBlockDiagram(blocks, links));
    expect(a).toContain('data-block="mcu"');
    expect(a).toContain('undecided');
    expect(a).toContain('data-link="mcu.rail→led.vin"');
  });
});

describe('the shared schematic layout engine (D27)', () => {
  const defs = new Map<string, PartDefinition>([
    ['led', {
      id: 'led', title: 'LED', family: 'LED', properties: {},
      pins: [
        { id: 'c0', name: 'cathode', role: 'passive' },
        { id: 'c1', name: 'anode', role: 'passive' },
      ],
      buses: [], views: {},
    }],
    ['res', {
      id: 'res', title: 'R', family: 'Resistor', properties: {},
      pins: [
        { id: 'c0', name: 'Pin 0', role: 'passive' },
        { id: 'c1', name: 'Pin 1', role: 'passive' },
      ],
      buses: [], views: {},
    }],
  ]);

  const c: Circuit = {
    boardId: 't',
    parts: [{ ref: 'R1', defId: 'res' }, { ref: 'LED1', defId: 'led' }],
    wires: [],
    intent: [
      { name: 'mid', members: [{ ref: 'R1', pin: 'Pin 1' }, { ref: 'LED1', pin: 'anode' }] },
    ],
  };

  it('the layout is exported separately from the SVG — one engine, two consumers', () => {
    const layout = layoutSchematic(c, defs);
    expect(layout.symbols.map((s) => s.ref)).toEqual(['R1', 'LED1']);
    expect(layout.nets[0]!.points).toHaveLength(2);
    // The SVG is a projection of exactly that layout.
    const svg = renderSchematic(c, defs);
    expect(svg).toBe(renderSchematic(c, defs));
    expect(svg).toContain('data-net="mid"');
    expect(svg).toContain('data-part="R1"');
  });
});

describe('waveform view', () => {
  it('normalises a trace into pixel points with ranges', () => {
    const trace: Trace = { columns: [[0, 1, 2, 3], [0, 5, 2.5, 5]] };
    const v = waveformView(trace, 100, 50);
    expect(v.points).toHaveLength(4);
    expect(v.points[0]).toEqual({ x: 0, y: 50 });   // min y at the bottom
    expect(v.xRange).toEqual([0, 3]);
    expect(v.yRange).toEqual([0, 5]);
  });

  it('downsamples long traces', () => {
    const trace: Trace = {
      columns: [
        Array.from({ length: 10_000 }, (_, i) => i),
        Array.from({ length: 10_000 }, (_, i) => Math.sin(i / 100)),
      ],
    };
    expect(waveformView(trace, 800, 200, 500).points.length).toBeLessThanOrEqual(500);
  });
});
