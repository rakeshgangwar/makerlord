import type { Circuit } from '@makerlord/circuit';
import type { PartDefinition } from '@makerlord/parts';

/**
 * The shared schematic layout engine (UI spec §6, D27). The LAYOUT is
 * exported separately from the SVG projection so the KiCad generator can
 * consume the same placement — one engine's bugs, not two.
 */
export interface SymbolPlacement {
  ref: string;
  x: number;
  y: number;
  pins: { name: string; x: number; y: number }[];
}

export interface NetRoute {
  name: string;
  points: [number, number][];
}

export interface SchematicLayout {
  symbols: SymbolPlacement[];
  nets: NetRoute[];
  width: number;
  height: number;
}

const SYM_W = 80;
const SYM_H = 60;
const GAP = 50;
const PER_ROW = 4;

export function layoutSchematic(
  circuit: Circuit,
  defs: ReadonlyMap<string, PartDefinition>,
): SchematicLayout {
  const symbols: SymbolPlacement[] = circuit.parts.map((inst, i) => {
    const x = 20 + (i % PER_ROW) * (SYM_W + GAP);
    const y = 20 + Math.floor(i / PER_ROW) * (SYM_H + GAP);
    const pins = (defs.get(inst.defId)?.pins ?? []).map((pin, j) => ({
      name: pin.name,
      x,
      y: y + 12 + j * 10,
    }));
    return { ref: inst.ref, x, y, pins };
  });

  const pinPoint = new Map<string, [number, number]>();
  for (const s of symbols) {
    for (const p of s.pins) pinPoint.set(`${s.ref}.${p.name}`, [p.x, p.y]);
  }

  // Orthogonal net routes through each net's members, in declaration order.
  const nets: NetRoute[] = circuit.intent.map((net) => {
    const points: [number, number][] = [];
    for (const m of net.members) {
      const pt = pinPoint.get(`${m.ref}.${m.pin}`);
      if (pt) points.push(pt);
    }
    return { name: net.name, points };
  });

  const rows = Math.max(1, Math.ceil(circuit.parts.length / PER_ROW));
  return {
    symbols,
    nets,
    width: 20 * 2 + PER_ROW * SYM_W + (PER_ROW - 1) * GAP,
    height: 20 * 2 + rows * SYM_H + (rows - 1) * GAP,
  };
}

export function renderSchematic(
  circuit: Circuit,
  defs: ReadonlyMap<string, PartDefinition>,
  selectedRef?: string,
): string {
  const layout = layoutSchematic(circuit, defs);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" data-renderer="schematic">`,
  ];

  for (const net of layout.nets) {
    for (let i = 1; i < net.points.length; i += 1) {
      const [x1, y1] = net.points[i - 1]!;
      const [x2, y2] = net.points[i]!;
      // Orthogonal: horizontal then vertical.
      lines.push(
        `<polyline data-net="${net.name}" points="${x1},${y1} ${x2},${y1} ${x2},${y2}" ` +
          'fill="none" stroke="#0a7d33" stroke-width="1.2"/>',
      );
    }
  }

  for (const s of layout.symbols) {
    const selected = s.ref === selectedRef;
    lines.push(
      `<g data-part="${s.ref}"${selected ? ' data-selected="true"' : ''}>` +
        `<rect x="${s.x}" y="${s.y}" width="${SYM_W}" height="${SYM_H}" ` +
        `fill="none" stroke="${selected ? '#1d4ed8' : '#111'}" stroke-width="${selected ? 2.2 : 1.2}"/>` +
        `<text x="${s.x + SYM_W / 2}" y="${s.y - 4}" font-size="10" text-anchor="middle">${s.ref}</text>` +
        s.pins
          .map(
            (p) =>
              `<circle cx="${p.x}" cy="${p.y}" r="1.8" fill="#111"/>` +
              `<text x="${p.x + 4}" y="${p.y + 3}" font-size="7">${p.name}</text>`,
          )
          .join('') +
        '</g>',
    );
  }

  lines.push('</svg>');
  return lines.join('\n');
}
