// The bundled build runs in-process with no optional 'web-worker' require —
// which the SvelteKit SSR bundler would otherwise chase and fail on.
import ElkDefault from 'elkjs/lib/elk.bundled.js';
import type { ELK as ElkApi, ElkNode, ElkExtendedEdge } from 'elkjs';
import type { Circuit } from '@makerlord/circuit';
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import { glyphFor, drawGlyph, type Glyph } from './glyphs.js';
import { buildLadder, type LadderModel } from './ladder.js';

const ELK = ElkDefault as unknown as new () => ElkApi;

/**
 * Schematic v3: electrical-convention layout for ladder circuits (source
 * left, supply bus top, return bus bottom, one row per parallel branch,
 * glyphs oriented by current direction) with the D45 ELK path as the
 * fallback for anything non-ladder. Deterministic; `data-part`/`data-net`
 * attributes are the contract the virtual bench animates.
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
  points: [number, number][];
  segments: [number, number][][];
}

export interface SchematicLayout {
  symbols: SymbolPlacement[];
  nets: NetRoute[];
  width: number;
  height: number;
}

type Profiles = ReadonlyMap<string, SafetyProfile> | undefined;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function valueLabel(defId: string, profiles: Profiles): string | undefined {
  const p = profiles?.get(defId) as { resistanceOhms?: number; forwardVoltageV?: number } | undefined;
  if (p?.resistanceOhms !== undefined) return `${p.resistanceOhms}Ω`;
  if (p?.forwardVoltageV !== undefined) return `${p.forwardVoltageV}V`;
  return undefined;
}

// ── the conventional ladder drawing ───────────────────────────────────

const ELEM_W = 88;
const ELEM_H = 36;
const ELEM_GAP = 40;
const ROW_H = 78;
const X_BAT = 58;
const X_FEED = 128;

function renderLadder(
  model: LadderModel,
  circuit: Circuit,
  defs: ReadonlyMap<string, PartDefinition>,
  selectedRef: string | undefined,
  profiles: Profiles,
): string {
  const nB = model.branches.length;
  const maxLen = Math.max(...model.branches.map((b) => b.elements.length));
  const x0 = X_FEED + 34;
  const xC = x0 + maxLen * (ELEM_W + ELEM_GAP) - ELEM_GAP + 34;
  const supplyY = 36;
  const yOf = (i: number): number => supplyY + ROW_H * (i + 1);
  const returnY = supplyY + ROW_H * (nB + 1);
  const width = xC + 56;
  const height = returnY + 44;

  const wire = (net: string, pts: [number, number][], heavy = false): string =>
    `<polyline data-net="${esc(net)}" points="${pts.map((p) => p.join(',')).join(' ')}" ` +
    `fill="none" stroke="#0a7d33" stroke-width="${heavy ? 2 : 1.4}"/>`;
  const dot = (x: number, y: number): string =>
    `<circle cx="${x}" cy="${y}" r="2.6" fill="#0a7d33"/>`;

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-renderer="schematic" data-layout="ladder" font-family="Archivo, system-ui, sans-serif">`,
    `<rect width="${width}" height="${height}" fill="#fff"/>`,
  ];

  // Source: vertical battery between the buses at the left edge.
  const midY = (supplyY + returnY) / 2;
  const halfSpan = 24;
  out.push(`<g data-part="${esc(model.source.ref)}"${model.source.ref === selectedRef ? ' data-selected="true"' : ''}>`);
  out.push(wire(model.source.plusNet, [[X_BAT, supplyY], [X_BAT, midY - halfSpan]], true));
  out.push(wire(model.source.minusNet, [[X_BAT, midY + halfSpan], [X_BAT, returnY]], true));
  out.push(
    `<g transform="translate(${X_BAT + 14}, ${midY - halfSpan}) rotate(90)">${drawGlyph('battery', halfSpan * 2, 28)}</g>`,
  );
  out.push(
    `<text x="${X_BAT - 12}" y="${midY + 4}" font-size="9" font-family="IBM Plex Mono, monospace" text-anchor="end">${esc(model.source.ref)}</text>`,
  );
  out.push('</g>');

  // Supply bus + feeder (one net, one polyline): battery + → top bus → down the taps.
  out.push(wire(model.source.plusNet, [[X_BAT, supplyY], [X_FEED, supplyY], [X_FEED, yOf(nB - 1)]], true));
  // Return collector + bottom bus.
  out.push(wire(model.source.minusNet, [[xC, yOf(0)], [xC, returnY], [X_BAT, returnY]], true));

  model.branches.forEach((branch, i) => {
    const y = yOf(i);
    // Feeder tap → first element.
    out.push(wire(branch.nets[0]!, [[X_FEED, y], [x0, y]]));
    if (i !== nB - 1) out.push(dot(X_FEED, y));
    branch.elements.forEach((el, k) => {
      const x = x0 + k * (ELEM_W + ELEM_GAP);
      const def = defs.get(el.defId);
      const glyph = glyphFor(def);
      const selected = el.ref === selectedRef;
      const flip = el.flipped ? ` transform="translate(${x + ELEM_W}, ${y - ELEM_H / 2}) scale(-1,1)"` : ` transform="translate(${x}, ${y - ELEM_H / 2})"`;
      out.push(`<g data-part="${esc(el.ref)}"${selected ? ' data-selected="true"' : ''}>`);
      if (selected) {
        out.push(`<rect x="${x - 4}" y="${y - ELEM_H / 2 - 4}" width="${ELEM_W + 8}" height="${ELEM_H + 8}" fill="none" stroke="#1d4ed8" stroke-width="1.6" rx="4"/>`);
      }
      out.push(`<g${flip}>${drawGlyph(glyph, ELEM_W, ELEM_H)}</g>`);
      out.push(
        `<text x="${x + ELEM_W / 2}" y="${y - ELEM_H / 2 - 8}" font-size="9.5" font-family="IBM Plex Mono, monospace" text-anchor="middle">${esc(el.ref)}</text>`,
      );
      const value = valueLabel(el.defId, profiles);
      if (value) {
        out.push(
          `<text x="${x + ELEM_W / 2}" y="${y + ELEM_H / 2 + 13}" font-size="9" font-family="IBM Plex Mono, monospace" fill="#4c555c" text-anchor="middle">${esc(value)}</text>`,
        );
      }
      out.push('</g>');
      // Wire to the next element (or the collector).
      const xEnd = x + ELEM_W;
      const xNext = k === branch.elements.length - 1 ? xC : x0 + (k + 1) * (ELEM_W + ELEM_GAP);
      out.push(wire(branch.nets[k + 1]!, [[xEnd, y], [xNext, y]]));
    });
    if (i !== 0) out.push(dot(xC, y));
  });

  out.push('</svg>');
  return out.join('\n');
}

// ── the ELK fallback (D45) for non-ladder circuits ────────────────────

const TWO_PIN_W = 72;
const TWO_PIN_H = 28;
const BOX_W = 96;
const BOX_ROW = 12;

function nodeFor(ref: string, def: PartDefinition | undefined): ElkNode {
  const glyph = glyphFor(def);
  const pins = def?.pins ?? [];
  if (glyph !== 'box') {
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
  const known = new Set(children.flatMap((n) => (n.ports ?? []).map((p) => p.id)));

  const edges: ElkExtendedEdge[] = [];
  for (const net of circuit.intent) {
    const ports = net.members
      .map((m) => `${m.ref}::${m.pin}`)
      .filter((id) => known.has(id));
    for (let i = 1; i < ports.length; i += 1) {
      edges.push({ id: `${net.name}#${i}`, sources: [ports[i - 1]!], targets: [ports[i]!] });
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

  return { symbols, nets, width: graph.width ?? 400, height: graph.height ?? 300 };
}

async function renderElk(
  circuit: Circuit,
  defs: ReadonlyMap<string, PartDefinition>,
  selectedRef?: string,
): Promise<string> {
  const layout = await layoutSchematic(circuit, defs);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" data-renderer="schematic" data-layout="elk">`,
    `<rect width="${layout.width}" height="${layout.height}" fill="#fff"/>`,
  ];

  for (const net of layout.nets) {
    for (const seg of net.segments) {
      lines.push(
        `<polyline data-net="${esc(net.name)}" points="${seg.map(([x, y]) => `${x},${y}`).join(' ')}" ` +
          'fill="none" stroke="#0a7d33" stroke-width="1.3"/>',
      );
    }
    for (const [x, y] of net.points) {
      const touching = net.segments.filter((seg) =>
        seg.some(([sx, sy]) => sx === x && sy === y),
      ).length;
      if (touching > 1) lines.push(`<circle cx="${x}" cy="${y}" r="2" fill="#0a7d33"/>`);
    }
  }

  for (const sym of layout.symbols) {
    const selected = sym.ref === selectedRef;
    const inner = drawGlyph(sym.glyph, sym.width, sym.height);
    lines.push(
      `<g data-part="${esc(sym.ref)}" transform="translate(${sym.x},${sym.y})"${selected ? ' data-selected="true"' : ''}>` +
        (selected
          ? `<rect x="-3" y="-3" width="${sym.width + 6}" height="${sym.height + 6}" fill="none" stroke="#1d4ed8" stroke-width="1.6" rx="3"/>`
          : '') +
        inner +
        `<text x="${sym.width / 2}" y="-5" font-size="9" font-family="monospace" text-anchor="middle">${esc(sym.ref)}</text>` +
        (sym.glyph === 'box'
          ? sym.pins
              .map(
                (p) =>
                  `<circle cx="${p.x - sym.x}" cy="${p.y - sym.y}" r="1.6" fill="#111"/>` +
                  `<text x="${p.x - sym.x < sym.width / 2 ? p.x - sym.x + 4 : p.x - sym.x - 4}" y="${p.y - sym.y + 3}" ` +
                  `font-size="6.5" text-anchor="${p.x - sym.x < sym.width / 2 ? 'start' : 'end'}">${esc(p.name)}</text>`,
              )
              .join('')
          : '') +
        '</g>',
    );
  }

  lines.push('</svg>');
  return lines.join('\n');
}

export async function renderSchematic(
  circuit: Circuit,
  defs: ReadonlyMap<string, PartDefinition>,
  selectedRef?: string,
  profiles?: Profiles,
): Promise<string> {
  const ladder = buildLadder(circuit, defs);
  if (ladder) return renderLadder(ladder, circuit, defs, selectedRef, profiles);
  return renderElk(circuit, defs, selectedRef);
}
