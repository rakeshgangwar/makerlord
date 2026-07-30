# Decision Log

What was chosen, what was rejected, and why. **Read this before changing
anything that feels arbitrary** — most of it isn't.

Decisions are numbered and dated. The design spec explains *how* the system
works; this explains *why it isn't something else.*

---

## D1 — Coach real hardware, not a simulator
*2026-07-28*

The maker holds a physical breadboard. The agent's job is to make the board on
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
to a tested rule, the first false alarm teaches the maker that warnings are
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
*2026-07-28* · **partially revised by [D39](#d39--the-ui-is-web-first-a-local-bridge-supplies-the-rest)**

**Forced by:** Web Serial is desktop-only — not on Android Chrome, absent on
iOS. Flashing can't happen on a phone; the camera and bench ergonomics want one.

> **What D39 changed:** "desktop" here meant a desktop *application*. It now
> means a desktop *browser*. The phone-is-thin conclusion is unchanged and the
> forcing constraint is unchanged — flashing still cannot happen on a phone. The
> phone companion is the same web app, responsive, rather than a separate build.

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

## D17 — Maker owns the layout; agent owns the netlist
*2026-07-28*

Parts may be dragged and wires moved freely. Changing *what connects to what*
goes through conversation.

**Why it's cheap:** a maker rearranging the board and a maker mis-wiring it
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
then look like the same drawing, which helps the maker crossing between them.

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
maker's board needs no external viewer or plugin.

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

MakerLord is a **complete assistant for the maker's journey from idea to real
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

## D34 — A project is a git repository, hosted and clonable
*2026-07-29*

Each project is a **real git repo that we host and the maker can clone.** Not
rows in a database, and not local-only.

```
server-hosted repo (canonical)
   ├── web app commits to it        → browser-only makers never clone
   └── maker clones / pushes        → power users work in their own tools
```

**We do not reimplement sync or conflict resolution.** Git already solved it.
The web app refuses to write a diverged tree and says "pull first"; it never
force-pushes.

**Why git:**
- Revision control is a **production requirement** — v1 board vs v2 board.
- `git diff` on a netlist is a genuinely useful review.
- Branches are design alternatives: *"try it with an ESP32-C3"* is a branch.
- The `history` facet from D29 wants to **be** git history.
- The maker keeps their work if we disappear.
- Everything downstream is already files.

**Two departures from software habit:**

1. **Commit the build outputs.** Software gitignores `build/`. Here, *"what
   exactly did I send to the fab?"* is a debugging, warranty and compliance
   question. This makes tags load-bearing — `v1.0-fab` marks the exact commit
   whose gerbers were ordered.
2. **Git LFS from day one** for `**/*.step`, `**/*.stl`, `**/*.glb`. MB-scale
   files, and the repo gets fat fast otherwise.

**Rejected — server-side state with zip export:** revision control becomes a
feature we reimplement badly, and the maker's ownership is weaker.

**Useful coincidence:** cloning locally happens at the same moment as the KiCad
ownership handoff (D35). Stage ⑨ is where the maker takes the wheel in both
senses. It also buys offline bench work.

---

## D35 — Explicit one-way ownership handoff at the PCB
*2026-07-29*

```
we own       →  netlist, schematic generation, initial placement
handoff ⑨    →  the maker opens KiCad
they own     →  layout, routing, refinements
we then only →  re-verify (DRC) and offer netlist updates that preserve
                placement, the way KiCad's update-from-schematic already works
```

**The tool leads, hands over, then verifies.** Not automation forever.

**Rejected — regenerate and warn on overwrite:** keeps one source of truth, and
will destroy hours of routing at least once. Hostile.

**Rejected — round-trip sync:** best experience when it works, and notoriously
fragile. **Silent corruption of a design someone is about to pay to fabricate is
an unacceptable failure mode.**

**Consequence:** the handoff must be stated in the UI at the moment it happens,
or it reads as the tool breaking. Same pattern applies to `main.cpp` (scaffold
generated, logic theirs) and `enclosure.py`. `pins.h` is the deliberate
exception — always generated, never hand-edited, because that is what stops code
and circuit drifting.

---

## D36 — TypeScript core, Python sidecar. Not Rust.
*2026-07-29*

The engine, CLI, MCP server, web UI and phone companion are **TypeScript**.
A **Python sidecar** hosts the CAD/eCAD libraries, driven as a subprocess with
JSON — the same boundary we already use for every native tool (D23).

```
TypeScript      engine · rules · CLI · MCP server · web UI · phone companion
     │ subprocess + JSON
Python sidecar  CadQuery · SKiDL · kicad-sch-api
     │ subprocess
Native CLIs     kicad-cli · ngspice · arduino-cli · freerouting
```

**Rust was considered — `block/buzz` is a well-built Rust agent platform — and
rejected:**

1. **Our compute is trivial.** Union-find over 420 holes; a few dozen rules over
   a graph with tens of nodes. There is no performance problem for Rust to
   solve; our latency is LLM calls and subprocess time.
2. **The ecosystem pulls the other way.** CadQuery (D24), SKiDL and
   `kicad-sch-api` (D26/D27) are Python-only. The UI is TypeScript regardless.
   A Rust core would sit between them, needing a boundary to both.
3. **There is no first-party Anthropic SDK for Rust.** Buzz pays for this
   directly: `buzz-agent/src/llm.rs` is **3,846 lines** and `config.rs` 2,709 —
   a hand-written multi-provider LLM client. That is ~6,500 lines of pure
   language tax before a single safety rule gets written.

**Where Rust would genuinely have won:** enums and ownership would make D3's
guarantee (`Finding` has no suppression field) airtight rather than
conventional. TypeScript `strict` + `readonly` + a type with no such field gets
most of the way, and it isn't worth a language boundary through the middle of
the system.

**The real alternative was Python, not Rust** — it wins the toolchain half
outright and has a first-party SDK. It loses the UI half, which decides it.

---

## D37 — Native tools run server-side by default
*2026-07-29*

**Headless → our containers. Interactive → the maker's machine.**

| Tool | Runs where | Maker installs |
|---|---|---|
| ngspice, arduino-cli + cores, `kicad-cli`, CadQuery, Freerouting | our container | **no** |
| Flashing (WebSerial) | their browser | **no** |
| KiCad GUI (stage ⑨) | their machine | yes |
| Slicer (stage ⑩) | their machine | yes |

**Stages ①–⑧ require nothing installed.** The whole prototype loop — idea
through firmware and debugging — runs in a browser. A teenager on a Chromebook
can do all of it. That falls out of the model-as-source-of-truth decision: every
artefact at those stages is something we compute.

**The two local installs are the maker's, not ours.** They install KiCad because
they are *taking over the layout* (D35), and a slicer because they are printing
the STL. Both coincide with cloning locally — one transition, not three.

**Power users who clone can install the toolchain and run it themselves**;
`scripts/verify-env.sh` already checks for it, and the app degrades honestly
when a tool is missing.

**Licensing, which is a real constraint and not just a size one:** `kicad-cli`,
ngspice and Freerouting are **GPL**. Running them server-side triggers no
distribution obligation. **Bundling them into a shipped desktop app does** — so
"just ship it all in Tauri" is not the free option it appears to be.
`arduino-cli`'s exact licence is still ❌ unverified — confirm before any
bundling decision.

Size would sink bundling regardless: KiCad ~2 GB plus an ESP32 toolchain
~2–3 GB is not a download.

**The cost this creates:** we pay for the compute. Firmware compiles and
CadQuery runs are CPU-bound, and a maker iterating firmware can trigger dozens
of compiles an hour. This is what eventually forces a metering model — the same
problem Flux answers with ACUs. Server-side compiles also add a round trip to
the compile-flash-debug loop.

---

## D38 — fable-guide is the persona spine, not a skill pack
*2026-07-29*

[`rakeshgangwar/fable-guide`](https://github.com/rakeshgangwar/fable-guide) —
an operator's guide on claims-over-vibes, ground truth over fluency, provenance
labelling, adversarial self-review, and answer-first delivery — becomes the
**shared epistemic spine for all seventeen stage personas**
(ai-implementation.md §6).

**Why it fits:** it maps onto this architecture almost line for line. "Claims,
not vibes" is `Finding` with a `ruleId`. "Ground truth outranks you" is D3.
"Track verified vs guessed" is the `RuleFinding` / `AgentAdvisory` split (D4).
"The check is cheaper than the correction" is the measurement gate (D15).
MakerLord is largely this guide instantiated as a product.

**Rejected — packaging it as Claude Code skills:**

1. **Skills are task-triggered; this is always-on stance.** No request says "I
   need epistemics." Honest descriptions never fire; descriptions that force
   firing are a system prompt with extra indirection. The precedent is
   `using-superpowers`, delivered by a SessionStart hook rather than the skill
   registry, for exactly this reason.
2. **`superpowers` already covers ~40% of it** — chapters 04/09 ≈
   `verification-before-completion`, 06 ≈ the code-review pair, 01 ≈
   `brainstorming`. Two overlapping sets competing for the same trigger moments
   is worse than either alone.
3. **Eleven skills would be eleven descriptions competing for attention**, most
   of which never match. If it were ever packaged, the right shape is *one*
   skill with the chapters as `references/` supporting files.

**The uncovered chapters are where the value is:** **03** (spend effort where
being wrong is expensive *and silent*), **05** (the reader must be able to tell
verified claims from guesses from the text alone), **07** (answer first, then
reasoning, then risk), **08** (thirteen behaviours that read as competence).
Those go into persona prose.

---

## D39 — The UI is web-first; a local bridge supplies the rest
*2026-07-29*

The product is a web app. **`maker-bridge`**, a small optional local daemon,
supplies the three things a browser cannot: hosting external ACP agent binaries,
serial access on browsers without Web Serial, and local clone access.

**Why:** D34 already made the project a hosted git repo and D37 already put the
native toolchain server-side — KiCad at ~2 GB plus an ESP32 toolchain at ~2–3 GB
is not a download. Most of the app is therefore a client of things that are
already remote. And the experiment that most needs running — watching four
people build a circuit from a written guide (roadmap §7) — needs a URL, not an
installer.

**Web Serial is a smaller constraint than D14 implied.** It ships in Chromium
desktop browsers, so a Chrome or Edge maker flashes at stage ⑦ with no install
at all. The bridge is the fallback for Firefox and Safari, and the path for
makers who want their own agent, their own clone, or offline bench work.

**Rejected — desktop-first (Tauri):** buys native serial, filesystem and
toolchain access. Two of those three we deliberately don't want locally, and
bundling makes the third legally awkward — ngspice and Freerouting are GPL, and
bundling them into a shipped app triggers distribution obligations that running
them server-side does not.

**Rejected — both shells from day one:** doubles the surface of the UI spec and
every spec after it, to serve a preference nobody has yet expressed.

**Consequence:** the ACP host cannot be server-side (the maker's agent licence is
local) and cannot be in the browser (no process spawning), so it lives in the
bridge — which is what makes the bridge worth installing at all.

---

## D40 — External agents are equally gated, less well coached
*2026-07-29*

A BYO agent gets the full 32-tool surface and identical engine-enforced gates.
It does not get our stage personas, our context accounting, or our prompt
caching.

**Why this is safe:** the gate is a refused call (D3), not a prompt instruction.
It holds regardless of which model is driving or what it believes.

**The gap, stated honestly:** an external agent cannot advance the build past a
live BLOCKER, but it *can* say "that finding looks conservative, just wire it
up" — and the maker has hands.

**So: findings are rendered by the client from engine data, never from agent
prose.** The finding strip is populated by `ToolResult` payloads and by the UI's
own `check_*` calls. The agent does not write it, cannot summarise it, and there
is no dismiss control anywhere in the DOM. A BLOCKER is on screen whatever the
agent chose to say about it.

**Rejected — refusing BYO agents entirely:** would protect the coaching quality
and give up the maker's own subscription, their own model preference, and the
strongest evidence that our tool surface is genuinely a public API.

**Rejected — a "verified agent" allowlist:** unenforceable, and it implies the
gates depend on which agent is running. They don't.

**Consequence:** a cross-brain test is mandatory — the golden end-to-end script
run through a fake ACP agent must produce the same refusals and the same
`project.json` as the direct-registry run. If it ever fails, the BYO path is
disabled until it passes.

---

## D41 — SvelteKit for the web app
*2026-07-29*

**Why:** fine-grained reactivity suits a streaming event feed; SVG is
first-class rather than something to escape into raw-HTML injection; runtime
cost stays low for an app rendering large SVGs and a WebGL scene on one page.
For a solo builder plus agents, less ceremony per component is a real schedule
effect.

**Rejected — React:** wins on ecosystem depth and on hiring, and remains the
reasonable alternative. If either becomes the binding constraint this is a
substitution at the component layer only — the renderers are SVG-and-canvas
generation over a typed model and are not framework-shaped.

**Consequence:** low. This is the most cheaply reversible decision in the log,
which is why it gets the shortest entry.

---

## D42 — Simulation covers `.op`, `.tran` and `.ac`. No firmware-in-the-loop.
*2026-07-29*

Stage ⑤ runs operating point, transient and small-signal AC via ngspice, from
the netlist we already derive.

**Why these three:** they answer the questions that actually bite makers — will
this resistor cook, does the rail sag when the radio transmits, is the level
shifter biased right, does the sensor front-end have the corner frequency the
requirement asked for.

**The MCU boundary:** we simulate the analogue envelope *around* the
microcontroller, not the microcontroller. A digital part is a behavioural stub —
a supply-current sink with declared active and sleep values, I/O pins as voltage
sources with declared drive. None of the four questions above needs firmware to
run.

**Rejected — firmware-in-the-loop co-simulation:** the most differentiated thing
available in this space and by a distance the hardest. A research project, not a
slice.

**Deferred — Monte Carlo and tolerance analysis:** the obvious v2 and genuinely
valuable for production, since a design that works at nominal and fails at 5%
resistor tolerance is common. It multiplies run count by sample count and needs
tolerance data the corpus doesn't carry yet.

**Consequence:** simulation stays advisory — none of its four tools gate,
because nothing physical exists yet to be unsafe.

---

## D43 — Simulation results inherit the provenance of their weakest model
*2026-07-29*

A run's provenance is **the weakest model in the loop, not the average.**
Manufacturer or curated models can reach BLOCKER; a vendor model of unclear
origin tops out at WARNING; a generic idealisation or a missing model tops out
at NOTE.

**Why:** measured electrical coverage of the Fritzing corpus is **2–4%**
([corpus-findings.md](corpus-findings.md)). Most parts arrive with no SPICE model
at all. A simulation is exactly as good as its device models, and the worst
artefact this project could produce is a confident, precise, plotted, wrong
answer.

Weakest-not-average because the idealised part is precisely where the error will
be.

**The same rule covers stimulus.** A transient run needs to know what the circuit
is doing, and that isn't in the netlist. A duty cycle or load step the agent
guessed is `assumed` and caps the run at NOTE, exactly as an idealised model
would.

**Rejected — refusing to simulate without full models:** would make the stage
unavailable for essentially every real project.

**Rejected — simulating and not labelling:** the failure mode this decision
exists to prevent.

**Consequence:** the good one. **Curating a single part's SPICE model upgrades
every check that depends on it**, and the provenance badge in the UI is where a
maker sees that happen. This is the same shape as the front-door spec's severity
degradation and the general provenance-bounds-severity rule.

---

## D44 — Manual agent loop, not the beta tool runner
*2026-07-29*

The agent runtime uses a hand-written loop over `client.messages.create`
rather than the SDK's beta `tool_runner`.

**Why:** the agent-runtime spec (§2 ⚠️) itself named the condition — if
mid-turn steering cannot be verified to work by pushing a message between
runner turns, "that single requirement forces the manual loop." The beta
runner's iteration contract could not be verified at implementation time, and
the fake-LLM harness needs deterministic control of exactly the places the
runner abstracts: refusal handling before content is read, steering fold-in at
round boundaries, and the bounded-objections stop.

**Rejected — the beta tool runner:** preferred by the spec for its per-turn
hooks; revisit when its steering semantics are documented. The loop keeps the
runner's shape (one round per API call, results appended whole) so a swap
stays cheap.

**Rejected — streaming transport now:** `stream: true` is a production
concern (request timeouts) with no observable effect on the event union — the
events are already delta-shaped. Wire it with the UI. Until then the SDK's
long-request check requires an explicit client-level `timeout`.

**Consequence:** `ai-implementation.md` §10's "verify the runner permits
mid-turn steering" open item is resolved: it wasn't verifiable, so the manual
loop it warned about is what shipped.

---

## D45 — elkjs is the schematic layout engine

*2026-07-29.*

The first schematic renderer placed parts on a fixed grid, four per row, and
drew straight orthogonal nets between labelled boxes. Correct as a projection,
useless as a schematic — the maker saw topology noise, not a circuit. The
layout is now ELK's layered algorithm (`elkjs`, the engine behind netlistsvg),
with orthogonal edge routing, and each part family draws as its conventional
glyph: resistor zigzag, diode/LED triangle-and-bar with emission arrows,
battery plates, capacitor plates, generic box with edge pins for everything
else. `layoutSchematic` stays exported separately from the SVG so the KiCad
generator consumes the same placement (D27 holds; ELK is proven in exactly
that domain).

**Rejected — netlistsvg wholesale:** its input is Yosys-shaped JSON and its
skin system is digital-first; we would translate our model into someone
else's model to get at the ELK underneath. Take the engine, keep our model.

**Rejected — canvas/WebGL rendering:** wins only at thousands of elements;
loses DOM hooks, text-diffability, and the ability to commit the artifact to
the project repo (D2). Revisit at stage ⑨ where KiCanvas embeds real KiCad.

**Rejected — hand-rolled layered layout:** a weekend of graph drawing that
ends where ELK started. Layout is a solved problem; symbols and provenance
are ours.

**Consequence:** `renderSchematic`/`layoutSchematic` are async (ELK's API is
promise-based), which made `writeAllArtifacts` async — callers await it. ELK
is deterministic for a given graph, so golden-equality tests still hold.

---

## Adding to this log

Record the decision, the date, **the alternatives you rejected**, and the
consequence. The rejected options are the most valuable part — without them the
next person re-derives the same dead ends.

---

## D46 — The role-symbol contract: code never names a pin

*2026-07-30. Firmware spec §1, §4.*

Application code references engine-bound roles (`MOISTURE_SENSE`), never
pins (`A0`, `GPIO14`). `pins.h` is a pure projection of the netlist; a raw
pin literal in the agent-authored region is a BLOCKER-severity finding
(`RULE_FW_RAW_PIN_LITERAL`), enforced by a lint table over pin vocabularies
and pin-position call sites. This is the hole-ID move applied to firmware:
drift becomes structurally impossible because the drifting name is never in
the code.

**Rejected — trusting generation/review:** drift is silent and cumulative;
the failure mode (pin OUTPUT into ground) destroys hardware.

**Rejected — full C++ parsing:** a compiler frontend's weight for a
guarantee the lint table already makes mechanical over one bounded region.

---

## D47 — Flashing is powering

*2026-07-30. Firmware spec §6.*

Plugging USB into the MCU energises the breadboard through its regulator —
a flash *is* a power-up. So `fw_manifest` (which releases `firmware.bin` and
flash parameters to the browser) sits behind the same engine-enforced gate
as the bench power-up: measurements recorded, `gate_open`, no live BLOCKER.

**Rejected — a separate USB gate:** two gates for one physical act teaches
the maker the gates are bureaucracy.

**Rejected — ungated flashing:** contradicts the wedge's core promise the
first time firmware drives a miswired pin.

---

## D48 — GPIO capability is a hand-authored curated facet

*2026-07-30. Firmware spec §3.*

Per-pin capabilities (digital/analog/PWM/interrupt), strapping-pin boot
requirements, analog voltage domains, `fqbn` and flash protocol are
datasheet-cited curation on MCU profiles — the same treatment as every
safety limit. Slice 1 covers the two curated MCUs (Uno, D1 mini).

**Rejected — deriving from Arduino core headers:** the headers say what
compiles, not what boots — strapping pins and board-level analog dividers
(D1 mini's A0) live only in datasheets and schematics, and those are
exactly the fields the BLOCKER rules stand on.

---

## D49 — Inventory is per-project; the library/inventory split

*2026-07-30.*

The **library** is the curated catalog — what exists and is safe to use.
The **inventory** is what the maker owns — and it lives on the project
(`project.inventory`, as it always has), because D34 made the project a
real repo and the parts pile that built a thing is part of that thing's
record. `inventory_gap` derives what a build still needs (BOM minus
owned); the UI's Library tab surfaces the gap with an "own it" crossing.

**Rejected — a maker-level inventory store:** truer to physical reality
(your drawer serves every project), but it introduces the first piece of
state that lives outside any project repo — a new storage concept, sync
questions, and a D34 exception — for a convenience that "copy inventory
from my last project" can deliver later without any of that. Deferred,
not denied.

**Rejected — inventory as a library filter:** owning a part is a fact
about the maker, not a property of the catalog; conflating them makes
the curated library look smaller than it is.

---

## D50 — The provenance-tiered library

*2026-07-30. Curation spec §2, §5.*

Tier is LOCATION, computed and never stored: `data/profiles/` + a
curated-manifest entry = verified; `data/proposals/` = sourced; a bare
corpus part = geometry. Sourced parts design, check and simulate with
findings unsoftened (their numbers are cited, not invented) — but
`gate_open` and `fw_manifest` refuse `PROFILE_UNVERIFIED` while any
circuit part is not verified: **nothing physical happens on sourced
data.** Geometry parts browse only.

**Rejected — severity-capping sourced findings:** a cited number
deserves its finding; the gate is the enforcement point, not the prose.

**Rejected — the binary curated-or-invisible status quo:** it made the
library look tiny and starved the demand signal that should drive the
drip.

---

## D51 — Promotion is human-only, by absence

*2026-07-30. Curation spec §4.*

`maker curate promote` exists solely in the maintainer CLI — not in the
registry, therefore not in MCP, therefore unreachable by any agent,
local brain included. The guard-rail regex grows `promote`. Same
principle as `dismiss_finding`: the agent cannot call what was never
defined where agents live.

**Rejected — an agent-callable promote behind a confirmation:** a
confirmation is one fluent prompt away from wrong; the precedent
applies unchanged.

---

## D52 — Admission is human-minted, identity is a passkey

*2026-07-30. Auth spec §2.*

`maker invite new` (maintainer CLI only — the D51 pattern) mints a
single-use, 7-day code; registration is `/join` + code + handle +
WebAuthn `create()`, login is usernameless `get()`. No password field
exists in any schema, so no password can leak, be reset, or be phished.

**Rejected — GitHub OAuth:** a third party in the trust chain and an
app registration to manage. **Rejected — email+password:** password
storage plus reset infrastructure for a capability passkeys give free.

---

## D53 — The UI server is the sole authenticator

*2026-07-30. Auth spec §2.*

The SvelteKit server owns the WebAuthn ceremonies and the httpOnly
session cookie (30-day sliding, server-side store). The API never sees
a cookie: it accepts the internal service token **plus** an
`x-makerlord-user` header the UI server stamps, or a per-user `mlt_`
token (the bridge's path). Every API request maps to a user id or dies
401 — the service token alone authorizes nothing.

**Rejected — sessions in the API:** two session systems. **Rejected —
trusting the user header alone:** spoofable without the service token.

---

## D54 — Projects are per-user; the library is a commons

*2026-07-30. Auth spec §2.*

Storage becomes `projects/<userId>/<projectId>`; the layout IS the
ownership model, and cross-user access 404s — existence is private
too. The curated library, proposals queue and datasheet store stay
global: a part verified once is verified for everyone (curation spec
§7).

**Rejected — per-user libraries:** they starve the communal demand
signal and fork the ground truth D50 tiers depend on.
