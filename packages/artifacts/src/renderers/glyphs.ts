import type { PartDefinition } from '@makerlord/parts';

/** The glyph vocabulary (D45): drawn in local coords for a w×h symbol,
 *  pin A at (0, h/2), pin B at (w, h/2). Stroke only — theme-neutral. */
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

export function drawGlyph(g: Glyph, w: number, h: number): string {
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
