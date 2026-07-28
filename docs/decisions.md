# Decision Log

What was chosen, what was rejected, and why. **Read this before changing
anything that feels arbitrary** — most of it isn't.

Decisions are numbered and dated. The design spec explains *how* the system
works; this explains *why it isn't something else.*

---

## D1 — Coach real hardware, not a simulator
*2026-07-28*

The student holds a physical breadboard. The agent's job is to make the board on
their desk safe, not to model one on screen.

**Rejected:** a virtual sandbox (safe, but says nothing about real hardware);
virtual-first-then-build (a validation gate is weaker than continuous coaching).

**Consequence:** everything downstream — measurement gates, build sequencing,
photo verification — exists because the artefact is physical.

---

## D2 — One structured circuit model is the source of truth
*2026-07-28* · **The load-bearing decision**

The LLM never draws. It mutates a typed model through validated tools;
deterministic renderers project that model into schematic, breadboard, build
steps, BOM, and firmware pin map.

**Why:** *you cannot run a design-rule check on an image.* If the AI generates a
picture, the safety promise is theatre. If it generates a netlist, safety
becomes a computable, testable, citable property.

**Consequence:** nearly every feature falls out of this for free — linked views,
build sequencing, CV comparison targets, firmware pin maps, substitution
checking. Overturning it collapses the product into "ChatGPT with a renderer."

---

## D3 — Deterministic rules adjudicate; the LLM only explains
*2026-07-28*

A rule engine decides whether a circuit is safe. The language model turns
`RULE_LED_NO_CURRENT_LIMIT` into a sentence a fifteen-year-old understands.

**Why:** a model that decides safety is a model that can be confidently wrong
about safety, with no audit trail. A rule engine is unit-testable, reviewable by
an engineer, and citable by ID.

**Consequence:** `Finding` is fully readonly with **no suppression, override, or
dismissal field** — a type-level guarantee, not a prompt instruction.

---

## D4 — Agent advisories exist, but can never gate
*2026-07-28*

The LLM may raise concerns the rule set missed, as `ADVISORY` only.

**Why the visual separation is mandatory:** if an LLM guess renders identically
to a tested rule, the first false alarm teaches the student that warnings are
noise — and that lesson generalises to the blocker that would have saved their
board. **Alarm fatigue is the real failure mode of safety tooling.**

**Consequence:** advisories live in a separate labelled band, dashed and muted,
never red. Recurring ones get human review and promotion into tested rules —
the rule set grows from real mistakes rather than a guessed hazard list.

---

## D5 — Mains AC is out of scope, as a rule not a policy
*2026-07-28* · ⚠️ **SUPERSEDED BY [D32](#d32--mains-is-tiered-behind-a-safety-valve-not-refused)**

Any net above 48 V, or any part flagged `hazardClass: mains`, produces `REFUSE`.

**Why:** that's where liability lives, and it's exactly where both analytical
rules and computer vision are weakest. **Being 95% right about mains is worse
than being no help at all.**

**Why it was wrong:** refusing doesn't make makers safer — they build it anyway
with worse information. And it refused the *correct* answer (a certified AC-DC
module) alongside the dangerous ones. See D32.

---

## D6 — Import geometry, hand-author safety
*2026-07-28*

Fritzing supplies pins, connectors, buses, and artwork. Electrical limits,
hazard class, and footprints are hand-authored per part.

**Why:** only 2–4% of the corpus carries electrical data, in free-text form.
See [corpus-findings.md §3](corpus-findings.md).

**Consequence:** ~12 fields × ~150 parts of careful human work. This is the
moat and the bottleneck simultaneously.

---

## D7 — Footprints in hole units, not derived from SVG
*2026-07-28*

A resistor is `{ "0": [0,0], "1": [4,0] }` — offsets in breadboard holes,
authored alongside the safety profile.

**Rejected:** deriving pin offsets from part SVG geometry. Accurate, but drags
an entire SVG-parsing subsystem into Slice 1 for parts we're hand-curating
anyway.

**Consequence:** Slices 0–1 stay free of SVG geometry except the one-time board
grid extraction. Automated footprint derivation remains open as a later
optimisation.

---

## D8 — Licence split: data repo vs code repo
*2026-07-28*

Part definitions and safety profiles live in the CC BY-SA fork with attribution.
Application code lives separately, separately licensed.

**Why:** Fritzing (CC BY-SA 3.0) and KiCad (CC BY-SA 4.0) are share-alike when
redistributed *as a collection*, and serving SVGs to a browser is arguably
distribution.

**Consequence:** legally tidy, and it makes the enriched library a community
asset rather than a liability.

---

## D9 — Full firmware generation is in scope
*2026-07-28*

Not just pin maps — complete application code.

**Why it coheres rather than sprawls:** the netlist is the contract between
hardware and firmware. Pin assignments are *derived*, so code and circuit cannot
drift. And holding both models unlocks cross-checks **neither half can catch
alone** — a pin set `OUTPUT HIGH` while wired to ground destroys the MCU and is
invisible to any hardware-only or code-only tool.

**Consequence:** roughly doubles the system. Sequenced as Slice 3, behind the
core.

---

## D10 — `arduino-cli` over PlatformIO
*2026-07-28*

**Why:** official PlatformIO never shipped Arduino ESP32 Core 3.x. The whole
firmware guarantee rests on *"it compiled, therefore the API is real"* — resting
that on a community fork of a platform unmaintained for the most popular hobby
chip is a worse position than the first-party CLI.

**Noted in fairness:** the `pioarduino` fork is genuinely healthy (1,765
commits, tracking Arduino 3.3.11 / IDF 5.5.5). This softens the risk without
overturning the choice. PlatformIO's *registry* stays useful as a library index.

---

## D11 — C++ for applications, MicroPython for bring-up only
*2026-07-28*

One codegen path, one strong verification gate.

**Why not drop Python entirely:** compile-flash-observe is a 30-second cycle; a
REPL is one second. Bring-up debugging is fundamentally interactive — scan the
I²C bus, read a register, toggle a pin. Python's value here is **loop speed, not
capability.**

**Rejected:** full dual-target codegen (doubles driver curation, and Python's
verification is weaker — stubs, not a compiler).

---

## D12 — Zephyr evaluated and deliberately rejected
*2026-07-28*

Devicetree *is* a hardware description generating the firmware's pin view — our
model could emit a `.overlay` directly. Genuinely elegant.

**Rejected because:** Zephyr has drivers for proper silicon, not for the
unbranded DHT22 clone from a 10-pack. Library resolution would fail constantly
and the compile gate would reject working hardware. The Arduino ecosystem's
sprawling, uneven, community-written library set is precisely what makes it
usable here.

**Logged as a promising advanced tier.**

---

## D13 — Web search for libraries, but the compiler arbitrates
*2026-07-28*

Resolution chain: curated metadata → structured registries → web search → read
headers → **verify by compiling** → promote to curated.

**Why:** the failure isn't "doesn't know the library," it's "*believes* an API
that doesn't exist." A confident 2019 blog post is exactly how you get a
plausible non-existent call. **The compiler is the arbiter, not the web page.**

---

## D14 — Desktop primary, phone as thin companion
*2026-07-28*

**Forced by:** Web Serial is desktop-only — not on Android Chrome, absent on
iOS. Flashing can't happen on a phone; the camera and bench ergonomics want one.

**Consequence:** the phone is a step display, a number pad, and a camera —
nothing more. Paired by QR at the design→build transition, and **never
required**. Gating a build on successful pairing would be self-inflicted.

---

## D15 — The gate collects measurements, never consent
*2026-07-28*

Never *"Did you check continuity? [Yes] [No]"*. Always *"What does it read?"*

**Why:** yes/no is compliance theatre — everyone clicks Yes, and it trains them
that the safety layer is a formality. Asking for a value makes faking require
invention, makes implausible entries detectable against predicted values, and
**makes the safety check and the lesson the same action.**

---

## D16 — Multimeter optional; the gate weakens audibly
*2026-07-28*

Without a meter the gate falls back to visual checks and **says so**: *"I can't
tell you whether there's a short, which is the most likely thing to destroy this
board."*

**Rejected:** requiring one (turns away the beginners who most need the tool);
degrading silently (overstates the guarantee, contradicting the honesty
principle running through the rest of the design).

---

## D17 — Student owns the layout; agent owns the netlist
*2026-07-28*

Parts may be dragged and wires moved freely. Changing *what connects to what*
goes through conversation.

**Why it's cheap:** a student rearranging the board and a student mis-wiring it
are the *same operation* to the system — a physical layout change, checked
against intent by machinery that already exists. Direct manipulation is
therefore safe to allow, which is not usually true of drag-and-drop editors.

---

## D18 — Explicit per-project pedagogy toggle
*2026-07-28*

*"Working circuit tonight"* vs *"I want to understand this."*

**Known weakness, designed around:** most people pick the fast path once and
never revisit. Mitigations — blockers explain themselves in **both** modes so
the learning floor is never zero; per project rather than per account; visible
toggle; and the switch is offered at the moment of maximum motivation, when the
circuit is dead and they want to know why.

**The tension being managed:** the better the agent is at building it for them,
the less they learn.

---

## D19 — Sourcing is Slice 2; substitution ships in the core
*2026-07-28*

Substitution ("I have 330 Ω, not 220 Ω — will it work?") needs no external API
and is answered by **re-running the same rules that gate the build**, so the two
can never disagree.

**Consequence:** external API dependencies stay off the critical path.

---

## D20 — Migrate to PopOS before writing code
*2026-07-29*

The Mac was at 97% disk (6.5 GB free of 228 GB) and already swapping. Slices 0–1
would have fitted after cleanup; **Slice 3 needs 20–30 GB and native Docker.**

**Why now:** the entire project was three markdown files. Migration cost was
essentially zero and only ever grows. See [HANDOFF.md](HANDOFF.md).

---

## D21 — The first implementation plan is headless
*2026-07-29*

Slices 0–1 as planned cover the ETL and the circuit engine. Renderers, agent
loop, the three UI modes, and the phone companion are **not** in it.

**Why:** the engine is independently testable and is where correctness matters
most. Everything in the UI is a projection of it.

**Consequence — stated plainly:** there is no demoable UI at the end of the
first plan. That's a real trade, and a deliberate one.

---

## D22 — Scope expands to the full idea→production arc
*2026-07-29* · **Supersedes three earlier non-goals**

The product covers five stages: idea → simulate → prototype → product →
production. PCB layout, manufacturing outputs, and simulation are now **in
scope**; earlier drafts excluded all three.

**Why it doesn't break anything:** D2 said one model, everything else a
projection. Five stages is five projections. The model grows *facets*
(SPICE models, KiCad refs, 3D geometry) rather than changing shape.

**Why the wedge doesn't move:** stages 4–5 are largely solved by mature
open-source tools that need driving. Stage 3 — safe physical prototyping with
real verification — is the part nobody has built. **Build the wedge first.**

**Consequence:** the part library becomes the centre of gravity, and the
curation cost per part rises. See D25.

**Not superseded:** the DC solver stays. It predicts multimeter readings for
the gate and must be fast and always-available; ngspice answers a different
question ("does this design work?"). Collapsing them would be a mistake.

---

## D23 — CLI and file formats over MCP and GUI automation
*2026-07-29*

Every stage drives open-source tools, **preferring command-line interfaces and
documented file formats**. MCP servers and GUI automation are a last resort.

**Why:** the principle already running through the design — *discovery may be
fallible, verification must be deterministic.* A tool driven by files can be
tested in CI, diffed, and reproduced. An agent clicking through a GUI cannot.
`kicad-cli pcb drc` is a compiler for boards; an agent driving the KiCad GUI is
a stochastic process with no audit trail.

**The enabling finding:** `kicad-cli` is fully headless and covers the entire
production path — `sch export netlist`, `sch erc`, `pcb drc`,
`pcb export gerbers`, `pcb export step`, `sch export bom`. ngspice is likewise
CLI-and-netlist driven, with no schematic entry of its own — which suits us,
since we already hold the netlist.

**Rejected:** adopting `mixelpixx/KiCAD-MCP-Server` as the integration path.
Two reasons beyond the above — KiCad 9's IPC API does not support the schematic
editor at all (PCB only), so schematic work there is file manipulation we could
do ourselves; and its README names a Rust rewrite as the next generation, making
the current implementation transitional.

**Remaining niche for MCP:** interactive PCB layout refinement, where a human is
in the loop anyway. Real, but narrow, and not needed for exports.

---

## D24 — CadQuery for 3D, despite the harder codegen
*2026-07-29*

Enclosures and 3D models are generated with CadQuery — a Python library with no
GUI dependency, built on the OCCT kernel.

**Rejected — OpenSCAD:** LLMs write it more reliably, and that's a genuine
advantage. But **OpenSCAD cannot export parametric STEP**, which is
disqualifying for anything heading to production or into a mechanical CAD
workflow.

**Rejected — FreeCAD:** full GUI-and-scripting hybrid, heavier to automate in a
pipeline.

**Consequence:** codegen is harder, so it gets the same treatment as firmware —
generate, then verify by execution, and retry on failure. The script either
produces valid geometry or it doesn't.

---

## D25 — The KiCad mapping is the keystone overlay
*2026-07-29*

Each curated part accumulates facets:

```
geometry               ← free from Fritzing
safety profile         ← hand-authored (the bottleneck)
SPICE model            ← partly free; some .fzp files carry <spice> blocks
KiCad symbol+footprint ← mapped, one per part
3D model               ← FREE, once the footprint is mapped
```

**Why this matters:** a single mapping — part → KiCad symbol + footprint —
unlocks PCB layout, 3D visualisation, *and* manufacturing output at once,
because KiCad's footprint libraries ship STEP models. That's far better leverage
than three independent overlays, and it makes the expanded scope affordable.

**Consequence:** the curated set is the schedule. Every stage of the arc is
gated on how many parts have been fully mapped, not on how much code exists.

---

## D26 — Target the KiCad netlist, via SKiDL
*2026-07-29*

KiCad stays as the eCAD target. The question was *what layer to write into it*,
and the answer is the **netlist**, using SKiDL as the format adapter.

**Why KiCad at all:** the alternatives (Horizon EDA, LibrePCB) have cleaner
internals but a fraction of the library ecosystem — and **the library ecosystem
is what matters, not the tool.** Plus headless `kicad-cli`, GPL, and universal
fab acceptance.

**Why the netlist layer:** it's the stable interface — the s-expression schematic
format changed at KiCad 6 — and we already hold a netlist. SKiDL supports KiCad
5–9 and absorbs that version churn for us, while being a *netlist generator, not
a decision-maker*.

**Rejected — atopile.** Its compiler "solves constraints, picks parts, runs
checks." Those are decisions our rule engine already made, so building on it
creates two sources of truth that can disagree — the same objection as D23. It's
also more an adjacent competitor than a component: code-defined electronics for
engineers who write code, not makers with breadboards.

**Rejected — writing `.kicad_pcb` s-expressions directly.** Maximum control,
maximum brittleness, no upside over the netlist path.

---

## D27 — Generate KiCad schematics, using hierarchical sheets
*2026-07-29*

The export produces an editable `.kicad_sch`, not just a netlist — so makers can
continue the design in KiCad.

**The problem this has to beat:** a netlist gives you a PCB but *not* a drawing,
and schematic auto-layout is close to unsolved. Machine-placed schematics are
routinely bad enough that engineers redraw them.

**The approach:** **hierarchical sheets, one per functional block.** A
50-component single page cannot be auto-laid-out well; a 6-component sheet can,
by convention — power at top, ground at bottom, signal flow left to right,
decoupling caps beside their IC. KiCad supports this natively and it's how real
designs are organised. Our model already knows the blocks because the agent
designed in them.

**Why it's cheaper than it looks:** Slice 1's UI needs a schematic renderer,
which needs a layout engine. The same engine serves both outputs —

```
circuit model → semantic layout engine → ┬→ our SVG renderer
                                          └→ .kicad_sch writer
```

One algorithm, two serialisers. The KiCad schematic and the in-app schematic
then look like the same drawing, which helps the student crossing between them.

**Dependency:** `kicad-sch-api` for s-expression writing. ❌ Unverified —
confirm maturity before committing.

---

## D28 — 3D: components and board are free; the enclosure is the work
*2026-07-29*

"3D models" means three different things and they have very different costs:

| What | Source | Cost |
|---|---|---|
| Component models | KiCad `packages3d` ships STEP + WRL | **Free** once the footprint is mapped |
| Populated board | `kicad-cli pcb export step` (also GLB, STL, BREP, PLY) | **Free** |
| Enclosure | CadQuery (D24) | **The actual work** |

**This confirms D25** — the footprint mapping really does unlock PCB, 3D, and
manufacturing simultaneously.

**GLB export is worth noting for the UI:** web-renderable, so a 3D view of the
student's board needs no external viewer or plugin.

⚠️ **Gotcha:** KiCad footprints often reference *only* the VRML file, and VRML is
a mesh format, not CAD — it cannot be included in a STEP export. `--subst-models`
substitutes the STEP file matching the VRML base name. **Without that flag the
STEP export is a bare board with no components, and it fails silently.**

**Where the real value is — the enclosure is another projection:**

```
PCB ──► board outline
        mounting hole positions
        connector positions + heights   ──► CadQuery enclosure
        tallest component                    (STEP for CAD, STL to print)
```

Cutouts positioned from actual footprint locations, standoffs at real mounting
holes, internal height from the tallest part. **This is what nobody does well.**
The PCB path is well-trodden; the ECAD→MCAD handoff is where people still lose
days. And for a maker with a 3D printer it closes the loop with no fab at all.

---

## D29 — The product is a whole-journey assistant, not a circuit tool
*2026-07-29* · **Reframes the product**

CircuitKing is a **complete assistant for the maker's journey from idea to real
product** — seventeen stages, mapped in [roadmap.md](roadmap.md). Not an AI
circuit coach that also exports files.

**What changes architecturally:** the circuit model becomes a **project model**
that accumulates facets — intent, requirements, architecture, circuit, firmware,
board, mechanical, manufacturing, validation, and **history**. Same principle as
D2; wider scope.

**Why `history` is listed as a facet:** a complete assistant remembers what was
tried, what failed, and why a part was chosen. That memory is what makes it a
companion rather than seventeen disconnected tools, and it can't be
retro-fitted — it has to be recorded as the project moves.

**The bet, stated plainly:** *continuity beats per-stage excellence.* Every
stage already has a good point tool. Nobody has a companion that loses nothing
at a handoff. This bet can lose — a broad tool that's mediocre everywhere loses
to focused ones — so it requires every stage be good enough and one stage be
genuinely great. Hence the wedge stays.

**Consequence for scheduling:** four phases, each independently shippable.
**Do not start Phase 2 until Phase 1 is genuinely good.** Seventeen stages is an
invitation to build all of them badly.

---

## D30 — Requirements must be numeric before anything downstream
*2026-07-29*

Stage ③ converts vague wants into measurable requirements:

> *"should last a long time on battery"* → *"≥6 months on 2×AA, one reading per
> hour, 0–40 °C"*

**Why it's load-bearing rather than nice-to-have:** it's what makes every later
verification *possible*. You cannot check a power budget against "a long time,"
and you cannot generate a test plan from an adjective. Numeric requirements are
the input to the architecture check, the power budget, and the stage-⑭ test
plan.

**Consequence:** the requirements stage is not a formality to rush past. It is
where the project becomes computable.

---

## D31 — Compliance is prepared for, never claimed
*2026-07-29*

The assistant maintains a technical file, applies design rules that help pass
(filtering, shielding, **certified** power modules rather than designed mains
circuitry), runs a pre-compliance checklist, and states plainly what needs a
test house and roughly what it costs.

**It never certifies, and never implies a design is compliant.**

**Why:** same logic as the mains boundary (D5). Being confidently wrong about
CE or FCC is worse than being no help, and the failure surfaces only after
someone has sold units.

**Delivery:** lead with what we *can* do, per the refusal pattern in spec §8.11.

**Same treatment for:** controlled-impedance and RF layout, multi-layer HDI,
safety-critical applications, and DFM beyond a few hundred units.

---

## D32 — Mains is tiered behind a safety valve, not refused
*2026-07-29* · **Supersedes D5**

Mains work is available, gated by an explicit per-project opt-in, in three
tiers:

| Tier | Covers | Gate |
|---|---|---|
| **A** | Certified AC-DC module; maker's own design entirely low-voltage | **None — actively recommended** |
| **B** | Switching/sensing mains: relays, SSRs, triacs, current sensing | Explicit acknowledgment |
| **C** | Designing the supply: transformer, rectifier, SMPS primary, isolation barrier | Explicit acknowledgment + heavy warnings |

**Why the blanket refusal was wrong:**

1. **Refusing doesn't make anyone safer.** Someone building a smart plug builds
   it anyway, from a 2014 forum post. *"Here's how this is done properly, and
   here's what you must never do"* is strictly safer than silence.
2. **It refused the correct answer.** The professional solution for most
   mains-powered maker products is a sealed, agency-certified AC-DC brick with
   the maker's circuit entirely low-voltage behind it. D5 refused that
   alongside genuinely dangerous work.
3. **A product assistant that can't touch mains** can't help with most real
   consumer electronics.

**The governing principle: opening the valve ADDS rules, it never removes
them.** Mains mode is not "checks off" — it activates a stricter set that
doesn't otherwise exist: IPC-2221 clearance and creepage, fusing, earth bonding,
isolation barrier width, relay contact ratings, snubbers, control-side
isolation. Today we have none of those *because* we refuse.

### Absolute, at every tier — no valve opens these

- ⛔ **Mains on a breadboard is refused, always.** No creepage distance,
  contacts rated ~1–2 A, exposed conductors. There is no acceptable version, and
  it is the most likely way someone could die using this tool.
- ⛔ **No photo/CV verification of mains.** Computer vision cannot confirm an
  isolation barrier. Slice 4 stays low-voltage only.
- ⛔ **We still never certify.** See D31.

**Rejected — competence-gated Tier C** (requiring evidence of an isolation
transformer or differential probe from the parts inventory). Patronising, and
trivially defeated by lying.

---

## D33 — Compliance is early design constraints, not a late stage
*2026-07-29* · **Corrects the roadmap**

Compliance was placed at stage ⑮. That was wrong.

> **Compliance is ~80% design constraints applied early and ~20% paperwork at
> the end.** By stage ⑮ the outcome is already determined — you're only
> discovering it.

**Where it actually lives:**

| Stage | Constraint |
|---|---|
| ④ Architecture | **Prefer pre-certified modules** — radio and power |
| ⑨ PCB | EMC-aware layout: ground planes, filtering, trace routing, cable treatment |
| ⑩ Mechanical | Creepage, ingress, shielding, earth bonding |
| throughout | Technical file accumulates as decisions are made |
| ⑮ | Checklist, gap report, test-house guidance |

**The reasoning, which is worth keeping:**

**EMC failures are design problems, not paperwork problems.** Radiated emissions
come from clock harmonics, switching supplies, poor grounding, and cables acting
as antennas. Fail the test and you go back to layout and lose weeks. This is
where most first products fail.

**Pre-certified modules are the biggest lever, and most makers don't know it.**
A pre-certified radio module (most ESP32 modules carry FCC/CE) lets you inherit
its certification if you follow its integration rules on antenna and layout.
Same principle as the certified power supply in D32 Tier A. Choosing these at
*architecture* time can cut the burden by an order of magnitude.

**Pre-compliance vs full compliance is the most valuable thing to tell a
maker.** Accredited EMC testing is roughly £3–10k plus lab days. Near-field
probes and a cheap spectrum analyser cost hundreds and catch most problems
first.

**Most CE marking is self-declared** — you sign the DoC, nobody grants
permission. You need evidence and you accept liability. Radio usually needs a
notified body unless you use a pre-certified module.

**Consequence:** the technical file is a *projection of the project model*,
accumulating throughout rather than assembled at the end.

---

## Adding to this log

Record the decision, the date, **the alternatives you rejected**, and the
consequence. The rejected options are the most valuable part — without them the
next person re-derives the same dead ends.
