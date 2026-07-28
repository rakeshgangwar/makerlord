# CircuitKing — Design Spec

**Date:** 2026-07-28
**Status:** Approved design, pre-implementation

---

## 1. Problem

Hobbyists and makers learning electronics destroy components, damage boards, and
occasionally hurt themselves — not because the information isn't available, but
because nothing checks their actual circuit before power is applied. Existing
tools split badly: simulators (Tinkercad, Falstad) are safe but virtual; eCAD
tools (Flux, KiCad, EasyEDA) assume you already know what you're doing; LLM chat
gives confident wiring advice with no way to verify it.

CircuitKing is an AI coach for **real hardware**. Students hold physical
breadboards, components, and microcontrollers. The agent designs the circuit,
draws it in both schematic and breadboard form, walks them through building it
step by step, and — critically — **gates power-up behind deterministic safety
checks**.

### Audience

Hobbyists and makers, all levels. Ranges from a teenager with an Arduino starter
kit to an experienced maker building a robot.

### Explicitly out of scope

- **Mains AC (>48 V).** Encoded as a hard-refusal rule, not a policy document.
  This is where liability lives and where both analytical checking and computer
  vision are weakest. Being 95% right about mains is worse than useless.
- **PCB layout and manufacturing.** This is a learning tool, not an eCAD
  replacement.

---

## 2. Core architectural decision

**One structured circuit model is the single source of truth. Every other
artifact is a projection of it.**

```
                ┌──────────────────────────────┐
                │  LLM agent (intent → model)  │
                │  via validated tool calls    │
                └──────────────┬───────────────┘
                               ▼
                ┌──────────────────────────────┐
                │      CIRCUIT MODEL           │
                │  intent netlist              │
                │  physical layout             │
                │  part instances              │
                └──┬──────┬──────┬──────┬──────┘
                   ▼      ▼      ▼      ▼      ▼
             schematic  bread-  build  safety  BOM /
              render    board   steps  engine  firmware
                        render                 pin map
```

The rationale: **you cannot run a design-rule check on an image.** If the AI
generates a picture, the safety promise is theater. If it generates a netlist,
safety becomes a computable property, and every downstream feature — linked
views, build sequencing, BOM, firmware pin mapping, CV comparison targets —
falls out nearly for free.

**The LLM never draws.** It mutates the model through typed, validated tools.

---

## 3. Circuit model

Two representations plus a derivation between them.

### Intent netlist (logical)

What *should* be connected. `LED1.anode` and `MCU.D13` are the same node. No
geometry.

### Physical layout

Parts occupying breadboard holes, plus jumper wires between holes. `LED1` at
hole `12e`, oriented up; wire from `12a` to header `D13`, red.

### Derivation

A breadboard has a fixed, known topology, so a physical layout **implies** a
netlist:

```
deriveNetlist(layout, boardBuses) → Net[]     # union-find over holes
diff(intentNetlist, derivedNetlist) → Divergence[]
```

That diff is the verification engine, and it localizes errors precisely:
*"LED1's anode is in row 13, but the wire you ran lands in row 12 — different
nodes."*

**Validated against real data:** `core/halfBreadboard.fzp` in the Fritzing
corpus declares 420 connectors and **68 buses** — five-hole column groups
(`A98,B98,C98,D98,E98`) and 25-member power-rail segments (`busX-2`, `busY-2`,
`busZ-2`) — already encoded. Hole IDs use `A1`–`E30` naming that matches the
labels printed on physical breadboards. **No breadboard geometry needs to be
hand-modelled.** Microcontroller internal ties come free the same way: the
Arduino Uno part declares `gnd` (5 tied pins), `+5v` (3), `mosi`, `miso`.

### Three payoffs

1. The safety engine is written once and runs twice — on the intent netlist
   before anything is built, and on the derived netlist after placement.
2. Computer vision, added later, gets a *target*: "confirm this expected layout"
   rather than "reconstruct an unknown board" — a dramatically easier problem.
   It slots in as just another producer of a physical layout.
3. The agent's tool calls validate against real part definitions, so a
   hallucinated pin fails at the tool boundary rather than on screen.

---

## 4. Part library

### Source: forked Fritzing corpus

`https://github.com/rakeshgangwar/fritzing-parts` — CC BY-SA 3.0 Unported.

Measured contents:

| Metric | Value |
|---|---|
| Core parts | 1,794 |
| Contrib / obsolete | 375 / 396 |
| Parts with declared buses | 440 |
| Breadboard / schematic SVGs | 1,980 / 2,163 |
| XML parse failures | **0** |
| Repo size | 365 MB (overwhelmingly SVG) |

The `.fzp` format provides per-view connector positions (`svgId`,
`terminalId`) for breadboard *and* schematic, plus `<bus>` internal
connections. This directly supplies the linked-views feature and the netlist
derivation.

### The gap you must fill

Electrical limits exist in the corpus but are **sparse and unnormalized**, not
absent:

```
family      1794   ← universal
package     1301
voltage       75   ← 4%
current       41   ← 2%
power         38   ← 2%
max current   29   ← 2%
```

Values are free text (`0.030A`, `0.25W`) requiring unit parsing. So:

| Layer | Source | Effort |
|---|---|---|
| Geometry, pins, connectivity, artwork | ETL from `.fzp` | The tedious 90%, solved |
| Electrical limits, hazard class, driver metadata | **Hand-authored** | ~12 fields × ~150 parts |

The hand-authored overlay is the product's moat. It is the difference between a
drawing tool and a safety tool.

```yaml
part: led-5mm-red
  polarity: polarized
  forward_voltage_v: 2.0
  max_forward_current_ma: 20
part: arduino-uno-r3
  logic_level_v: 5.0
  pin_max_ma: 20
  port_total_max_ma: 100
  regulator_5v_max_ma: 400
```

**Useful signal:** connector names are consistent enough to auto-classify pin
roles — `gnd` appears 1,989 times across core, `vcc` 471, `5v` 295, `vdd` 207.
This gives an automatable first pass at "which net is a supply rail," which the
rail-short and voltage-domain rules both depend on. Polarity is likewise
semantic: `LED-generic-5mm` names its connectors `cathode` and `anode`.

### Supplementary source: KiCad symbol libraries (optional)

KiCad libraries (CC BY-SA 4.0) have better schematic-symbol coverage than
Fritzing for parts outside the hobby mainstream. Treated as an **optional
supplement for schematic symbols only** — Fritzing remains the primary source
because it is the only one carrying breadboard geometry, which the physical
layer requires. Not needed for Slice 0.

### Licensing structure

Both Fritzing (CC BY-SA 3.0) and KiCad (CC BY-SA 4.0) are share-alike **when
redistributed as a collection**, and serving SVGs to browsers is arguably
distribution. Clean structure:

- **Part library + safety profiles** → the CC BY-SA fork, attribution intact.
- **Application code** → separate repo, separately licensed.

This is legally tidy and makes the enriched library a community asset.

### Deployment note

The ETL emits a **pruned bundle** of the curated subset, not the 365 MB fork.

---

## 5. Safety engine

### The central separation

```
check(circuit, library) → Finding[]
```

**Deterministic rules adjudicate. The LLM only explains.**

A language model that decides whether a circuit is safe is a model that can be
confidently wrong about whether a circuit is safe, with no audit trail. A rule
engine can be unit-tested, reviewed by an engineer, and cited by ID. The LLM's
job is turning `RULE_LED_NO_CURRENT_LIMIT` into a sentence a fifteen-year-old
understands — pedagogy, not judgment.

### Two tiers, with hard asymmetry

```
RuleFinding     ruleId, REFUSE | BLOCKER | WARNING | NOTE   deterministic, tested, CAN GATE
AgentAdvisory   ADVISORY only                               LLM-generated, NEVER gates
```

Severity semantics:

| Severity | Effect |
|---|---|
| `REFUSE` | Agent stops entirely and explains why. Design does not proceed. Reserved for out-of-envelope requests (mains, >48 V). |
| `BLOCKER` | Design proceeds, but the pre-power-up gate will not open until resolved. |
| `WARNING` | Surfaced prominently; does not gate. |
| `NOTE` | Informational, good-practice guidance. |
| `ADVISORY` | LLM-originated, separate labeled band, never gates. |

Rules can override the agent. **The agent can never suppress, downgrade, or
override a rule finding.** This is enforced in the type system — a type with no
field for it is a guarantee; a prompt instruction is a suggestion.

**Advisories must be visually and permanently distinguishable from rules.** If
an LLM guess renders identically to a tested rule, the first false alarm teaches
the student that warnings are noise — and that lesson generalizes to the blocker
that would have saved their board. **Alarm fatigue is the real failure mode of
safety tooling.** Advisories live in their own labeled band ("Copilot noticed
something — unverified"), never styled as a blocker, never in the same list.

### Rule set (initial)

| Rule | Severity |
|---|---|
| LED with no current limiting | BLOCKER |
| Supply rail short (Vcc net ≡ GND net) | BLOCKER |
| MCU pin or aggregate port current exceeded | BLOCKER |
| Voltage domain mismatch (5 V into 3.3 V-only pin) | BLOCKER |
| Polarized part reversed (electrolytic, diode, IC notch) | BLOCKER |
| Inductive load with no flyback diode | BLOCKER |
| Load exceeds source capacity (motor off regulator) | BLOCKER |
| Unprotected LiPo cell | BLOCKER |
| Resistor dissipation over rating | WARNING |
| Breadboard rail current over ~1–2 A | WARNING |
| Missing decoupling cap | NOTE |
| **Any net above 48 V, or a mains-hazard part** | **REFUSE** |

### The learning loop

Advisories are logged with the triggering circuit. Recurring ones get human
review; those that hold up are promoted into tested rules. The rule set grows
from real student mistakes rather than from guessing the hazard list upfront.

```
student circuits → agent advisories → logged → reviewed → new tested rule
                                                              ↓
                                                    gates future builds
```

---

## 6. Agent loop

### Tools

```
searchParts(query)             → library hits    (cannot invent parts)
addPart(defId, ref)            → PartInstance
connect(ref.pin, ref.pin)      → intent net
placePart(ref, hole, orient)   → physical layout
routeWire(holeA, holeB, color)
getCircuit() / runChecks()
```

Every mutation validates at the boundary: the pin must exist on that part
definition, the hole must exist on that board, the part must exist in the
library. A hallucinated pin name fails as a retriable tool error.

### The critical loop detail

**`runChecks()` fires automatically after every mutation, and the agent sees
results before the student does.** The safety engine is the agent's own
guardrail, not only a student-facing gate. When the agent forgets a series
resistor, the rule trips inside the loop and it self-corrects silently. Findings
surface to the student only when they reflect something about *the student's*
build.

---

## 7. Capability envelope

Help is layered. Different project classes get different depths.

| # | Layer | Scope |
|---|---|---|
| 1 | Architecture — requirements to block diagram | Any project |
| 2 | Part selection, sourcing, substitution | Any project |
| 3 | Power budget — capacity, headroom, stall current, runtime | Any project |
| 4 | Netlist & schematic, rule-checked | Discrete-component designs |
| 5 | Breadboard layout, hole-by-hole wiring, step sequence | Breadboard-scale only |
| 6 | Verified build — step confirms, multimeter gates, blockers | Breadboard-scale only |
| 7 | Bring-up & debug — guided diagnostics with measurements | Any project |

### Worked examples

- **Smart home device** (ESP32 + I²C sensors + relay) — full stack, layers 1–7.
  Dead center of the design; hazards match the rule set exactly.
- **Smart speaker** — full stack *if* I²S digital modules (INMP441,
  MAX98357A). Analog audio on a breadboard is genuinely bad hardware and the
  tool should say so. Note this is a **topology** distinction, not an
  application one.
- **Robot** — split. Motor driver, encoders, battery, MCU are in scope and the
  motor rules are strong here. Chassis, gearing, mechanics are outside the model
  and the agent must not pretend otherwise.
- **Drone** — layers 1–3 and 7 only, and that is the *correct* answer. ESCs and
  flight controllers are COTS, wiring is soldered XT60, currents run 30–100 A
  against a breadboard rated 1–2 A. The rail-current rule refuses it correctly.
  The agent still helps substantially with motor/prop/battery budgeting,
  connector selection, and preflight checks.

### Degrade, don't refuse

Not a whitelist. **Graceful degradation with an explicit statement of depth:**

> *"I can plan this drone's power system and size your battery and ESCs. I'm not
> going to draw a breadboard for it — at 60 A this doesn't get prototyped that
> way, and I can't verify the build. Here's what I can check instead."*

Same logic as the mains boundary, applied to a second axis. More honest than
either refusing or bluffing, and an ambitious student still gets real help where
the help is real.

---

## 8. Build sequence and power-up gate

Steps are **derived from the layout**, ordered by a rule that is itself a safety
principle:

```
0. Disconnect all power
1. Place ICs and modules      ← orientation-critical, done unpowered
2. Place passives
3. Route signal wires
4. Route power wires LAST     ← every mistake so far was made on a dead board
5. ══ PRE-POWER-UP GATE ══
6. Apply power
7. Flash firmware
8. Guided bring-up
```

Each step highlights affected holes in **both views simultaneously** — the
schematic net and the physical wires light up together. This is where linked
views earn their keep pedagogically: students learn the translation by watching
it repeatedly.

### The gate (step 5)

Will not open until:

- Every `BLOCKER` finding is resolved
- Rail-to-rail continuity reads **open** (student enters result — this single
  check catches the most destructive error class)
- Polarized parts confirmed oriented
- Supply voltage measured *before* connection

**A lightweight DC solve over the netlist yields predicted values**, so checks
are precise rather than generic: *"measure across R1 — expect ~220 Ω"*, *"expect
~45 mA total draw."* Measured current far above predicted is a short, caught
before it becomes smoke.

To be explicit about scope: this is **resistive DC nodal analysis with simple
diode/LED forward-drop models — not SPICE.** No transient, AC, or
small-signal analysis. The goal is predicting what a multimeter will read at the
gate, not simulating the circuit. Parts whose behaviour the solver cannot model
(modules, ICs) contribute a declared quiescent current from their safety profile
and are otherwise treated as black boxes.

### Ground-truth layers, ranked by safety value per unit of effort

1. **Analytical** — free, catches the most. Runs pre-build on the intent netlist.
2. **Measurement prompts** — cheap, catches the worst. Zero CV required.
3. **Step confirmation** — nearly free; the build sequence already exists.
4. **Photo / CV** — expensive, catches least at first. Deferred to Slice 4.

Leading with CV is the classic way to spend six months and ship nothing.

---

## 9. Firmware

### The contract

**The netlist is the contract between hardware and firmware.** Pin assignments
are derived from the circuit model, never authored by the LLM:

```c
// GENERATED — from circuit model, do not edit
#define DHT_DATA_PIN   4     // net: DHT22.data ↔ ESP32.GPIO4
#define RELAY_CTRL_PIN 26    // net: RELAY.in   ↔ ESP32.GPIO26
```

Rewire the board and the pin map regenerates. **Code and circuit cannot drift** —
which eliminates the most common source of "it doesn't work."

### Hardware/firmware cross-checks

Having both models unlocks a rule class **neither half can catch alone**. This is
the strongest argument for firmware being in scope.

| Cross-check | Consequence if missed |
|---|---|
| Pin set `OUTPUT HIGH`, wired to GND | Dead short through the GPIO — destroys the MCU |
| `analogWrite` on inductive load with no flyback | Kills the driver transistor |
| I²C device on non-I²C-capable pins | Silent failure, hours lost |
| Two I²C devices at the same address | Classic, maddening, trivially detectable |
| Pin driven in firmware, unconnected in circuit | Catches wiring omissions pre-power-up |

These run in the same engine, over the union of both models.

### Toolchain: `arduino-cli`, not PlatformIO

PlatformIO never officially shipped support for Arduino ESP32 Core 3.x (released
2024); the ecosystem's answer was a community fork,
`pioarduino/platform-espressif32`. Since the entire firmware guarantee rests on
*"it compiled, therefore the API is real,"* betting that gate on a toolchain that
cannot build current cores for the most popular hobby chip is unacceptable
supply-chain risk.

**`arduino-cli` is the primary build backend** — maintained by Arduino, tracks
official cores, JSON output, designed for automation. PlatformIO optional.

### Language targets

- **Arduino C++ via `arduino-cli`** — the only generated *application* target.
- **MicroPython** — the **interactive bring-up REPL only**, not a second
  codegen path.

Rationale: C++ covers everything MicroPython does on capability. Python's real
advantage is **loop speed during bring-up** — compile-flash-observe is a
30-second cycle; a REPL is one second. Layer 7 debugging is fundamentally
interactive (scan the I²C bus, read a register, toggle a pin), and doing that
through recompiles is miserable. Keeping Python as the diagnostic instrument
captures that value without doubling codegen, driver metadata, or library
curation.

### Library resolution chain

The dominant failure of LLM-written embedded code is **hallucinated library
APIs**. Web search alone doesn't fix it — a confident 2019 blog post is exactly
how you get a plausible non-existent call. So discovery is fallible and
verification is deterministic:

```
1. Curated driver metadata          trusted, pinned version
2. ↓ miss → structured registries    Arduino library_index.json, PlatformIO
                                     registry (index metadata only — the build
                                     backend remains arduino-cli)
3. ↓ miss → web search               find the library's actual repo
4. ↓       read ground truth         headers + keywords.txt, NOT prose docs
5. ⇒ VERIFY BY COMPILING             sandbox build against pinned version
6. ⇒ promote to curated metadata     next student gets it from tier 1
```

**The compiler is the arbiter, not the web page.** An API that compiles against
a pinned version is real regardless of source; one that doesn't is rejected
regardless of how authoritative the source looked. Arduino libraries ship
`keywords.txt` and `library.properties`, and headers are the actual API surface —
better ground truth than documentation.

### Codegen structure

```
deterministic scaffold   pin map, includes, library init, setup()/loop() skeleton
LLM region               application logic, inside explicitly bounded blocks
```

**Code must compile before the student sees it.** `arduino-cli` in a sandboxed
container, errors fed back to the agent, up to 3 repair attempts. Handing a
beginner code that doesn't build is worse than nothing — they can't tell whose
fault it is. After 3 failed attempts the agent reports the failure and the
compiler output rather than presenting the code as working.

### Flashing

ESP32 and RP2040 flash directly from Chrome via WebSerial / esptool-js. No local
toolchain install for the student, which matters enormously for this audience.

### Deliberate non-goal: Zephyr

Architecturally, Zephyr's devicetree *is* a hardware description generating the
firmware's view of pins and peripherals — the circuit model could emit a
`.overlay` directly. Elegant. But Zephyr has drivers for proper silicon, not for
the unbranded DHT22 clone from a 10-pack. Library resolution would fail
constantly at tier 1 and the compile gate would reject working hardware. The
Arduino ecosystem's sprawling, uneven, community-written library set is precisely
what makes it usable here. **Logged as a promising advanced tier; not built on
now.**

---

## 10. Sourcing

A BOM is another projection of the netlist.

### APIs

| Source | Free tier | Verdict |
|---|---|---|
| DigiKey API | ~1,000 searches/day | **Primary** |
| Mouser Search API | Free with key | Secondary |
| Nexar / Octopart | 1,000 *results*/month | Too tight to build on |

**Caveat:** this audience mostly doesn't shop at DigiKey — they buy modules from
Adafruit, SparkFun, Amazon, AliExpress. Realistically: distributor APIs for
discretes, plus a curated vendor-SKU table for modules (Adafruit and SparkFun
publish stable product IDs).

### Two things that make sourcing more than commerce

1. **The shop step is a safety surface.** It's where you enforce the ¼ W
   resistor over the ⅛ W, the fused holder, the *protected* LiPo. Buying the
   wrong part is a hazard that occurs before any wiring does.
2. **Substitution is the sleeper feature.** *"I don't have 220 Ω, I've got
   330 Ω — will it work?"* The netlist model answers that with the arithmetic
   shown. Arguably more valuable day-to-day than a buy button, and nearly free
   once the model exists. **Substitution ships in the core slice** (no external
   APIs needed); buy links and live pricing come later.

---

## 11. Testing

Part of the system is nondeterministic; part must never be wrong. Different
treatment.

**Tier 1 — safety regression suite (highest severity).** A corpus of
known-dangerous circuits that must always be caught: reversed electrolytic, LED
direct across 5 V, motor off the regulator, shorted rails, GPIO driven high into
ground. Any regression here is a release blocker in the strongest sense. This
suite *is* the product's central claim, expressed as tests.

**Tier 2 — deterministic units.** Each rule gets one tripping fixture and one
non-tripping fixture. Netlist derivation gets property tests over known layouts.
The ETL gets golden-file tests across all 1,794 core parts — a clean parse is
already confirmed, so that baseline is enforceable from day one.

**Tier 3 — agent tested on artifacts, not prose.** The key technique for testing
an LLM product: **assert on the circuit model the agent produced, not on what it
said.** "Build me a temperature logger" → assert the netlist has a sensor on a
valid I²C pair, pull-ups present, zero blocker findings. The model is
deterministic even when the path to it isn't. Prose gets sampled evals;
structure gets hard assertions.

**Tier 4 — end-to-end golden projects.** ~20 canonical builds (blink, I²C sensor
node, relay, motor, logger) that must survive the full pipeline: design → check →
build steps → firmware compiles in CI. The compile gate doubles as a test.

### Error handling policy

| Situation | Behavior |
|---|---|
| Part not in library | Say so. Never invent a pinout. |
| Agent and rule engine disagree | Rule wins. Always. |
| Compile fails after 3 repair attempts | Surface honestly; never ship unbuilt code. |
| Distributor API down | Degrade to cached prices, labeled stale. |
| Measured value ≠ predicted | Stop the build. Don't advance the gate. |
| Request outside safe envelope | Degrade with explicit statement of depth. |

---

## 12. Slices

```
Slice 0  Foundation      fzp ETL, part model, curated ~150-part subset,
                         safety profile schema + authoring tooling
Slice 1  Core       ★    netlist model, union-find derivation, linked
                         schematic + breadboard render, build sequence,
                         safety engine, power-up gate, agent loop,
                         substitution checks
Slice 2  Sourcing        BOM projection, DigiKey/Mouser, vendor SKU table
Slice 3  Firmware        pin-map codegen, arduino-cli compile sandbox,
                         hw/fw cross-check rules, WebSerial flashing,
                         MicroPython bring-up REPL
Slice 4  Photo verify    targeted CV checks against expected layout
Slice 5  Wide domains    layers 1–3 for drone/robot-class projects
```

**Slice 1 must be genuinely good** — everything after it is a projection of the
model it establishes.

Slices 2 and 3 are swappable. Sourcing is sequenced first, but firmware is the
more compelling demo and exercises the cross-check rules, arguably the product's
most novel feature. Decide at the time.

### Scope of this document vs. scope of the next implementation plan

This document is a **full-vision spec** covering all six slices, written that way
deliberately. It is *not* a single implementation plan.

**Only Slices 0 and 1 should go into the first implementation plan.** Slices 2–5
each warrant their own spec → plan → implementation cycle once the core model
exists and has been validated against real student use. Treating this whole
document as one buildable unit would be a mistake.

---

## 13. Recurring house pattern

The same shape appears four times. Worth recognizing as a deliberate principle:

> **Cheap fallible discovery → deterministic verification → promotion into the
> trusted tier.**

| Instance | Discovery | Verification | Promotion |
|---|---|---|---|
| Safety rules | LLM advisory | Human review | Becomes a tested rule |
| Library APIs | Web search | Sandbox compile | Becomes curated driver metadata |
| Build correctness | Predicted DC values | Student's measurement | Gate opens |
| Photo verify (later) | CV read of board | Diff vs expected layout | Step confirmed |

Anywhere the system is tempted to trust a language model or an external source
directly, this pattern is the alternative.
