import type { Board, Circuit } from '@makerlord/circuit';
import { resolvePins } from '@makerlord/circuit';
import type { Footprint } from '@makerlord/parts';

/**
 * Hole-accurate breadboard SVG from the Fritzing geometry (UI spec §6).
 * A deterministic projection of project.json — golden-equality tested.
 */
const HOLE_R = 2.2;
const PITCH = 7.2;
const MARGIN = 14.4;

export function renderBreadboard(
  board: Board,
  circuit: Circuit,
  footprints: ReadonlyMap<string, Footprint>,
  selectedRef?: string,
): string {
  const holes = Object.entries(board.grid.holes);
  const maxCol = Math.max(...holes.map(([, h]) => h.col));
  const maxRow = Math.max(...holes.map(([, h]) => h.row));
  const width = (maxCol + 1) * PITCH + 2 * MARGIN;
  const height = (maxRow + 1) * PITCH + 2 * MARGIN;
  const x = (col: number): number => MARGIN + col * PITCH;
  const y = (row: number): number => MARGIN + row * PITCH;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-renderer="breadboard">`,
    `<rect width="${width}" height="${height}" fill="#f4f1ea"/>`,
  ];

  // Holes, sorted for determinism.
  for (const [id, h] of holes.sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(
      `<circle data-hole="${id}" cx="${x(h.col)}" cy="${y(h.row)}" r="${HOLE_R}" fill="#3a3a3a"/>`,
    );
  }

  // Wires.
  for (const wire of circuit.wires) {
    const a = board.grid.holes[wire.from];
    const b = board.grid.holes[wire.to];
    if (!a || !b) continue;
    lines.push(
      `<line data-wire="${wire.id}" x1="${x(a.col)}" y1="${y(a.row)}" ` +
        `x2="${x(b.col)}" y2="${y(b.row)}" stroke="${wire.color}" stroke-width="2.4" stroke-linecap="round"/>`,
    );
  }

  // Placed parts: a body spanning their resolved pins.
  for (const inst of circuit.parts) {
    if (!inst.placement) continue;
    const footprint = footprints.get(inst.defId);
    if (!footprint) continue;
    const pinHoles = resolvePins(board, inst, footprint)
      .map((p) => board.grid.holes[p.hole]!)
      .filter(Boolean);
    if (pinHoles.length === 0) continue;
    const minX = Math.min(...pinHoles.map((h) => x(h.col))) - HOLE_R * 1.6;
    const maxX = Math.max(...pinHoles.map((h) => x(h.col))) + HOLE_R * 1.6;
    const minY = Math.min(...pinHoles.map((h) => y(h.row))) - HOLE_R * 1.6;
    const maxY = Math.max(...pinHoles.map((h) => y(h.row))) + HOLE_R * 1.6;
    const selected = inst.ref === selectedRef ? ' data-selected="true"' : '';
    lines.push(
      `<g data-part="${inst.ref}"${selected}>` +
        `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" ` +
        `rx="2" fill="#d9822b" fill-opacity="0.85" stroke="${inst.ref === selectedRef ? '#1d4ed8' : '#7c4a12'}" stroke-width="1.2"/>` +
        `<text x="${(minX + maxX) / 2}" y="${minY - 2}" font-size="6" text-anchor="middle">${inst.ref}</text>` +
        `</g>`,
    );
  }

  lines.push('</svg>');
  return lines.join('\n');
}
