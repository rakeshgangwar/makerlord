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
*2026-07-28*

Any net above 48 V, or any part flagged `hazardClass: mains`, produces `REFUSE`.

**Why:** that's where liability lives, and it's exactly where both analytical
rules and computer vision are weakest. **Being 95% right about mains is worse
than being no help at all.**

**Consequence:** encoded as `RULE_OUT_OF_SAFE_ENVELOPE`, tested in the Tier-1
corpus. The refusal leads with what it *can* still do.

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

## Adding to this log

Record the decision, the date, **the alternatives you rejected**, and the
consequence. The rejected options are the most valuable part — without them the
next person re-derives the same dead ends.
