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

### Scope boundaries

> ⚠️ **Both original non-goals here have been superseded.** PCB layout and
> manufacturing are now in scope (docs/decisions.md D22), and mains is gated
> rather than refused (D32). This section records the current position.

**Mains AC — tiered behind a safety valve, not refused.**

| Tier | Covers | Gate |
|---|---|---|
| A | Certified AC-DC module; maker's design entirely low-voltage | none — recommended |
| B | Switching/sensing mains: relays, SSRs, triacs | explicit opt-in |
| C | Designing the supply: rectifier, SMPS primary, isolation barrier | explicit opt-in + warnings |

**Opening the valve adds rules; it never removes them.** Mains tiers activate a
stricter set — IPC-2221 clearance and creepage, fusing, earth bonding, isolation
barrier width, relay ratings, snubbers, control-side isolation.

**Absolute, at every tier:**

- ⛔ **Mains on a breadboard is refused, always.** No creepage, contacts rated
  ~1–2 A, exposed conductors. The most likely way someone could be killed using
  this tool.
- ⛔ **No CV verification of mains.** Slice 4 stays low-voltage only.
- ⛔ **We never certify.** Compliance is prepared for, never claimed (D31).

**Still out of scope:** controlled-impedance and RF layout, multi-layer HDI,
safety-critical applications, and DFM beyond a few hundred units. In each case
the tool says so and hands over cleanly.

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
| `REFUSE` | Agent stops entirely and explains why. Design does not proceed. Reserved for genuinely unacceptable requests — mains on a breadboard, or high voltage with no tier opened. |
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
| **Mains part or net >48 V on a breadboard** | **REFUSE** *(absolute — no tier opens this)* |
| **Mains part or net >48 V with no tier opened** | **REFUSE** *(offers to open the valve)* |

### Mains rule set — activated by tier, not deactivated

Opening a tier turns *on* rules that don't otherwise exist. These are PCB-level
geometry rules, so most land with Phase 3 rather than Slice 1:

| Rule | Tier | Severity |
|---|---|---|
| Clearance below IPC-2221 for the working voltage | B, C | BLOCKER |
| Creepage below rating for pollution degree / material group | B, C | BLOCKER |
| No fuse on the mains input | B, C | BLOCKER |
| Control side not isolated from mains side | B, C | BLOCKER |
| Relay/SSR contact rating exceeded by the load | B, C | BLOCKER |
| Exposed conductive part not earth-bonded | B, C | BLOCKER |
| Isolation barrier width below standard | C | BLOCKER |
| Inductive mains load with no snubber | B, C | WARNING |
| Non-certified supply where a certified module exists | B, C | NOTE |

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

## 8. User experience

### 8.1 The premise everything follows from

Every eCAD tool — Flux, KiCad, EasyEDA — assumes a **seated designer with free
hands and full attention.** That assumption is false for most of this product's
actual usage.

While building, the student has both hands occupied (wire, tweezers, component),
eyes on the breadboard rather than the screen, possibly a multimeter probe in
each hand, and the display at arm's length off to one side. Mouse-precision UI
is simply wrong in that posture.

The closest solved analogue is not CAD. It is **cooking apps in recipe mode**:
hands covered in flour, device propped on the counter, large glanceable steps,
minimal interaction.

### 8.2 Three modes, not one canvas

| Mode | Posture | UI |
|---|---|---|
| **Design** | Seated, hands free, thinking | Chat + linked schematic/breadboard canvas. Conventional web app. |
| **Build** | Standing, hands busy, eyes on board | Full-screen, one step, large type, everything irrelevant dimmed. Chat hidden. |
| **Bring-up** | Meter in hand, board powered | Measurement entry, MicroPython REPL, diagnostic tree. |

Competing tools have only Mode 1. **Modes 2 and 3 are the entire
differentiation** — and are therefore where design effort should concentrate,
which is the opposite of where it naturally wants to go, because Mode 1 is the
more enjoyable one to build.

### 8.3 Devices: desktop primary, phone companion

Forced by a hard platform constraint: **Web Serial is desktop-only.** Not
implemented on Android Chrome, absent on iOS. Firmware flashing therefore cannot
happen on a phone, while the camera and bench-side ergonomics want one.

The phone is a **thin, purpose-built bench instrument, not a mirror** of the
desktop UI:

```
PHONE                          DESKTOP
current step, large type       chat, canvas, schematic
camera capture                 firmware, flashing, BOM
measurement entry + Next       everything else
```

A step display, a number pad, and a camera. Small enough to stay honest, and it
maps exactly to the three moments the student is away from the keyboard.

- **Pairing:** QR code shown at the design→build transition. PWA, no app install.
- **The phone is never required.** Desktop-only works, with webcam fallback for
  photo checks. Gating a build on successful pairing would be a self-inflicted
  wound.
- **Sync is state, not UI.** Both clients subscribe to the server-side circuit
  model. Another dividend of the Section 2 decision.

### 8.4 Ownership boundary: who may edit what

**The student owns the physical layout. The agent owns the intent netlist.**

- Parts may be dragged, wires moved, the board freely rearranged. That mutates
  the *physical layout*, which the derived-netlist diff already checks. Many
  layouts validly satisfy one circuit; a rearrangement that still satisfies
  intent passes silently, and one that breaks intent flags immediately.
- Changing *what connects to what* is a design decision and goes through
  conversation, where the agent can explain consequences before they land.

The elegance: a student **rearranging** the board and a student **mis-wiring**
the board are the same operation to the system — a physical layout change,
checked against intent. Direct manipulation is therefore safe and cheap to
allow, which is not usually true of drag-and-drop editors, and it avoids the
thing that would make the tool insufferable for an experienced maker: having to
ask permission to nudge a component.

### 8.5 The gate collects data, never consent

**Never ask a yes/no safety question.**

```
❌  "Did you check continuity across the rails?   [Yes] [No]"
✅  "Continuity mode, red rail to blue rail. What does it read?  [____]"
```

The yes/no form is compliance theatre — every student clicks Yes, and worse, it
*trains* them that the safety layer is a formality to dismiss. It caps a rigorous
rule engine with a lie detector that detects nothing.

Asking for the value changes three things at once:

1. **Faking requires effort and invention**, and because the DC solver predicts
   the expected value, an implausible entry is detectable. `0.2 Ω` where open
   circuit was expected is not a failed checkbox — it is a **caught short**.
2. **The safety check and the lesson are the same action.** The student learns
   to use a meter and learns what values to expect. Safety is not a tax on
   learning; it *is* the learning.
3. It reads as **preflight, not paperwork.** Pilots do not resent checklists.
   That framing is the whole difference between a tool students respect and one
   they route around.

### 8.6 Two gate tiers

A multimeter is **optional**, and its absence weakens the gate *audibly*.

```
VERIFIED GATE  (meter present)
  ✓ all BLOCKERs resolved      ✓ rail continuity = open
  ✓ polarity confirmed         ✓ supply voltage measured
  ✓ draw within predicted

VISUAL GATE  (no meter) ── confidence: reduced, and stated out loud
  ✓ all BLOCKERs resolved      ✓ polarity confirmed visually
  ✓ layout matches expected
  ✗ cannot detect a short circuit — the most common way boards die
```

The honest message is also the persuasive one: *"I've checked your design and
your visible wiring. I can't tell you whether there's a short, which is the most
likely thing to destroy this board. A cheap multimeter fixes that permanently."*
This makes a meter the obvious first line of the BOM. An inline USB power meter
is a cheaper partial substitute for USB-powered builds, showing live current
draw.

### 8.7 Advisories must never look like blockers

Per Section 5, the two tiers cannot blur. In practice they share no container, no
colour, and no shape:

```
┌────────────────────────────────────────┐
│ ⛔  BLOCKED — LED1 has no current limit │  solid, red, undismissable,
│     Add a 220 Ω resistor in series      │  gates the step, cites rule ID
└────────────────────────────────────────┘

  ╭ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ╮
    💭 Copilot noticed — unverified        dashed, muted, dismissible,
    Your wires are all red; consider…      never blocks, never red
  ╰ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ╯
```

A student should be able to tell them apart from across the room, without
reading.

### 8.8 Onboarding: ask what they own

The opening question is **not** "what do you want to build?" — intimidating for a
beginner facing a blank canvas. It is **"what's in your parts bin?"** (or scan
the kit box).

- Easy to answer, requires no ambition or vocabulary.
- Everything the agent proposes is then buildable **tonight, with what's on the
  bench** — enormously more motivating than a design blocked on a week's
  shipping.
- It bootstraps the substitution feature, already in the core slice.
- **It infers skill level without asking.** "An Arduino starter kit" and "a hot
  air station, bench PSU, and a scope" are not the same person, and neither had
  to self-classify.

Self-reported skill is unreliable in both directions and being asked to rate
yourself before building anything feels like a test. Instead: adapt **explanation
depth**, keep the UI constant, and offer inline *"more detail"* / *"skip the
explanation"* controls — because expertise is not one-dimensional, and a student
may be strong on code and shaky on circuits within a single project.

### 8.9 Pedagogy: an explicit per-project mode

**The central tension: the better the agent is at building the circuit for them,
the less the student learns.** An agent that silently emits a correct,
safety-checked design and a hole-by-hole wiring list produces a student who can
assemble but not design, and who is helpless away from the tool.

Resolution: an **explicit mode toggle**, chosen per project — named by outcome
rather than by effort, because "build it for me" versus "teach me" reads as
*fast* versus *slow*, and slow always loses.

```
"Working circuit tonight"      vs      "I want to understand this"
```

Four things stop the toggle from collapsing into the fast path:

1. **Safety blockers explain themselves in both modes.** Every blocker carries
   reasoning and arithmetic, delivered at a moment of genuine stakes — the
   student's own board. The learning floor is never zero. The rule engine is,
   almost accidentally, a curriculum.
2. **Per project, not per account.** A global setting chosen during onboarding,
   before the student knows what either option feels like, is the version that
   never gets revisited.
3. **Persistent visible toggle**, not buried in settings.
4. **Offer the switch at maximum motivation** — not upfront, but when the
   circuit is dead and the student wants to know why. *"Want me to walk you
   through finding this yourself?"*

### 8.10 "It doesn't work" is a first-class entry point

The most common student state, and buried in help by most tools. Here it is a
permanent, prominent affordance — and it opens a **targeted binary search**, not
a FAQ, because the system knows the intended netlist, the predicted voltage at
every node, which build steps were confirmed, and what firmware is running:

> *"Measure at the regulator output — expect 3.3 V."* → *"Good. Now the sensor's
> VCC pin."*

Two or three measurements localise most faults. This diagnostic is the payoff for
everything else in the architecture, and is likely the feature students describe
to their friends.

### 8.11 Refusals lead with capability

Degradation (Section 7) never opens with the limitation:

> ❌ *"I can't design a drone."*
>
> ✅ *"Here's your power budget, battery sizing, and ESC selection — and here's
> why I'm not drawing a breadboard for a 60 A system."*

Same information; the student leaves with work in hand rather than a door closed.

---

## 9. Build sequence and power-up gate

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

## 10. Firmware

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

## 11. Sourcing

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

## 12. Testing

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

## 13. Slices

```
Slice 0  Foundation      fzp ETL, part model, curated ~150-part subset,
                         safety profile schema + authoring tooling
Slice 1  Core       ★    netlist model, union-find derivation, linked
                         schematic + breadboard render, build sequence,
                         safety engine, power-up gate, agent loop,
                         substitution checks
                         UX: design mode + build mode (desktop), measurement
                         gate, blocker/advisory separation, parts-bin
                         onboarding, pedagogy toggle, "it doesn't work" entry
Slice 1b Phone companion QR pairing, thin bench UI (step / measurement /
                         camera), model state sync
Slice 2  Sourcing        BOM projection, DigiKey/Mouser, vendor SKU table
Slice 3  Firmware        pin-map codegen, arduino-cli compile sandbox,
                         hw/fw cross-check rules, WebSerial flashing,
                         MicroPython bring-up REPL
Slice 4  Photo verify    targeted CV checks against expected layout
Slice 5  Wide domains    layers 1–3 for drone/robot-class projects
```

**Slice 1 must be genuinely good** — everything after it is a projection of the
model it establishes.

**Slice 1b is separable on purpose.** Because the phone is never required
(§8.3), desktop-only build mode is a complete experience with a webcam fallback.
Ship the core, then improve bench ergonomics. Note that Slice 4 (photo
verification) benefits enormously from 1b existing first — a phone camera aimed
at a breadboard is a far better input than a laptop webcam.

Slices 2 and 3 are swappable. Sourcing is sequenced first, but firmware is the
more compelling demo and exercises the cross-check rules, arguably the product's
most novel feature. Decide at the time.

### Scope of this document vs. scope of the next implementation plan

This document is a **full-vision spec** covering all slices, written that way
deliberately. It is *not* a single implementation plan.

**Only Slices 0 and 1 should go into the first implementation plan.** Slices 1b
and 2–5 each warrant their own spec → plan → implementation cycle once the core
model exists and has been validated against real student use. Treating this whole
document as one buildable unit would be a mistake.

---

## 14. Recurring house pattern

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
