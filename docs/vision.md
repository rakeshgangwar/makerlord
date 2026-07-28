# Vision

## What this is

**A complete assistant for the maker's journey, from an idea to a real
product.**

Not a circuit tool. Not an eCAD front-end. A companion that stays with one
project from the first vague sentence through to something you could ship —
carrying every decision forward, and verifying at every step.

```
1. IDEA            "I want a soil sensor that tells Home Assistant when to water"
        ↓          feasibility · prior art · testable requirements · architecture
2. TEST DIGITALLY  simulate it before a single component is bought
        ↓
3. PROTOTYPE       build it on a breadboard, safety-gated at every step
        ↓          firmware · guided debugging
4. PRODUCT         real schematic, PCB layout, enclosure, 3D model
        ↓
5. PRODUCTION      Gerbers, BOM, cost model, test plan, documentation
```

That's the summary. The full journey is **seventeen stages** with the loops and
backtracking that real projects have — mapped, sequenced and costed in
[roadmap.md](roadmap.md).

**For makers, builders and hobbyists** — including the ones who might want to
take something all the way to manufacturing. Not several products with handoffs
between them. One path, where every stage is a projection of the same underlying
model.

> **The differentiator is continuity.** Every stage here has a good point tool
> already. What nobody has is a companion that remembers the whole journey —
> what was tried, what failed, why a part was chosen — and loses nothing at a
> handoff.

## The problem

Someone learning electronics destroys components and occasionally hurts
themselves. Not for lack of information — there are a million tutorials — but
because **nothing checks their actual circuit before power is applied.**

And someone who *succeeds* at the breadboard hits a second wall immediately: the
jump from working prototype to manufacturable product means learning eCAD, DFM
rules, mechanical CAD, and fab file formats. Most people stop there. The idea
dies as a breadboard in a drawer.

| Tool class | Examples | Gives you | Can't do |
|---|---|---|---|
| Simulators | Tinkercad, Falstad, Wokwi | Safe experimentation | Anything about the board on your desk |
| eCAD | KiCad, Flux, Altium | Professional design | Assumes you already know what you're doing |
| Mechanical CAD | FreeCAD, Fusion | Enclosures | Disconnected from the electronics |
| LLM chat | ChatGPT, Claude | Answers anything | Confident advice with no way to verify it |

Nobody covers the whole arc, and nobody at all checks *"is the circuit in front
of me safe to switch on?"*

## The core bet

> **Safety and correctness must be computable properties, not generated
> opinions.**

If the AI generates a *picture* of a circuit, the safety promise is theatre —
you cannot run a design-rule check on an image. If it generates a *netlist*,
correctness becomes something you can test, review, version, and cite by rule
ID.

This scales to the whole arc. Every stage has a deterministic verifier:

| Stage | The arbiter |
|---|---|
| Design | Our rule engine — 8+ tested safety rules |
| Simulate | ngspice — does it actually work? |
| Prototype | The student's multimeter, against predicted values |
| Product | `kicad-cli sch erc` and `pcb drc` |
| Production | DFM checks and fab-house validation |

**The language model proposes. Something deterministic disposes.** At every
single stage. That principle is the product.

## One model, five projections

The architecture rests on a single decision: **one structured circuit model is
the source of truth, and every artefact is a projection of it.**

```
                    ┌────────────────────────┐
                    │    CIRCUIT MODEL       │
                    │  netlist · placement   │
                    │  parts · constraints   │
                    └───┬──┬──┬──┬──┬────────┘
        ┌───────────────┘  │  │  │  └───────────────┐
        ▼                  ▼  │  ▼                  ▼
   SPICE netlist    breadboard │ KiCad sch      CadQuery
   (ngspice)          view     │  + PCB         enclosure
        │                      ▼                     │
        │              build sequence                │
        │              + safety gate                 │
        └──────────────────► Gerbers · BOM · STEP ◄──┘
```

Add a stage, add a projection. The model doesn't change shape — it grows
facets.

## Tooling: drive open source, deterministically

Every stage uses open-source tools the agent drives — **preferring CLI and file
formats over interactive automation**, because deterministic beats convenient:

| Stage | Tool | Interface | Licence |
|---|---|---|---|
| Simulate | ngspice | CLI + netlist | GPL |
| Firmware | arduino-cli | CLI | GPL/AGPL |
| Schematic, PCB, fab output | `kicad-cli` | CLI, headless | GPL |
| Autoroute | Freerouting | CLI | GPL |
| Enclosure, 3D | CadQuery | Python library | Apache 2.0 |

`kicad-cli` covers the entire production path — `sch export netlist`, `sch erc`,
`pcb drc`, `pcb export gerbers`, `pcb export step`, `sch export bom` — without a
GUI. All of it runs in CI. All of it is reproducible.

**MCP servers and GUI automation are a last resort**, reserved for genuinely
interactive work like PCB layout refinement. A tool driven by file formats can
be tested; an agent clicking through a GUI cannot.

## Who it's for

Hobbyists, makers and builders — from a teenager with an Arduino starter kit to
someone taking a product to a small production run.

Deliberately **not** vocational electricians: mains AC is out of scope by
design, encoded as a refusal rule. Being 95% right about mains is worse than
being no help at all.

The tool degrades honestly rather than refusing outright. A drone is not a
breadboard project, so it won't draw one — but it will size the battery, budget
the power, and pick the connectors. **Explicit statements of depth beat both
bluffing and closed doors.**

## What's hard to copy

Anyone can wrap a chat interface around a schematic renderer. Five things are
hard:

1. **The safety overlay.** Fritzing gives geometry; only 2–4% of the corpus
   carries electrical limits. The hand-authored hazard metadata is the moat.
2. **The measurement gate.** Never "did you check?" — always "what did it read?"
   A yes/no is compliance theatre; a number is a real check *and* a lesson.
3. **Hardware/firmware cross-checks.** Holding both models catches faults
   neither half can see — a pin set `OUTPUT HIGH` while wired to ground destroys
   the MCU, invisible to any hardware-only or code-only tool.
4. **The diagnostic.** "It doesn't work" opens a targeted binary search, because
   the system knows the intended netlist and the predicted voltage at every node.
5. **Continuity across the arc.** The breadboard you verified becomes the
   schematic, which becomes the PCB, which becomes the enclosure — with no
   re-entry and nothing lost at a handoff.
6. **The ECAD→MCAD handoff.** The enclosure is *derived from the board* —
   cutouts at real connector positions, standoffs at real mounting holes,
   internal height from the tallest component. The PCB path is well-trodden;
   this handoff is where people still lose days, and for a maker with a 3D
   printer it closes the loop with no fab at all.

## Where the wedge is

Stages 4 and 5 are *largely solved* by mature open-source tools that need
driving. Stage 3 — **safe physical prototyping with real verification** — is the
part nobody has built.

So the breadboard coaching loop stays the differentiated core, and the
production arc is orchestration of existing tooling. The hard novel work stays
small; the broad work is integration that can be added incrementally.

**Build the wedge first. It is the thing that is actually new.**

## What success looks like

**Near term.** A student describes what they want, gets a checked circuit and a
build sequence, and the gate catches a mistake that would have cost them a
component. That moment is the product.

**Medium term.** That same student clicks through to a real schematic, a routed
PCB, and an enclosure that fits it — without learning KiCad first.

**Long term.** Someone takes a hobby project to a hundred-unit production run
without ever having opened an eCAD tool, and the design is *correct* because
every stage was verified by something deterministic.

**The failure mode to avoid.** An agent so capable that makers can *assemble*
but not *design* — helpless away from the tool. The pedagogy toggle and the
always-explained blockers guard against exactly this. The rule engine is, almost
accidentally, a curriculum.

## Non-goals

- **Not a replacement for expertise at the high end.** Controlled impedance,
  RF layout, multi-layer HDI, safety-critical work — the tool says so rather
  than bluffs.
- **Not a parts marketplace.** Sourcing serves the build; it isn't the business.
- **Not a hosting/fab middleman.** We generate the files and hand them over;
  we don't take a cut of the board run.

### Mains: gated, not refused

Earlier drafts refused everything above 48 V. That was wrong — refusing doesn't
make makers safer, it just sends them to a 2014 forum post, and it refused the
*correct* answer (a certified AC-DC module) alongside the dangerous ones.

Mains is now **tiered behind a safety valve** ([D32](decisions.md)): Tier A
(certified module, your circuit entirely low-voltage) is recommended outright;
Tiers B and C need explicit opt-in. **Opening a tier adds rules rather than
removing them** — clearance, creepage, fusing, earth bonding, isolation.

Two things no valve opens: **mains on a breadboard**, ever, and **CV
verification of mains**. And we never certify.

> **Other superseded non-goals.** Earlier drafts also excluded PCB layout,
> manufacturing outputs, and simulation. All are now in scope — see
> [decisions.md D22–D25](decisions.md). The DC solver is *not* superseded by
> ngspice: it predicts multimeter readings for the gate and must stay fast and
> always-available, while SPICE answers "does this design actually work?"
