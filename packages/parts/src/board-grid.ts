export interface HoleGrid {
  pitch: number;
  holes: Record<string, { col: number; row: number }>;
}

const HOLE_RADIUS = 2.394;
const EXPECTED_PITCH = 7.2;
// |x - round(x)| is always <= 0.5, so a 0.5 tolerance could never fire.
// Measured worst-case deviation across all 420 real holes is 0.0004 lattice
// units; 0.1 leaves 250x margin while still failing loudly on real drift.
const TOLERANCE = 0.1;

/** `<g id="A98pin">` … first child path's absolute moveto. */
const HOLE_GROUP = /<g\s+id="([A-Za-z]+\d+)pin"\s*>([\s\S]*?)<\/g>/g;
const FIRST_MOVETO = /M\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)/;

export function extractHoleGrid(svgText: string): HoleGrid {
  const centres: { id: string; x: number; y: number }[] = [];

  for (const m of svgText.matchAll(HOLE_GROUP)) {
    const id = m[1]!;
    const move = FIRST_MOVETO.exec(m[2]!);
    if (!move) continue;
    centres.push({
      id,
      x: Number(move[1]) + HOLE_RADIUS,
      y: Number(move[2]),
    });
  }

  if (centres.length === 0) throw new Error('board-grid: no hole groups found');

  const minX = Math.min(...centres.map((c) => c.x));
  const minY = Math.min(...centres.map((c) => c.y));

  const holes: HoleGrid['holes'] = {};
  for (const c of centres) {
    const colF = (c.x - minX) / EXPECTED_PITCH;
    const rowF = (c.y - minY) / EXPECTED_PITCH;
    const col = Math.round(colF);
    const row = Math.round(rowF);
    if (
      Math.abs(colF - col) > TOLERANCE ||
      Math.abs(rowF - row) > TOLERANCE
    ) {
      throw new Error(
        `board-grid: hole ${c.id} at (${c.x}, ${c.y}) is off the ${EXPECTED_PITCH} lattice`,
      );
    }
    holes[c.id] = { col, row };
  }

  return { pitch: EXPECTED_PITCH, holes };
}
