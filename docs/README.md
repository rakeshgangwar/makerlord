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

A maker has an idea and wants to end up with something manufacturable. Today
that means crossing four tool boundaries, losing information at every handoff,
and nothing anywhere checks *"is the circuit in front of me safe to switch on?"*
CircuitKing is one continuous path — **idea → simulate → prototype → product →
production** — built on a single decision: **one structured circuit model is the
source of truth, and every artefact is a projection of it.** That's what makes
correctness computable rather than decorative, because you cannot run a
design-rule check on an image. At every stage the language model proposes and
something deterministic disposes.

## The arc, and where each stage stands

| # | Stage | Deterministic arbiter | State |
|---|---|---|---|
| 1 | **Idea** — intent to circuit | our rule engine | Planned (Slices 0–1) |
| 2 | **Test digitally** — simulate | ngspice | Not yet specced |
| 3 | **Prototype** — breadboard, gated | the student's multimeter | Planned (Slices 0–1) ★ |
| 4 | **Product** — schematic, PCB, enclosure | `kicad-cli erc/drc` | Not yet specced |
| 5 | **Production** — Gerbers, BOM, STEP | DFM + fab validation | Not yet specced |

★ **Stage 3 is the wedge.** Stages 4–5 are largely solved by mature open-source
tools that need driving; safe physical prototyping with real verification is the
part nobody has built. Build it first.

## Slice status

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
| — | Simulation, PCB export, enclosure, production | **Vision only** — see [decisions.md D22](decisions.md) |

Nothing is built yet. The design and the plan for Slices 0–1 are complete; the
production half of the arc is agreed in principle and not yet specified.
