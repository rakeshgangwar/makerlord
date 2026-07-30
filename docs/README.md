# MakerLord — Documentation

**A complete assistant for the maker's journey, from an idea to a real
product.** It researches feasibility, turns vague wants into testable
requirements, designs the circuit, simulates it, walks the maker through a
safety-gated breadboard build, writes the firmware, turns the result into a PCB
and an enclosure, and prepares it for manufacture.

> **Project identity.** Renamed from CircuitKing on 2026-07-29 — the old name
> described a circuit tool, and the product is the whole maker journey.
> Domains under consideration: **makerlord.io** / **makerlord.dev**.
> Repo: `github.com/rakeshgangwar/makerlord`. Package scope `@makerlord/*`,
> CLI `maker`, MCP server `maker-mcp`.

## Reading order

Start at the top. Each document assumes the ones above it.

| # | Document | What it is | When you need it |
|---|---|---|---|
| 1 | [vision.md](vision.md) | What we're building and why it's different | First. Everything else serves this. |
| 2 | [roadmap.md](roadmap.md) | **The 17-stage journey**, sequenced into four phases | Right after the vision |
| 3 | [user-journey.md](user-journey.md) | What it feels like to use — surfaces, files, postures | To understand the product as a user |
| 4 | [ai-implementation.md](ai-implementation.md) | How the agent works — ACP/MCP, tools, context, testing | Before building the agent layer |
| 5 | [glossary.md](glossary.md) | Domain terms — netlist, bus, `.fzp`, flyback, DFM | Keep open while reading 6 and 7 |
| 6 | [superpowers/specs/2026-07-28-makerlord-design.md](superpowers/specs/2026-07-28-makerlord-design.md) | **The design spec** for the prototype stage, all 14 sections | Before writing any code |
| 7 | [superpowers/specs/2026-07-29-front-door-design.md](superpowers/specs/2026-07-29-front-door-design.md) | **The design spec** for stages 1-4, the front door | With or before the stage-6 spec |
| 8 | [superpowers/specs/2026-07-29-tool-surface-design.md](superpowers/specs/2026-07-29-tool-surface-design.md) | **The design spec** for the tool core, CLI and MCP server | Before building any agent |
| 9 | [superpowers/specs/2026-07-29-acp-host-design.md](superpowers/specs/2026-07-29-acp-host-design.md) | **The design spec** for `maker-bridge` and the ACP host | After the tool surface |
| 10 | [superpowers/specs/2026-07-29-agent-runtime-design.md](superpowers/specs/2026-07-29-agent-runtime-design.md) | **The design spec** for our own agent — loop, context, personas | After the ACP host |
| 11 | [superpowers/specs/2026-07-29-ui-design.md](superpowers/specs/2026-07-29-ui-design.md) | **The design spec** for the web app, all 17 stages | Before building the front end |
| 12 | [superpowers/specs/2026-07-29-simulation-design.md](superpowers/specs/2026-07-29-simulation-design.md) | **The design spec** for stage ⑤, ngspice | With Phase 2 |
| 13 | [superpowers/specs/2026-07-30-phase-2-3-scoping.md](superpowers/specs/2026-07-30-phase-2-3-scoping.md) | **Scoping** for stages ⑦⑧⑨ — what each spec inherits and must decide | Before the ⑦⑧⑨ specs |
| 14 | [superpowers/specs/2026-07-30-firmware-design.md](superpowers/specs/2026-07-30-firmware-design.md) | **The design spec** for stage ⑦ — the role-symbol contract, cross-checks, compile gate | Before building firmware |
| 14b | [superpowers/specs/2026-07-30-debug-design.md](superpowers/specs/2026-07-30-debug-design.md) | **The design spec** for stage ⑧ — faults as mutations, the guided search | After the firmware spec |
| 14c | [superpowers/specs/2026-07-30-curation-pipeline-design.md](superpowers/specs/2026-07-30-curation-pipeline-design.md) | **The design spec** for the curation pipeline — tiers, proposals, human-only promotion | When growing the library |
| 15 | [superpowers/plans/2026-07-28-slices-0-and-1.md](superpowers/plans/2026-07-28-slices-0-and-1.md) | Implementation plan for the prototype stage, 25 TDD tasks | When you start building |
| 16 | [superpowers/plans/2026-07-29-front-door.md](superpowers/plans/2026-07-29-front-door.md) | Implementation plan for the front door, 12 TDD tasks | After Slices 0-1 |
| 16b | [superpowers/plans/2026-07-30-firmware.md](superpowers/plans/2026-07-30-firmware.md) | Implementation plan for stage ⑦, 18 TDD tasks in three slices | With the firmware spec |
| 16c | [superpowers/plans/2026-07-30-debug.md](superpowers/plans/2026-07-30-debug.md) | Implementation plan for stage ⑧, 10 TDD tasks | With the debug spec |
| 16d | [superpowers/plans/2026-07-30-curation-pipeline.md](superpowers/plans/2026-07-30-curation-pipeline.md) | Implementation plan for the curation pipeline, 8 tasks | With the curation spec |
| 17 | [decisions.md](decisions.md) | Decision log — what was chosen, what was rejected, why | When tempted to change something |
| 18 | [corpus-findings.md](corpus-findings.md) | Measured facts about the Fritzing corpus | When touching the ETL or board model |
| 19 | [references.md](references.md) | External sources, licences, API limits | When integrating anything external |
| 20 | [HANDOFF.md](HANDOFF.md) | Machine migration context | When moving to the PopOS box |
| 21 | [deferred-work.md](deferred-work.md) | Every deferral — why, scope, trigger | When picking up the next piece of work |

Rows 6–12 are the seven design specs. Rows 6–8 and 9–11 are the two clusters
you'll read together: **the stages** (prototype, front door) and **the layers**
(tools, ACP host, agent runtime, UI).

## The one-paragraph version

A maker has an idea and wants to end up with something manufacturable. Today
that means crossing four tool boundaries, losing information at every handoff,
and nothing anywhere checks *"is the circuit in front of me safe to switch on?"*
MakerLord is one continuous path — **idea → simulate → prototype → product →
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
| **1 — Design it and build it safely** | Idea, feasibility, requirements, architecture, prototype | **Fully specced and planned** — 37 TDD tasks across two plans |
| **2 — Make it actually work** | Simulate, firmware, guided debug | **Simulate specced**; firmware and debug spec-sketched |
| **3 — Make it real** | PCB, enclosure, fabricate | Spec only |
| **4 — Make it a product** | Cost, first article, test, compliance, docs, production | Vision only |

The **agent layer and the UI cut across all four phases** and are specced
independently — rows 8–11. They are what any phase is driven through.

★ **The prototype stage is the wedge.** Most other stages are largely solved by
mature tools that need driving; safe physical prototyping with real verification
is the part nobody has built. Build it first — and don't start Phase 2 until
Phase 1 is genuinely good.

## Slice status

| Slice | Scope | State |
|---|---|---|
| 0 | Foundation — ETL, part model, safety overlay | **Built** — 2026-07-29 |
| 1 | Core engine — netlist, rules, gate, build sequence | **Built** — 2026-07-29, 8 rules, 196 tests |
| 1 (UI) | Renderers, four postures, finding surface | **Specced** — needs a plan |
| 1b | Phone companion | **Specced** — it is the app, responsive |
| 2 | Sourcing — BOM, distributor APIs | Spec only |
| 3 | Firmware — codegen, compile sandbox | Spec only |
| 4 | Photo verification | Spec only |
| 5 | Wide domains — drone/robot power budgeting | Spec only |
| — | Simulation | **Specced** — needs a plan |
| — | PCB export, enclosure, production | **Vision only** — see [decisions.md D22](decisions.md) |

**All seven specs are implemented and the product is live at
[makerlord.dev](https://makerlord.dev)** (2026-07-29): Slices 0–1 (the
headless engine with the Tier-1 danger corpus), the front door, the tool
surface (37 tools incl. `decision_record`, `maker` CLI, `maker-mcp`), the ACP
host (cross-brain assertion), the streaming agent runtime, simulation with
real ngspice solves (D43 ceilings verified against physics), the UI (bench
design, live SSE conversation, project selector), and `@makerlord/artifacts`
— every project is a real git repo carrying the user-journey §3 file tree,
committed turn by turn. 501 tests green. Each spec has a ticked implementation
plan in [superpowers/plans/](superpowers/plans/). The production half of the
arc is agreed in principle and not yet specified.
