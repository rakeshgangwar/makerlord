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

  it('block diagram: deterministic with links and sourcing labels', async () => {
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
    const a = await renderBlockDiagram(blocks, links);
    expect(a).toBe(await renderBlockDiagram(blocks, links));
    expect(a).toContain('data-block="mcu"');
    expect(a).toContain('undecided');
    expect(a).toContain('stroke-dasharray');            // undecided LOOKS unfinished
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

  it('the layout is exported separately from the SVG — one engine, two consumers', async () => {
    const layout = await layoutSchematic(c, defs);
    expect(layout.symbols.map((s) => s.ref)).toEqual(['R1', 'LED1']);
    expect(layout.nets[0]!.points).toHaveLength(2);
    // ELK actually routed the net: a polyline exists between the two pins.
    expect(layout.nets[0]!.segments.length).toBeGreaterThanOrEqual(1);
    // The SVG is a projection of exactly that layout — and deterministic.
    const svg = await renderSchematic(c, defs);
    expect(svg).toBe(await renderSchematic(c, defs));
    expect(svg).toContain('data-net="mid"');
    expect(svg).toContain('data-part="R1"');
  });

  it('D45: parts render as real glyphs, not labelled boxes', async () => {
    const svg = await renderSchematic(c, defs);
    // The resistor is a zigzag polyline inside its group; the LED a filled
    // triangle with emission arrows — a family the maker recognises on sight.
    expect(svg).toContain('<polyline points=');
    expect(svg).toContain('<polygon points=');
    const layout = await layoutSchematic(c, defs);
    expect(layout.symbols.find((s) => s.ref === 'R1')!.glyph).toBe('resistor');
    expect(layout.symbols.find((s) => s.ref === 'LED1')!.glyph).toBe('led');
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

describe('schematic v3 — the ladder engine draws by electrical convention', () => {
  const bat = {
    id: 'bat', title: 'Battery block 9V', family: 'battery', properties: {},
    pins: [{ id: 'p0', name: '-', role: 'gnd' }, { id: 'p1', name: '+', role: 'vcc' }],
    buses: [], views: {},
  } as PartDefinition;
  const res = {
    id: 'res', title: 'R', family: 'Resistor', properties: {},
    pins: [{ id: 'c0', name: 'Pin 0', role: 'passive' }, { id: 'c1', name: 'Pin 1', role: 'passive' }],
    buses: [], views: {},
  } as PartDefinition;
  const led = {
    id: 'led', title: 'LED', family: 'LED', properties: {},
    pins: [{ id: 'c0', name: 'cathode', role: 'passive' }, { id: 'c1', name: 'anode', role: 'passive' }],
    buses: [], views: {},
  } as PartDefinition;
  const defs = new Map([['bat', bat], ['res', res], ['led', led]]);

  /** Two parallel branches: R1→LED1 and R2→LED2, LED2 wired REVERSED. */
  const ladder: Circuit = {
    boardId: 't',
    parts: [
      { ref: 'BAT1', defId: 'bat' },
      { ref: 'R1', defId: 'res' }, { ref: 'LED1', defId: 'led' },
      { ref: 'R2', defId: 'res' }, { ref: 'LED2', defId: 'led' },
    ],
    wires: [],
    intent: [
      { name: 'vcc', members: [{ ref: 'BAT1', pin: '+' }, { ref: 'R1', pin: 'Pin 0' }, { ref: 'R2', pin: 'Pin 0' }] },
      { name: 'a', members: [{ ref: 'R1', pin: 'Pin 1' }, { ref: 'LED1', pin: 'anode' }] },
      { name: 'b', members: [{ ref: 'R2', pin: 'Pin 1' }, { ref: 'LED2', pin: 'cathode' }] },
      { name: 'gnd', members: [{ ref: 'LED1', pin: 'cathode' }, { ref: 'LED2', pin: 'anode' }, { ref: 'BAT1', pin: '-' }] },
    ],
  };

  it('extracts the ladder: two ordered branches with per-segment nets', async () => {
    const { buildLadder } = await import('../src/renderers/ladder.js');
    const m = buildLadder(ladder, defs)!;
    expect(m).not.toBeNull();
    expect(m.source.ref).toBe('BAT1');
    expect(m.branches.map((b) => b.elements.map((e) => e.ref))).toEqual([
      ['R1', 'LED1'], ['R2', 'LED2'],
    ]);
    expect(m.branches[0]!.nets).toEqual(['vcc', 'a', 'gnd']);
  });

  it('SAFETY: a reversed polarized element renders flipped — the drawing never lies', async () => {
    const { buildLadder } = await import('../src/renderers/ladder.js');
    const m = buildLadder(ladder, defs)!;
    const led1 = m.branches.flatMap((b) => b.elements).find((e) => e.ref === 'LED1')!;
    const led2 = m.branches.flatMap((b) => b.elements).find((e) => e.ref === 'LED2')!;
    expect(led1.flipped).toBe(false);   // current enters at anode — correct
    expect(led2.flipped).toBe(true);    // current enters at cathode — draw flipped
    const svg = await renderSchematic(ladder, defs);
    expect(svg).toContain('data-layout="ladder"');
    expect(svg).toContain('scale(-1,1)');
  });

  it('is deterministic, keeps data-net segments, and labels values from profiles', async () => {
    const profiles = new Map([
      ['res', { resistanceOhms: 220 }],
      ['led', { forwardVoltageV: 2 }],
    ]) as never;
    const a = await renderSchematic(ladder, defs, undefined, profiles);
    expect(a).toBe(await renderSchematic(ladder, defs, undefined, profiles));
    expect(a).toContain('data-net="vcc"');
    expect(a).toContain('data-net="gnd"');
    expect(a).toContain('220Ω');
    expect(a).toContain('2V');
  });

  it('a non-ladder circuit falls back to the ELK path', async () => {
    const noSource: Circuit = {
      boardId: 't',
      parts: [{ ref: 'R1', defId: 'res' }, { ref: 'LED1', defId: 'led' }],
      wires: [],
      intent: [{ name: 'mid', members: [{ ref: 'R1', pin: 'Pin 1' }, { ref: 'LED1', pin: 'anode' }] }],
    };
    const svg = await renderSchematic(noSource, defs);
    expect(svg).toContain('data-layout="elk"');
  });
});
