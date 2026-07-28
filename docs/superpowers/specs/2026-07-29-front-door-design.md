# MakerLord — Design Spec: the Front Door (stages ①–④)

**Date:** 2026-07-29
**Status:** Approved design, pre-implementation
**Covers:** ① Idea · ② Feasibility · ③ Requirements · ④ Architecture

Companion to [2026-07-28-makerlord-design.md](2026-07-28-makerlord-design.md),
which covers stage ⑥ (the prototype build). This spec covers what happens
before it. Together they are Phase 1 of [../../roadmap.md](../../roadmap.md).

---

## 1. Why this exists

A maker arrives with an idea, not a netlist. Without these four stages the
product starts at *"here's a circuit"* — which is not where anybody starts.

These are also the **cheapest stages in the roadmap** (roadmap §4): mostly
prompt and part-library work, not engine work. And they are the front door, so
their quality sets the impression everything else is judged against.

### What each stage is for

| Stage | Turns | Into |
|---|---|---|
| ① Idea | a vague sentence | a recorded intent |
| ② Feasibility | *"can I build this?"* | a graded verdict with evidence |
| ③ Requirements | *"it should last a long time"* | `battery_runtime ≥ 6 months` |
| ④ Architecture | requirements | a block graph that provably meets them |

---

## 2. What the project model gains

```ts
Project {
  intent:       string           // the maker's original words, verbatim
  inventory:    InventoryItem[]  // optional; feeds ④ and substitution
  feasibility:  Feasibility
  requirements: Requirement[]
  architecture: { blocks: Block[]; links: BlockLink[] }
  circuit:      Circuit          // existing — Slice 1
}
```

### 2.1 Requirements

```ts
interface Requirement {
  id: string
  category: 'power' | 'environment' | 'interface'
          | 'performance' | 'physical' | 'cost'
  statement: string              // "≥6 months on 2×AA, one reading per hour"
  metric: string                 // 'battery_runtime'
  comparator: '>=' | '<=' | '==' | 'range'
  value: number
  max?: number                   // when comparator is 'range'
  unit: string
  consumedBy: string[]           // ['CHECK_POWER_BUDGET', 'TEST_PLAN']
  provenance: 'stated' | 'derived' | 'assumed'
}
```

> **The governing principle: a requirement exists because a downstream check
> reads it.** An empty `consumedBy` means either an orphan requirement to
> delete, or a check we have not built. Both are worth surfacing.

This gives stage ③ the arbiter roadmap §2 promises. **Measurable** means:
`value` + `unit` + `comparator` present, **and** `consumedBy` non-empty.

`provenance` exists because assumed values are real and unavoidable. If the
maker will not name an operating temperature, we assume 0–40 °C and **label
it** rather than silently choosing.

### 2.2 Architecture

```ts
interface Block {
  id: string
  name: string                   // 'power', 'sense', 'mcu', 'radio'
  sourcing: { type: 'buy';   partId: string }
          | { type: 'build'; partIds: string[] }
          | { type: 'undecided' }
  interfaces: Interface[]
  power?: { activeMa: number; sleepMa?: number }   // from the part's safety
}                                                 // profile where curated

interface Interface {
  id: string
  kind: 'power' | 'i2c' | 'spi' | 'uart' | 'gpio' | 'analog' | 'pwm'
  direction: 'provides' | 'consumes'
  voltageV?: number
  currentMa?: number
}

interface BlockLink {
  from: { blockId: string; interfaceId: string }
  to:   { blockId: string; interfaceId: string }
}
```

`sourcing` is where *"use the certified module, don't design the supply"*
(roadmap ④) becomes **data rather than advice**. It is also what D32's Tier A
depends on: a mains project whose supply block is `{type: 'buy'}` against a
certified module is a materially different design from one that isn't, and the
model needs to know which.

Blocks are required by **D27** — hierarchical KiCad schematics are one sheet per
functional block. Stage ④ is where they are born.

### 2.3 Feasibility

```ts
type Grade = 'verified' | 'sourced' | 'inferred'

interface FeasibilityClaim {
  claim: string
  grade: Grade
  evidence?: { url: string; fetchedAt: string }   // required when sourced
           | { toolCall: string }                 // required when verified
}

interface Feasibility {
  verdict: 'buildable' | 'buildable-with-caveats'
         | 'buy-instead' | 'out-of-envelope'
  claims: FeasibilityClaim[]
  priorArt: { title: string; url: string; parts: string[] }[]
  roughCost?: { value: number; currency: string; grade: Grade }
}
```

**Enforced structurally: a `sourced` claim without a fetched URL is a
validation error.** Hallucinated prior art cannot ship, because the type will
not hold it. Same move as `Finding` having no suppression field (D3) — the
guarantee lives in the schema, not in a prompt.

Grades map to how the claim was obtained:

| Grade | Source | Example |
|---|---|---|
| `verified` | a tool call | "the library has a profile for this sensor" |
| `sourced` | a fetched page | "three people have built this — [links]" |
| `inferred` | reasoning | "roughly a weekend of work" |

**Cost sits at `inferred` until Slice 2.** Live distributor pricing is a later
slice (D19), so the front door does not block on it — the same claim simply
carries a weaker grade until the APIs land, then gets upgraded to `verified`.

### 2.4 Inventory

```ts
interface InventoryItem {
  partId?: string     // matched to the curated library
  freeText?: string   // "an Arduino starter kit"
  quantity?: number
}
```

**First-class but optional.** Architecture prefers parts the maker already owns;
skipping it yields generic choices and a nudge later. It never blocks the door —
a data-entry chore between a maker and their idea is exactly where people bounce
(spec §8.8).

---

## 3. The checks

All produce the **same `Finding` type as Slice 1** — same severity ladder, same
readonly shape, same absence of any suppression field. One engine, more rules.

### 3.1 Stage ③ — requirements

| Rule | Severity | Fires when |
|---|---|---|
| `REQ_NOT_MEASURABLE` | BLOCKER | missing `value`, `unit` or `comparator` |
| `REQ_ORPHAN` | WARNING | `consumedBy` is empty |
| `REQ_ASSUMED_UNCONFIRMED` | NOTE | `provenance` is `assumed` |

### 3.2 Stage ④ — architecture

| Rule | Severity | Fires when |
|---|---|---|
| `ARCH_INTERFACE_UNMET` | BLOCKER | a `consumes` port has no link |
| `ARCH_VOLTAGE_MISMATCH` | BLOCKER | 5 V `provides` linked to 3V3 `consumes` |
| `ARCH_POWER_BUDGET_EXCEEDED` | BLOCKER * | Σ consumed current > provided |
| `ARCH_PIN_COUNT_EXCEEDED` | BLOCKER | blocks demand more GPIO/I²C than the MCU has |
| `ARCH_REQUIREMENT_UNSATISFIED` | BLOCKER * | a computable requirement fails against this architecture |

**\* Severity degrades when an input is assumed.** Both starred rules compute
over per-part electrical values, and only 2–4% of the corpus carries them
(§3.4). §4 forbids gating on inference, so:

| Every load-bearing input curated | Any load-bearing input assumed |
|---|---|
| **BLOCKER** | **WARNING**, naming the assumed input |

This is consistent rather than a special case, and it creates a useful
incentive: **curating a part upgrades the check that depends on it.** Safety
profiles pay off twice — once in Slice 1's rules, again here.

**"Computable requirement"** means one whose `metric` has a registered
evaluator. `battery_runtime` has one; `enclosure_colour` does not. A requirement
with no evaluator is never a BLOCKER — it is carried forward to the stage ⑭
test plan instead, which is why `consumedBy` may legitimately name `TEST_PLAN`
alone.

### 3.3 `ARCH_REQUIREMENT_UNSATISFIED` — the rule that earns the front door

```
requirement    battery_runtime >= 6 months
architecture   2×AA ≈ 2800 mAh · ESP32 active 80 mA / sleep 0.01 mA
requirement    sample_interval = 1 hour, active 3 s

duty           3 s / 3600 s = 0.083%
average        80 × 0.00083 + 0.01 × 0.99917 = 0.077 mA
computed       2800 / 0.077 ≈ 3.4 years            ✓ passes

               at sample_interval = 1 minute:
average        80 × 0.05 + 0.01 × 0.95 = 4.01 mA
computed       2800 / 4.01 ≈ 29 days               ✗ BLOCKER
```

**Where each input comes from:** capacity from the supply block's part profile;
active and sleep current from each consuming block's `power` field; **duty cycle
derived from requirements** — `sample_interval` and the active duration, which
is why both name `CHECK_POWER_BUDGET` in their `consumedBy`. The evaluator for
`battery_runtime` is what makes this requirement computable per §3.2.

It tells the maker their design cannot meet their own requirement **before they
buy anything**. Structurally it is the same move as the power-up gate:
deterministic, shows the arithmetic, blocks progress.

> The power-up gate protects the board. This protects the project.

It also closes the ③↔④ loop that roadmap §1 draws. A failing requirement check
sends the maker back to change either the requirement or the architecture, and
the loop is legible rather than a feeling that something is off.

### 3.4 The honesty constraint on computed budgets

Average current needs per-block active and sleep figures. Those come from the
curated safety profile where one exists — and **only 2–4% of the corpus carries
electrical data** (corpus-findings §3). Everything else is an assumption.

So `ARCH_POWER_BUDGET_EXCEEDED` and `ARCH_REQUIREMENT_UNSATISFIED` **carry the
provenance of their inputs**:

> *"3.4 years — but ESP32 sleep current is assumed at 0.01 mA (not in the
> curated profile). Confirm against the datasheet before trusting the margin."*

A power budget built on assumed numbers but presented as verified is precisely
the fluent-but-wrong failure this whole architecture exists to prevent. **The
check reports its own weakest input.**

### 3.5 Feasibility is validated, not ruled

There is no feasibility rule in the engine. `set_feasibility_claim` **rejects**
a `sourced` grade lacking `evidence.url` and `fetchedAt` — a refused call at the
tool boundary, like the gated tools in
[../../ai-implementation.md](../../ai-implementation.md) §2.

---

## 4. You may only gate on what you verified

> **The severity a claim may carry is bounded by its provenance.**

| Provenance | Maximum severity |
|---|---|
| `verified` / computed | BLOCKER, REFUSE |
| `sourced` | WARNING |
| `inferred` / `assumed` | NOTE, ADVISORY |

**Feasibility therefore produces no BLOCKERs at all.** It is inference, and
gating on inference produces a tool that patronises people. A `buy-instead`
verdict records the reasoning; the maker may proceed regardless.

Architecture checks *do* gate, because they are computation over declared
values.

This generalises D3 and D4, and it explains an apparent exception: the mains
valve (D32) blocks because `hazardClass` is **curated data**, not a guess.

---

## 5. Flow and surface

### 5.1 One conversation, one panel

The four stages are a model concept, not a UI concept. The maker never learns
"stage ③". Conversation is unbroken; a persistent panel shows state:

```
IDEA          ✓  soil sensor → Home Assistant
FEASIBILITY   ✓  buildable · 3 prior projects · ~£28 (est.)
REQUIREMENTS  ◐  5 captured · battery runtime still open
ARCHITECTURE  ○  not started
```

Panel states: `not started` · `in progress` · `complete` · `blocked`.

**Why the panel earns its place:** D30 makes requirements what render everything
downstream computable, so the maker needs to see them accumulating and see the
gaps. It also handles roadmap §1's loops naturally — reopening feasibility after
architecture updates a panel entry rather than walking backwards through a
wizard.

This is the **Converse** posture from user-journey §6. No new posture is
introduced.

### 5.2 Elicitation: universal core, archetype hints

A small universal requirement set always applies:

| Category | Always asked |
|---|---|
| power | supply type, runtime target if battery |
| environment | operating temperature, indoor/outdoor |
| interface | what it talks to, and how |
| physical | size or mounting constraints, if any |

**Archetypes suggest additional slots** — sensor node, actuator/controller,
audio, wearable, robot, data logger, display, gateway. Each names the extra
requirements its category implies (a sensor node needs sample interval and
accuracy; an actuator needs load type and duty).

Architecture may reveal further requirements, looping back to ③. Archetypes are
**hints, not gates** — an unusual project simply gets the universal core plus
whatever the conversation surfaces.

Roughly 8–10 archetypes. Authored content, like the safety profiles, but far
smaller.

### 5.3 Tools

```
set_intent(text)
add_inventory_item(...)          list_inventory()

research_prior_art(query)      → web search + fetch; returns graded claims
set_feasibility_claim(...)     → REJECTS sourced grade without fetched evidence
set_verdict(verdict)

propose_requirement(...)         confirm_requirement(id, value, unit)

add_block(...)                   link_blocks(...)
set_sourcing(blockId, choice)

check_requirements()             check_architecture()
advance_to_circuit()           → ERROR while architecture has BLOCKERs
```

Consistent with ai-implementation.md §2: mutations validate at the boundary,
gated tools self-enforce, and there is no tool that dismisses a finding.

### 5.4 Handoff to stage ⑥

`expand_block(blockId)` turns architecture into circuit:

| `sourcing` | Expands to |
|---|---|
| `buy` | one `PartInstance` — the module |
| `build` | several `PartInstance`s plus internal intent nets |
| `undecided` | **refused** — decide first |

`BlockLink`s become `IntentNet`s between the expanded parts.

**Blocks are retained, not consumed.** `PartInstance` gains an optional
`blockId`, which is how D27's hierarchical schematic knows which sheet each part
belongs on. The block graph drawn at stage ④ is still the organising structure
at stage ⑨.

Same dividend as the netlist: one structure, many stages, no re-derivation.

---

## 6. Testing

**Tier 1 — deterministic units.** Each check gets a tripping fixture and a
non-tripping one. `ARCH_REQUIREMENT_UNSATISFIED` gets the worked battery case
both ways (1-hour sampling passes at ~3.4 years; 1-minute fails at ~29 days),
asserting on the **computed number**, not merely the verdict.

**Tier 2 — schema enforcement.** `set_feasibility_claim` with a `sourced` grade
and no URL must throw. Likewise `expand_block` on an `undecided` block, and
`advance_to_circuit` with a live BLOCKER. These are tests, not conventions.

**Tier 3 — agent tested on artefacts.** Canned LLM responses in, assertions on
`project.json`: *"a battery-powered outdoor sensor request produces a
requirement with `metric: battery_runtime`, a unit, and non-empty
`consumedBy`."* Prose gets sampled evals; structure gets hard assertions.

**A deliberate gap, stated rather than hidden:** feasibility research hits the
live web and cannot be deterministically tested. The check is **structural** —
*claims carry evidence* — not *claims are correct*. We can verify that nothing
unsourced ships. We cannot verify that what shipped is true.

---

## 7. Error handling

| Situation | Behaviour |
|---|---|
| Web search returns nothing usable | Verdict proceeds with `inferred` claims only, and says so |
| Maker refuses to give a value | Assume a default, mark `provenance: assumed`, raise the NOTE |
| Requirement has no consuming check | `REQ_ORPHAN` — surfaced, never silently dropped |
| Architecture cannot meet a requirement | BLOCKER naming both sides, with the arithmetic |
| Part has no curated power data | Compute anyway; label the assumed input in the finding |
| Block left `undecided` at expansion | Refused call, not a warning |

---

## 8. Scope

**In:** the four stages, the model facets, the checks, elicitation, the panel,
the block→circuit handoff.

**Out:**
- **Live pricing** — Slice 2 (D19). Cost stays `inferred`.
- **The renderers** for the block graph. The model and checks are specified
  here; drawing it is the UI slice.
- **Stages ⑤ onward.** Simulation, prototype, firmware are separate specs.
- **Persona prose.** D38 sets fable-guide as the spine;
  authoring the personas is its own piece of work.

**This spec is one implementation plan's worth of work** — it shares the engine,
the `Finding` type and the tool-boundary conventions with Slices 0–1, and adds
no new subsystem beyond the archetype library.
