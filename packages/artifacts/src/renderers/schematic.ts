// The bundled build runs in-process with no optional 'web-worker' require —
// which the SvelteKit SSR bundler would otherwise chase and fail on.
import ElkDefault from 'elkjs/lib/elk.bundled.js';
import type { ELK as ElkApi, ElkNode, ElkExtendedEdge } from 'elkjs';

// elkjs ships CJS with a default-export .d.ts; under NodeNext the runtime
// default IS the constructor — the cast just tells TS what Node already does.
const ELK = ElkDefault as unknown as new () => ElkApi;
import type { Circuit } from '@makerlord/circuit';
import type { PartDefinition } from '@makerlord/parts';

/**
 * The shared schematic layout engine (UI spec §6, D27, D45). ELK's layered
 * algorithm does placement and orthogonal routing; the LAYOUT is exported
 * separately from the SVG projection so the KiCad generator can consume the
 * same placement — one engine's bugs, not two. ELK is deterministic for a
 * given graph, which keeps the golden-equality property.
 */
export interface SymbolPlacement {
  ref: string;
  x: number;
  y: number;
  width: number;
  height: number;
  glyph: Glyph;
  pins: { name: string; x: number; y: number }[];
}

export interface NetRoute {
  name: string;
  /** Pin endpoints, for connectivity consumers (KiCad). */
  points: [number, number][];
  /** Routed orthogonal polylines from ELK, for drawing. */
  segments: [number, number][][];
}

export interface SchematicLayout {
  symbols: SymbolPlacement[];
  nets: NetRoute[];
  width: number;
  height: number;
}

export type Glyph =
  | 'resistor' | 'led' | 'diode' | 'battery' | 'capacitor' | 'box';

/** Family strings come from the .fzp corpus — match loosely, fall back to a box. */
export function glyphFor(def: PartDefinition | undefined): Glyph {
  const family = (def?.family ?? '').toLowerCase();
  const title = (def?.title ?? '').toLowerCase();
  const twoPin = (def?.pins.length ?? 0) === 2;
  const hay = `${family} ${title}`;
  if (/resistor/.test(hay) && twoPin) return 'resistor';
  if (/led|light.emitting/.test(hay)) return 'led';
  if (/diode|rectifier/.test(hay) && twoPin) return 'diode';
  if (/battery/.test(hay) && twoPin) return 'battery';
  if (/capacitor/.test(hay) && twoPin) return 'capacitor';
  return 'box';
}

const TWO_PIN_W = 72;
const TWO_PIN_H = 28;
const BOX_W = 96;
const BOX_ROW = 12;

function nodeFor(ref: string, def: PartDefinition | undefined): ElkNode {
  const glyph = glyphFor(def);
  const pins = def?.pins ?? [];
  if (glyph !== 'box') {
    // Two-terminal symbol: one port each side, mid-height.
    return {
      id: ref,
      width: TWO_PIN_W,
      height: TWO_PIN_H,
      layoutOptions: { portConstraints: 'FIXED_POS' },
      ports: pins.slice(0, 2).map((pin, i) => ({
        id: `${ref}::${pin.name}`,
        width: 0.1,
        height: 0.1,
        x: i === 0 ? 0 : TWO_PIN_W,
        y: TWO_PIN_H / 2,
      })),
    };
  }
  const height = BOX_ROW * Math.max(2, Math.ceil(pins.length / 2)) + BOX_ROW;
  return {
    id: ref,
    width: BOX_W,
    height,
    layoutOptions: { portConstraints: 'FIXED_POS' },
    ports: pins.map((pin, i) => ({
      id: `${ref}::${pin.name}`,
      width: 0.1,
      height: 0.1,
      // Alternate west/east, walking down each side.
      x: i % 2 === 0 ? 0 : BOX_W,
      y: BOX_ROW + Math.floor(i / 2) * BOX_ROW,
    })),
  };
}

export async function layoutSchematic(
  circuit: Circuit,
  defs: ReadonlyMap<string, PartDefinition>,
): Promise<SchematicLayout> {
  const elk = new ELK();
  const children = circuit.parts.map((inst) => nodeFor(inst.ref, defs.get(inst.defId)));
  const known = new Set(
    children.flatMap((n) => (n.ports ?? []).map((p) => p.id)),
  );

  // A net of N members becomes a chain of N-1 edges sharing the net name.
  const edges: ElkExtendedEdge[] = [];
  for (const net of circuit.intent) {
    const ports = net.members
      .map((m) => `${m.ref}::${m.pin}`)
      .filter((id) => known.has(id));
    for (let i = 1; i < ports.length; i += 1) {
      edges.push({
        id: `${net.name}#${i}`,
        sources: [ports[i - 1]!],
        targets: [ports[i]!],
      });
    }
  }

  const graph: ElkNode = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '28',
      'elk.layered.spacing.nodeNodeBetweenLayers': '44',
      'elk.padding': '[top=16,left=16,bottom=16,right=16]',
    },
    children,
    edges,
  });

  const symbols: SymbolPlacement[] = (graph.children ?? []).map((node) => {
    const inst = circuit.parts.find((p) => p.ref === node.id)!;
    return {
      ref: node.id,
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? TWO_PIN_W,
      height: node.height ?? TWO_PIN_H,
      glyph: glyphFor(defs.get(inst.defId)),
      pins: (node.ports ?? []).map((p) => ({
        name: p.id.split('::')[1]!,
        x: (node.x ?? 0) + (p.x ?? 0),
        y: (node.y ?? 0) + (p.y ?? 0),
      })),
    };
  });

  const pinPoint = new Map<string, [number, number]>();
  for (const s of symbols) {
    for (const p of s.pins) pinPoint.set(`${s.ref}::${p.name}`, [p.x, p.y]);
  }

  const nets: NetRoute[] = circuit.intent.map((net) => {
    const points: [number, number][] = [];
    for (const m of net.members) {
      const pt = pinPoint.get(`${m.ref}::${m.pin}`);
      if (pt) points.push(pt);
    }
    const segments: [number, number][][] = ((graph.edges ?? []) as ElkExtendedEdge[])
      .filter((e: ElkExtendedEdge) => e.id.startsWith(`${net.name}#`))
      .flatMap((e: ElkExtendedEdge) =>
        (e.sections ?? []).map((s): [number, number][] => [
          [s.startPoint.x, s.startPoint.y],
          ...(s.bendPoints ?? []).map((b): [number, number] => [b.x, b.y]),
          [s.endPoint.x, s.endPoint.y],
        ]),
      );
    return { name: net.name, points, segments };
  });

  return {
    symbols,
    nets,
    width: graph.width ?? 400,
    height: graph.height ?? 300,
  };
}

/** The glyph vocabulary: drawn in local coords for a w×h symbol, pin A at
 *  (0, h/2), pin B at (w, h/2). Stroke only — theme-neutral. */
function drawGlyph(g: Glyph, w: number, h: number): string {
  const m = h / 2;
  const s = 'fill="none" stroke="#111" stroke-width="1.4"';
  switch (g) {
    case 'resistor': {
      const zig = [
        [0, m], [w * 0.2, m], [w * 0.27, m - 8], [w * 0.4, m + 8],
        [w * 0.53, m - 8], [w * 0.66, m + 8], [w * 0.76, m], [w, m],
      ].map(([x, y]) => `${x},${y}`).join(' ');
      return `<polyline points="${zig}" ${s}/>`;
    }
    case 'led':
    case 'diode': {
      const a = w * 0.34;
      const b = w * 0.62;
      const tri = `<line x1="0" y1="${m}" x2="${a}" y2="${m}" ${s}/>` +
        `<polygon points="${a},${m - 8} ${a},${m + 8} ${b},${m}" fill="#111"/>` +
        `<line x1="${b}" y1="${m - 8}" x2="${b}" y2="${m + 8}" ${s}/>` +
        `<line x1="${b}" y1="${m}" x2="${w}" y2="${m}" ${s}/>`;
      if (g === 'diode') return tri;
      const arrow = (dx: number): string =>
        `<line x1="${w * 0.42 + dx}" y1="${m - 9}" x2="${w * 0.5 + dx}" y2="${m - 16}" ${s}/>` +
        `<polygon points="${w * 0.5 + dx},${m - 16} ${w * 0.46 + dx},${m - 12} ${w * 0.49 + dx},${m - 11}" fill="#111"/>`;
      return tri + arrow(0) + arrow(8);
    }
    case 'battery': {
      const long = w * 0.44;
      const short = w * 0.56;
      return `<line x1="0" y1="${m}" x2="${long}" y2="${m}" ${s}/>` +
        `<line x1="${long}" y1="${m - 11}" x2="${long}" y2="${m + 11}" ${s} stroke-width="2"/>` +
        `<line x1="${short}" y1="${m - 5}" x2="${short}" y2="${m + 5}" ${s}/>` +
        `<line x1="${short}" y1="${m}" x2="${w}" y2="${m}" ${s}/>` +
        `<text x="${long - 5}" y="${m - 14}" font-size="8" text-anchor="end">+</text>`;
    }
    case 'capacitor': {
      const p1 = w * 0.44;
      const p2 = w * 0.56;
      return `<line x1="0" y1="${m}" x2="${p1}" y2="${m}" ${s}/>` +
        `<line x1="${p1}" y1="${m - 10}" x2="${p1}" y2="${m + 10}" ${s}/>` +
        `<line x1="${p2}" y1="${m - 10}" x2="${p2}" y2="${m + 10}" ${s}/>` +
        `<line x1="${p2}" y1="${m}" x2="${w}" y2="${m}" ${s}/>`;
    }
    case 'box':
      return `<rect x="0" y="0" width="${w}" height="${h}" fill="#fff" stroke="#111" stroke-width="1.2"/>`;
  }
}

export async function renderSchematic(
  circuit: Circuit,
  defs: ReadonlyMap<string, PartDefinition>,
  selectedRef?: string,
): Promise<string> {
  const layout = await layoutSchematic(circuit, defs);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" data-renderer="schematic">`,
    `<rect width="${layout.width}" height="${layout.height}" fill="#fff"/>`,
  ];

  for (const net of layout.nets) {
    for (const seg of net.segments) {
      lines.push(
        `<polyline data-net="${net.name}" points="${seg.map(([x, y]) => `${x},${y}`).join(' ')}" ` +
          'fill="none" stroke="#0a7d33" stroke-width="1.3"/>',
      );
    }
    // Junction dots where more than two segment ends meet a pin.
    for (const [x, y] of net.points) {
      const touching = net.segments.filter((seg) =>
        seg.some(([sx, sy]) => sx === x && sy === y),
      ).length;
      if (touching > 1) {
        lines.push(`<circle cx="${x}" cy="${y}" r="2" fill="#0a7d33"/>`);
      }
    }
  }

  for (const sym of layout.symbols) {
    const selected = sym.ref === selectedRef;
    const inner = drawGlyph(sym.glyph, sym.width, sym.height);
    lines.push(
      `<g data-part="${sym.ref}" transform="translate(${sym.x},${sym.y})"${selected ? ' data-selected="true"' : ''}>` +
        (selected
          ? `<rect x="-3" y="-3" width="${sym.width + 6}" height="${sym.height + 6}" fill="none" stroke="#1d4ed8" stroke-width="1.6" rx="3"/>`
          : '') +
        inner +
        `<text x="${sym.width / 2}" y="-5" font-size="9" font-family="monospace" text-anchor="middle">${sym.ref}</text>` +
        (sym.glyph === 'box'
          ? sym.pins
              .map(
                (p) =>
                  `<circle cx="${p.x - sym.x}" cy="${p.y - sym.y}" r="1.6" fill="#111"/>` +
                  `<text x="${p.x - sym.x < sym.width / 2 ? p.x - sym.x + 4 : p.x - sym.x - 4}" y="${p.y - sym.y + 3}" ` +
                  `font-size="6.5" text-anchor="${p.x - sym.x < sym.width / 2 ? 'start' : 'end'}">${p.name}</text>`,
              )
              .join('')
          : '') +
        '</g>',
    );
  }

  lines.push('</svg>');
  return lines.join('\n');
}
