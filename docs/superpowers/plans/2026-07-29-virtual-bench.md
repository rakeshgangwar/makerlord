# The virtual bench — stage ⑤ comes alive

**Why:** `sim_run` returns a correct, dead table. The simulate stage should
*feel* like a bench: current you can see, a meter you can probe with, a knob
you can turn — every number from the solver, never invented (D3: the engine
is the only source of truth; presentation animates, never estimates).

**Depends on:** the ladder layout (animations ride on clean net routes).

## Tasks

- [x] Engine: `runOpAnalysis` returns `branchCurrentsMa` (per-element,
      computed deterministically from solved node voltages + the netlist:
      ΔV/R per resistor; series elements share their chain's current via the
      ladder model) and `netVoltages` keyed by INTENT net name (the UI's
      `data-net` vocabulary), plus per-element ratings context
      (maxCurrentMa / powerRatingW from profiles). Tests against the
      known-answer circuits.
- [x] `SimulateView.svelte` replaces the generic inspect surface at ⑤:
      the schematic inline (not `<img>`), with overlays:
      - current flow: animated marching dashes per `data-net` segment,
        speed ∝ branch current, direction from the solver
      - LED glow: halo intensity ∝ I/maxCurrent
      - node voltage badges on the rails, colour-ramped
- [x] The solve as a moment: Run plays the convergence ladder (`op` →
      `gmin` → `source-stepping`) as sequential rung lights — the TRUE rung
      sequence from the result — then numbers land
- [x] Virtual multimeter: click a net → voltage readout in a meter face;
      click a part → current, dissipation, and a %-of-rating bar (trains
      the D15 number-first habit before the physical gate)
- [x] The what-if knob: supply-voltage slider (5–12V, 0.5V steps),
      debounced `sim_stimulus_set` + `sim_run` on drag; flows, glows and
      meter readings respond live
- [x] Tests for the pure pieces (current computation, ramp mapping,
      rating bars); live browser verification of the full loop
