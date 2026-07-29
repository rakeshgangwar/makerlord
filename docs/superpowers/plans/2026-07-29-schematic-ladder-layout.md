# Schematic v3 — electrical-convention layout (the ladder engine)

**Why:** D45 gave us real glyphs and ELK routing, but generic layered layout
doesn't know electricity: series chains scatter across rows, returns wander,
and polarized glyphs can point against the actual current — a correctness
lie, not a cosmetic one. No OSS library solves analog schematic placement
(KiCad doesn't auto-place; netlistsvg's analog skin is cruder than ours);
the state of the art is domain logic feeding a router — so that's what we
build. ELK remains the fallback for non-ladder subgraphs.

**Invariants:** deterministic for a given circuit; `data-net`/`data-part`
attributes preserved (the virtual bench animates them next); layout separable
from SVG (D27 — KiCad sheets later); glyph orientation must follow current
direction, always.

## Tasks

- [x] `renderers/glyphs.ts` — extract the D45 glyph vocabulary to a shared
      module (resistor, led, diode, battery, capacitor, box) + `flip` support
- [x] `renderers/ladder.ts` — `buildLadder(circuit, defs)`: identify the
      source (battery-family part with +/− pins) and its supply/return nets;
      collapse series chains (a net touching exactly two element pins is a
      series junction); group chains into parallel branches; compute per-
      element orientation (anode faces supply). Returns null for anything
      non-ladder → ELK fallback. Pure, unit-tested.
- [x] Conventional placement in `schematic.ts`: source vertical at left
      between the buses, supply bus top, return bus bottom, one horizontal
      row per branch, feeder/collector verticals with junction dots at taps,
      per-segment `data-net` tags (supply, inter-element nets, return)
- [x] Value labels from safety profiles (`220Ω`, `2.0V`) beneath refs;
      profiles threaded through writers + the render endpoint
- [x] Tests: ladder extraction (two-branch circuit → 2 chains, correct
      order); reversed-LED flip; non-ladder falls back to ELK (existing
      contract test keeps passing); determinism; junction dots present
- [x] Regenerate committed artifacts, deploy, verify stage ⑤ + Files view
      live, screenshot against the hand-drawn reference
