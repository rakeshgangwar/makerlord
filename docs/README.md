# CircuitKing — Documentation

An AI coach for building real circuits safely. Students hold physical
breadboards; the agent designs the circuit, draws it as both schematic and
breadboard, sequences the build step by step, and gates power-up behind
deterministic safety checks.

## Reading order

Start at the top. Each document assumes the ones above it.

| # | Document | What it is | When you need it |
|---|---|---|---|
| 1 | [vision.md](vision.md) | What we're building and why it's different | First. Everything else serves this. |
| 2 | [glossary.md](glossary.md) | Domain terms — netlist, bus, `.fzp`, flyback | Keep open while reading 3 and 4 |
| 3 | [superpowers/specs/2026-07-28-circuitking-design.md](superpowers/specs/2026-07-28-circuitking-design.md) | **The design spec.** Complete architecture, all 14 sections | Before writing any code |
| 4 | [superpowers/plans/2026-07-28-slices-0-and-1.md](superpowers/plans/2026-07-28-slices-0-and-1.md) | Implementation plan, 25 TDD tasks | When you start building |
| 5 | [decisions.md](decisions.md) | Decision log — what was chosen, what was rejected, why | When tempted to change something |
| 6 | [corpus-findings.md](corpus-findings.md) | Measured facts about the Fritzing corpus | When touching the ETL or board model |
| 7 | [references.md](references.md) | External sources, licences, API limits | When integrating anything external |
| 8 | [HANDOFF.md](HANDOFF.md) | Machine migration context | When moving to the PopOS box |

## The one-paragraph version

Every eCAD tool assumes a seated designer with free hands. This one doesn't —
its users are standing at a bench with a breadboard, both hands occupied. The
architecture follows from one decision: **a single structured circuit model is
the source of truth, and every artefact — schematic, breadboard view, build
steps, BOM, firmware pin map — is a projection of it.** That's what makes safety
computable rather than decorative, because you cannot run a design-rule check on
an image. Deterministic rules adjudicate; the language model only explains.

## Status

| Slice | Scope | State |
|---|---|---|
| 0 | Foundation — ETL, part model, safety overlay | Planned |
| 1 | Core engine — netlist, rules, gate, build sequence | Planned |
| 1 (UI) | Renderers, agent loop, three modes | Not yet specced |
| 1b | Phone companion | Not yet specced |
| 2 | Sourcing — BOM, distributor APIs | Spec only |
| 3 | Firmware — codegen, compile sandbox | Spec only |
| 4 | Photo verification | Spec only |
| 5 | Wide domains — drone/robot power budgeting | Spec only |

Nothing is built yet. The design and the plan for Slices 0–1 are complete.
