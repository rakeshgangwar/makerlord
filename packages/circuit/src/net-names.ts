/**
 * Human names for internal net ids (2026-07-30 audit). The `connect`
 * tool mints `net_<ref>_<pin>__<ref>_<pin>`; that id is stable and
 * machine-good, but it is not maker-facing language. Every display
 * surface (UI, CLI, agent prose) should route net ids through here.
 * Hole-derived ids (buses, rails) pass through untouched — they are
 * opaque by decision and carry no parseable meaning.
 */
export function humanNetName(name: string): string {
  const m = /^net_(.+)$/.exec(name);
  if (!m) return name;
  const sides = m[1]!.split('__');
  const ends = sides.map((side) => {
    const i = side.indexOf('_');
    return i === -1 ? side : `${side.slice(0, i)}.${side.slice(i + 1)}`;
  });
  if (ends.length === 2) return `${ends[0]} → ${ends[1]}`;
  return ends.join(' → ');
}
