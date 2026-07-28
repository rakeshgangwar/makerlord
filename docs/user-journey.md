# User Journey — End to End

How the product actually feels to use, what the maker sees at each step, and
what files exist on disk when they're done.

Worked throughout with one project: **a soil moisture sensor reporting to Home
Assistant.**

Read [roadmap.md](roadmap.md) for the stage definitions. This is the experience
layer over them.

---

## 1. The four surfaces

| Surface | Where | For |
|---|---|---|
| **Desktop web app** | At a desk | Conversation, canvas, PCB and 3D inspection, flashing, decisions |
| **Phone companion** | At the bench | Current step, measurement entry, camera. Thin by design (spec §8.3) |
| **The project repo** | Server-hosted git, optionally cloned | **The artifacts. The maker owns these.** |
| **External tools** | Launched from the project | KiCad, slicer, CAD, a fab's uploader |

The third surface is the one that's easy to miss and matters most: **the maker's
real output is files, and they should own them.**

---

## 2. The project is a git repository

Each project is a **real git repo, hosted by us, clonable by the maker.**

```
                 ┌────────────────────────────┐
                 │  server-hosted git repo    │  ← canonical
                 │  one per project           │
                 └──────┬──────────────┬──────┘
             commits    │              │   clone / push
                 ┌──────▼──────┐   ┌───▼────────────┐
                 │  web app    │   │ maker's disk   │
                 │ (browser)   │   │ KiCad, editor  │
                 └─────────────┘   └────────────────┘
```

- **Browser-only makers never clone.** The web app commits to the server repo.
  Works on a Chromebook.
- **Power users clone**, work in their own tools, and push. We see the commits.
- **We do not reimplement sync or conflict resolution.** Git already solved it.
  The web app refuses to write a diverged tree and says "pull first." It never
  force-pushes.

**Why git rather than rows in a database:**

- **Revision control is a production requirement**, not a nicety. v1 board vs v2
  board, what changed, why.
- **`git diff` on a netlist is a genuinely useful review.**
- **Branches are design alternatives.** *"Try it with an ESP32-C3"* is a branch.
- **`history` (D29) wants to be git history**, not a table.
- **The maker keeps their work.** If we disappear they still have a KiCad
  project, firmware, and printable STLs.
- **Everything downstream is already files.**

### Two hardware-specific departures from software habit

**Commit the build outputs.** In software you gitignore `build/`. Here you must
not — *"what exactly did I send to the fab?"* is a debugging question, a warranty
question, and a compliance requirement. The technical file depends on it.

This makes **tags load-bearing**: `v1.0-fab` marks the exact commit whose gerbers
went to the fab.

**Git LFS from day one** for `**/*.step`, `**/*.stl`, `**/*.glb`. These are
MB-scale and the repo gets fat fast otherwise.

### A useful coincidence

**Cloning locally happens at the same moment as the KiCad ownership handoff
(§5).** Stage ⑨ is where the maker takes the wheel in both senses — the tool
stops generating layout, and the files move to their machine. One conceptual
transition rather than two.

Local clone also buys **offline bench work**, which matters in a garage with bad
wifi.

---

## 3. What a finished project contains

`←` generated · `✎` maker-owned · `⇄` generated then handed over

```
soil-sensor/
├── project.json              ←  THE MODEL. source of truth
├── feasibility.md            ←  prior art, verdict, rough cost
├── requirements.md           ←  numeric, testable
├── architecture.md           ←  blocks, make/buy decisions
├── DECISIONS.md              ←  the history facet
│
├── circuit/
│   ├── netlist.json          ←
│   ├── schematic.svg         ←
│   ├── breadboard.svg        ←
│   └── build-steps.md        ←  human-readable, printable
│
├── sim/
│   ├── circuit.cir           ←  ngspice netlist
│   └── results/*.csv *.png   ←  traces
│
├── firmware/
│   ├── include/pins.h        ←  GENERATED — never hand-edit
│   ├── src/main.cpp          ⇄  scaffold generated, logic yours
│   ├── sketch.yaml           ←
│   └── build/firmware.bin    ←
│
├── pcb/
│   ├── soil.kicad_sch        ⇄  generated, then yours
│   ├── soil.kicad_pcb        ⇄  we seed placement, you route
│   ├── erc-report.txt        ←
│   ├── drc-report.txt        ←
│   └── fab/
│       ├── gerbers/*.g*      ←
│       ├── drill/*.drl       ←
│       ├── bom.csv           ←
│       ├── cpl.csv           ←  pick-and-place
│       └── board.step        ←  needs --subst-models (D28)
│
├── enclosure/
│   ├── enclosure.py          ⇄  CadQuery source, editable
│   ├── enclosure.step        ←
│   ├── enclosure.stl         ←  print this
│   └── fit-report.md         ←  collision + clearance
│
├── manufacturing/
│   ├── bom-sourced.csv       ←  MPNs, price, stock, lifecycle
│   ├── cost-model.md         ←  qty 1 / 10 / 100 / 1000
│   └── dfm-report.md         ←
│
├── test/
│   ├── test-plan.md          ←  derived from requirements.md
│   └── results/              ✎  first-article data
│
├── compliance/
│   ├── technical-file/       ←  accumulates from stage ④ onward
│   ├── checklist.md          ←
│   └── doc-draft.md          ←  Declaration of Conformity
│
└── docs/
    ├── assembly-guide.md     ←
    ├── user-manual.md        ←
    └── README.md             ←
```

**Everything from `circuit/` down is a projection of `project.json`.** That is
D2 paying out across the whole arc.

---

## 4. Stage by stage

### ① Idea — *low pressure*

**Sees:** a text box. Not a blank canvas — a blank canvas is intimidating.
**Does:** *"I want something that tells Home Assistant when my plants need
water."*
**Feels:** like talking to someone who knows the domain. No commitment yet.

### ② Feasibility — *honest, sometimes deflating, trust-building*

**Sees:** prior art — three existing projects, what they used, what went wrong.
A rough cost. A verdict.
**Feels:** occasionally *"honestly, buy this £25 one — building it costs more and
does less."*

> **The tool that sometimes talks you out of a project earns the credibility
> that carries every later recommendation.**

**Produces:** `feasibility.md`

### ③ Requirements — *mild homework, produces clarity*

**Sees:** the agent pushing back on vagueness. *"'A long time' — a month or a
year? How often should it read?"*
**Does:** answers four or five questions.
**Feels:** slightly interrogated, and worth it.
**Produces:** `requirements.md` — *≥6 months on 2×AA, one reading/hour, 0–40 °C,
±5% RH*

Load-bearing, not a formality: this is where the project becomes computable
(D30).

### ④ Architecture — *first "oh, this is real"*

**Sees:** a block diagram. Parts with real names. A power budget that already
says whether 6 months is achievable.
**Does:** make/buy calls — *"use the certified module, don't design the supply."*
**Feels:** the shape appears.
**Produces:** `architecture.md`, `bom-draft.csv`

Compliance constraints start here (D33): prefer pre-certified radio and power
modules.

### ⑤ Simulate — *cheap confidence*

**Sees:** traces. A caught mistake, or a green tick.
**Feels:** fast and free — nothing has been bought yet.
**Produces:** `sim/circuit.cir`, result plots

### ⑥ Prototype ★ — *hands busy, phone propped, recipe mode*

**Sees (desktop):** schematic and breadboard, cross-linked.
**Sees (phone):** one step, large type, everything else dimmed.
**Does:** places parts hole by hole. Power wires last.
**The gate:** *"Continuity mode, red rail to blue rail. What does it read?"* — a
number, never a checkbox (D15).
**Feels:** **preflight, not paperwork.** Deliberate, faintly ceremonial.

This is the emotional core of the product.

**Produces:** `build-steps.md`, `breadboard.svg`

### ⑦ Firmware — *a wait, then magic*

**Sees:** compile output, then a flash progress bar.
**Does:** clicks flash. WebSerial, no toolchain install.
**Feels:** ~30 seconds of nothing, then **an LED blinks.** First real payoff.
**Produces:** `pins.h` (generated), `main.cpp`, `firmware.bin`

### ⑧ Debug — *the biggest emotional swing*

**Sees:** *"It doesn't work"* as a permanent, prominent button. Then a binary
search, not a FAQ.
**Does:** *"Measure at the regulator output — expect 3.3 V."* → *"0.2 V."* →
*"Found it."*
**Feels:** frustration → guided → **relief.**

Probably the thing people tell their friends about.

### ⑨ PCB — *"my thing is a real board"*

**Sees:** a schematic in hierarchical sheets (D27), a board with parts placed and
a ratsnest.
**Does:** routes it, or autoroutes and refines. **Opens KiCad here.**
**Feels:** a genuine milestone — and the first time they are driving.
**Produces:** `.kicad_sch`, `.kicad_pcb`, ERC/DRC reports

EMC-aware layout rules apply here (D33).

### ⑩ Enclosure — *the second milestone*

**Sees:** a 3D view in the browser (GLB — no plugin), board inside case,
connector cutouts aligned to real footprint positions.
**Feels:** it looks like a product.
**Produces:** `enclosure.py`, `.step`, `.stl`, `fit-report.md`

### ⑪ Manufacturing prep — *sticker shock, usually*

**Sees:** £61 at qty 1. £14 at qty 100. Then the DFM report.
**Feels:** the reality check that turns a project into a product decision — or
ends it.

> **Needs framing, not just numbers.** "Here's what changes at qty 100, and
> here's the cheapest single change that moves it" beats a bare figure.

**Produces:** `cost-model.md`, `dfm-report.md`, `bom-sourced.csv`

### ⑫ Fabricate — *anxiety and commitment*

**Sees:** quotes compared. A checklist of exactly what they're about to spend.
**Feels:** the first irreversible step. Money leaves.
**Produces:** an order, and a `v1.0-fab` tag on the exact commit sent

### ⑬ First article — *peak anticipation*

**Sees:** a structured check — does the board that arrived match the design?
**Feels:** unboxing. The highest point in the whole arc.

### ⑭ Test — *systematic*

**Sees:** a test plan generated from `requirements.md` — every number becomes a
check.
**Produces:** `test-plan.md`, `test/results/`

### ⑮ Compliance — *dread, and it shouldn't be*

**Sees:** a checklist mostly already satisfied, because the constraints were
applied at ④, ⑨ and ⑩ (D33).
**Feels:** should feel like *"you're 80% there, here's the gap and what it
costs"* — not a wall.
**Produces:** `technical-file/`, `checklist.md`, `doc-draft.md`

### ⑯ Document · ⑰ Produce — *nearly free, then repetitive*

Assembly guide, user manual, DoC — projections of a model that already holds
everything. Then yield tracking, and v2 as a branch.

---

## 5. The ownership handoff

At stage ⑨ the maker opens KiCad and moves things. **Who owns the layout now?**

**Decision: an explicit one-way handoff** (D34).

```
we own          →  netlist, schematic generation, initial placement
handoff at ⑨    →  the maker opens KiCad
they own        →  layout, routing, refinements
we then only    →  re-verify (DRC), and offer netlist updates the way KiCad's
                   own update-from-schematic works — preserving placement
```

**The tool leads, hands over, then verifies.** Not automation forever.

**Rejected — regenerate and warn:** would destroy hours of routing at least
once, and feels hostile.
**Rejected — round-trip sync:** best when it works, and notoriously fragile.
Silent corruption of a design someone is about to spend money fabricating is an
unacceptable failure mode.

**This must be said out loud in the UI at the moment of handoff**, or it will
feel like the tool broke.

The same applies to `firmware/src/main.cpp` (scaffold generated, logic theirs)
and `enclosure/enclosure.py` (generated, then editable). `pins.h` is the
exception — always generated, never hand-edited, because that's what stops code
and circuit drifting.

---

## 6. Four postures, not seventeen modes

Seventeen stages could imply a dozen UIs. It shouldn't. There are four postures,
and every stage maps to one:

| Posture | Stages | Shape |
|---|---|---|
| **Converse** | ① ② ③ ④ | Chat, low density, one question at a time |
| **Inspect** | ⑤ ⑨ ⑩ | Canvas, high density, zoom and pan |
| **Bench** | ⑥ ⑦ ⑧ ⑬ | Full screen, huge type, hands busy, phone-friendly |
| **Decide** | ⑪ ⑫ ⑭ ⑮ | Report plus a button that costs money |

Keeping to four is what makes the product learnable at this scope.

---

## 7. The emotional arc

```
            ⑦ blink     ⑨ board      ⑬ unboxing
               ▲           ▲              ▲
        ───────┼───────────┼──────────────┼────────
               ▼           ▼              ▼
            ⑧ debug     ⑪ cost       ⑮ compliance
```

**Two design implications:**

**Design loudest at the troughs.** Debug is where the diagnostic earns its keep.
Cost needs framing, not a bare number. Compliance needs a path, not a wall.
A tool that only feels good at the peaks loses people at ⑧ and ⑪.

**Make the peaks shareable.** First blink, first board, first enclosure. Those
are the moments people post about, and posting is how this grows.
