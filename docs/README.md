# CircuitKing — Documentation

**A complete assistant for the maker's journey, from an idea to a real
product.** It researches feasibility, turns vague wants into testable
requirements, designs the circuit, simulates it, walks the maker through a
safety-gated breadboard build, writes the firmware, turns the result into a PCB
and an enclosure, and prepares it for manufacture.

## Reading order

Start at the top. Each document assumes the ones above it.

| # | Document | What it is | When you need it |
|---|---|---|---|
| 1 | [vision.md](vision.md) | What we're building and why it's different | First. Everything else serves this. |
| 2 | [roadmap.md](roadmap.md) | **The 17-stage journey**, sequenced into four phases | Right after the vision |
| 3 | [glossary.md](glossary.md) | Domain terms — netlist, bus, `.fzp`, flyback, DFM | Keep open while reading 4 and 5 |
| 4 | [superpowers/specs/2026-07-28-circuitking-design.md](superpowers/specs/2026-07-28-circuitking-design.md) | **The design spec** for the prototype stage, all 14 sections | Before writing any code |
| 5 | [superpowers/plans/2026-07-28-slices-0-and-1.md](superpowers/plans/2026-07-28-slices-0-and-1.md) | Implementation plan, 25 TDD tasks | When you start building |
| 6 | [decisions.md](decisions.md) | Decision log — what was chosen, what was rejected, why | When tempted to change something |
| 7 | [corpus-findings.md](corpus-findings.md) | Measured facts about the Fritzing corpus | When touching the ETL or board model |
| 8 | [references.md](references.md) | External sources, licences, API limits | When integrating anything external |
| 9 | [HANDOFF.md](HANDOFF.md) | Machine migration context | When moving to the PopOS box |

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

## The four phases

Full detail in [roadmap.md](roadmap.md). Each phase is independently valuable —
stop after Phase 1 and you still have a good product.

| Phase | Covers | State |
|---|---|---|
| **1 — Design it and build it safely** | Idea, feasibility, requirements, architecture, prototype | Slices 0–1 planned; stages 1–4 not yet specced |
| **2 — Make it actually work** | Simulate, firmware, guided debug | Spec only |
| **3 — Make it real** | PCB, enclosure, fabricate | Spec only |
| **4 — Make it a product** | Cost, first article, test, compliance, docs, production | Vision only |

★ **The prototype stage is the wedge.** Most other stages are largely solved by
mature tools that need driving; safe physical prototyping with real verification
is the part nobody has built. Build it first — and don't start Phase 2 until
Phase 1 is genuinely good.

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
