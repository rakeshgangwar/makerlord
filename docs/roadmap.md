# Roadmap — Idea to Product

The product is a **companion for the maker's whole journey**, not a tool for one
stage of it. This document maps that journey, states what the assistant does at
each step, and sequences the build.

Read [vision.md](vision.md) first for the why. This is the what and the when.

---

## 1. The journey, honestly

Makers don't move through a pipeline. They loop, backtrack, and abandon. But the
stages are real, and **most projects die at a predictable one:**

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  ▼                                                          │
① IDEA ──► ② FEASIBILITY ──► ③ REQUIREMENTS ──► ④ ARCHITECTURE
                                                             │
  ┌──────────────────────────────────────────────────────────┘
  ▼
⑤ SIMULATE ──► ⑥ PROTOTYPE ──► ⑦ FIRMWARE ──► ⑧ DEBUG ──┐
                    ▲                                    │
                    └────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────┐
  ▼                                                      │
⑨ PCB ──► ⑩ MECHANICAL ──► ⑪ MANUFACTURING PREP ─────────┘
  │
  ▼
⑫ FABRICATE ──► ⑬ FIRST ARTICLE ──► ⑭ TEST ──► ⑮ COMPLIANCE
                                                     │
                                                     ▼
                                          ⑯ DOCUMENT ──► ⑰ PRODUCE ──► v2
```

**The three graveyards**, and what kills people at each:

| Where projects die | Why |
|---|---|
| **⑥ Prototype** | It doesn't work and they can't tell why. Or something burns. |
| **⑨ PCB** | The jump to eCAD is a new discipline with a brutal learning curve |
| **⑮ Compliance / ⑰ Produce** | Cost, certification, and yield are invisible until they bite |

Our current design covers ⑥ well and sketches ④, ⑨–⑪. Everything else is new.

---

## 2. What changes architecturally

**The circuit model becomes a project model.** Same principle — one source of
truth, everything else a projection — but it accumulates facets as the project
moves:

```
Project
├── intent            the original ask, in the maker's words
├── requirements      testable, with numbers
├── architecture      blocks, make/buy decisions
├── circuit           netlist + placement          ← what we've designed
├── firmware          pin map + application code
├── board             schematic, layout, DRC state
├── mechanical        enclosure, fit constraints
├── manufacturing     BOM, DFM, cost model, fab files
├── validation        test plan, results, first-article data
└── history           decisions, failures, what was tried  ← the differentiator
```

That last one matters more than it looks. **A complete assistant remembers the
journey** — what was tried, what failed, why a part was chosen. That context is
what makes it a companion rather than seventeen disconnected tools.

**The verification principle scales unchanged.** Every stage keeps an arbiter:

| Stage | Deterministic arbiter |
|---|---|
| Requirements | Structural check: is every requirement measurable? |
| Architecture | Power budget, interface compatibility, pin count |
| Circuit | Our rule engine |
| Simulate | ngspice |
| Prototype | The maker's multimeter, against predicted values |
| Firmware | `arduino-cli` compile + hardware/firmware cross-checks |
| PCB | `kicad-cli sch erc` / `pcb drc` |
| Mechanical | CadQuery geometry — collision and fit checks |
| Manufacturing | DFM rules + fab-house validation APIs |
| Cost | BOM arithmetic against real quantity pricing |
| Compliance | ⚠️ **Checklist only — cannot be verified by us.** See §6 |

---

## 3. Stage by stage

### ① Idea → ② Feasibility

**New. Cheap. High value.** The agent researches prior art — has someone built
this, what did they use, what went wrong — and gives an honest verdict on
whether it's achievable with hobbyist means, roughly what it costs, and roughly
how long it takes.

*Why it matters:* the cheapest project is the one you don't start. A tool that
occasionally says "buy this £30 product instead, here's why building it costs
more" earns trust that pays back everywhere else.

### ③ Requirements

**New, and quietly load-bearing.** Convert vague wants into testable numbers:

> *"It should last a long time on battery"*
> → **"≥6 months on 2×AA, one reading per hour, at 0–40 °C"**

*Why it matters:* this is what makes everything downstream **computable**. You
cannot check a power budget against "a long time." Every later verification
depends on the requirements being numeric.

### ④ Architecture

**Partly designed.** Block diagram, part selection, and crucially the
**make/buy decision** — often the right answer is "use the module, don't design
the board." Power budget and interface compatibility checked here, before any
circuit exists.

### ⑤ Simulate

**New.** ngspice from our netlist. Catches design errors before parts are
bought. Distinct from the DC solver, which predicts multimeter readings for the
gate and must stay fast and always-available.

### ⑥ Prototype ★ **the wedge**

**Designed — Slices 0–1.** Breadboard layout, step sequence, safety rules,
measurement gate. The part nobody else has built.

### ⑦ Firmware · ⑧ Debug

**Specced — Slice 3.** Pin map derived from the netlist so code and circuit
cannot drift; compile-verified before the maker sees it; hardware/firmware
cross-checks that catch faults neither model sees alone. Debug is the guided
binary search using predicted node voltages.

### ⑨ PCB

**Specced.** Netlist → SKiDL → KiCad; hierarchical schematic generation;
`kicad-cli` for ERC, DRC and fab output. Orchestration of mature tools.

### ⑩ Mechanical ★ **second differentiator**

**Specced.** Enclosure *derived from the board* — cutouts at real connector
positions, standoffs at real mounting holes, internal height from the tallest
component. STEP for CAD, STL to print.

*Why it matters:* the PCB path is well-trodden. **The ECAD→MCAD handoff is where
people still lose days**, and for a maker with a printer it closes the loop with
no fab at all.

### ⑪ Manufacturing prep

**New.** DFM checks against the chosen fab's real capabilities, panelisation,
assembly files, and — the one that decides whether a project becomes a product —
**cost modelling at quantity 1 / 10 / 100 / 1000.**

*Why it matters:* hobbyists systematically discover unit economics too late. A
board that costs £48 at qty 1 and £9 at qty 100 is a completely different
decision, and nobody tells them until they've committed.

### ⑫ Fabricate · ⑬ First article

**New.** Quote comparison and order placement against fab APIs, then a
structured first-article check: does the board that arrived match the design?

### ⑭ Test

**New.** A test plan generated from the requirements — every numeric requirement
becomes a check — plus **design for test**: test points on the PCB, a go/no-go
script, a fixture if the volume justifies it.

### ⑮ Compliance ⚠️

**New, and the honest limit.** See §6.

### ⑯ Document

**New, and nearly free.** Assembly guide, user manual, BOM, schematics — all
projections of a model that already holds everything.

### ⑰ Produce · v2

**New.** Yield tracking, revision control on the design, diffing v1 against v2,
and carrying field failures back into the requirements.

---

## 4. Where the real work is

Not evenly distributed. Being clear about this protects the schedule:

| Stage group | New engineering | Differentiation |
|---|---|---|
| ①–③ Idea, feasibility, requirements | **Low** — LLM + search | Medium (trust) |
| ④ Architecture | Medium | Medium |
| ⑤ Simulate | Low — drive ngspice | Low |
| **⑥ Prototype** | **High** | **Very high ★** |
| ⑦–⑧ Firmware, debug | High | High (cross-checks) |
| ⑨ PCB | Low–medium — orchestration | Low |
| **⑩ Mechanical** | Medium | **High ★** |
| ⑪ Manufacturing prep | Medium | Medium (cost modelling) |
| ⑫–⑭ Fab, test | Medium | Medium |
| ⑮–⑰ Compliance, docs, produce | Low–medium — knowledge | Medium |

**Differentiation concentrates in three places:** the safety-gated prototype, the
hardware/firmware cross-checks, and the board-derived enclosure. Everything else
is orchestration of tools that already exist — valuable for *continuity*, but not
where the moat is.

---

## 5. Sequencing

Four phases. **Each is independently valuable and shippable** — that's the
mitigation for a scope this large. If you stop after Phase 1, you have a good
product.

### Phase 1 — "Design it and build it safely"
> ① Idea · ② Feasibility · ③ Requirements · ④ Architecture · ⑥ Prototype

The front door plus the wedge. A maker arrives with an idea and leaves with a
working, safety-verified breadboard. **Complete on its own.**

*Contains: Slices 0, 1, 1b. Plus new work on stages ①–④, which is mostly prompt
and part-library work rather than engine work.*

### Phase 2 — "Make it actually work"
> ⑤ Simulate · ⑦ Firmware · ⑧ Debug

Turns a correct circuit into a working device. Firmware is the big one; the
hardware/firmware cross-checks are the most novel thing in this phase.

*Contains: Slice 3, plus ngspice integration.*

### Phase 3 — "Make it real"
> ⑨ PCB · ⑩ Mechanical · ⑫ Fabricate

Breadboard becomes a board in a case. Mostly orchestration, except the enclosure
derivation. **This is the phase that makes the product feel like it keeps its
promise** — the maker crosses the graveyard at ⑨ without learning eCAD.

*Contains: KiCad export, CadQuery enclosure, fab APIs.*

### Phase 4 — "Make it a product"
> ⑪ Manufacturing prep · ⑬ First article · ⑭ Test · ⑮ Compliance · ⑯ Document · ⑰ Produce

Cost, yield, certification, documentation. Lower engineering effort but high
domain knowledge. Serves the minority who go this far — and is the reason they
choose this tool over a point solution in the first place.

### Why this order

- **Phase 1 front-loads the front door.** Stages ①–③ are cheap and they're where
  the maker actually arrives. Building the wedge without them means the product
  starts at "here's a netlist," which nobody has.
- **Phase 2 before Phase 3** because a prototype that doesn't run isn't worth
  turning into a PCB.
- **Phase 3 before Phase 4** because most makers stop at "it works in a case."

---

## 6. Honest limits

**Compliance cannot be verified by us.** CE, UKCA, FCC, RoHS. The assistant can:

- maintain the technical file
- apply design rules that help pass (filtering, shielding, using *certified*
  power modules rather than designing mains circuitry)
- run a pre-compliance checklist
- say plainly what needs a test house and roughly what it costs

It **cannot** certify, and must never imply a design is compliant. This gets the
same treatment as the mains boundary — a stated limit, delivered leading with
what we *can* do.

**Other things we won't pretend at:** controlled-impedance and RF layout,
multi-layer HDI, safety-critical anything, high-volume DFM beyond a few hundred
units. In each case the right behaviour is to say so and hand over cleanly.

---

## 7. Risks

**Breadth beating depth is the central bet, and it can lose.** A complete
assistant that's mediocre everywhere loses to point tools that are excellent at
one thing. The bet is that **continuity** — the model carrying forward, nothing
lost at a handoff — outweighs per-stage excellence. That requires every stage be
*good enough*, and one stage be genuinely great. Hence the wedge.

**The part library is the schedule.** Every stage past ④ needs more facets per
part: safety profile, SPICE model, KiCad symbol and footprint. Progress is gated
on parts curated, not code written. This is the most under-estimated cost in the
whole plan.

**Scope collapse.** Seventeen stages is an invitation to build all of them
badly. The phase structure exists to prevent that — **do not start Phase 2 until
Phase 1 is genuinely good.**

**Two UX claims remain unvalidated** — that build/bring-up modes are the real
differentiation, and that the diagnostic is the feature people talk about. Both
are cheap to test by watching four people build a circuit from a written guide,
and both would reorder priorities if wrong.

---

## 8. Not building

- **A CAD editor.** We generate and verify; KiCad and CadQuery own editing.
- **A simulator.** ngspice exists.
- **A fab or a marketplace.** We produce files and hand them over.
- **Certification services.** Preparation only.
- **Mains design.** Refusal rule, permanently.
