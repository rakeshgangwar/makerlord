# MakerLord — Design Spec: Removal tools & freeform mode

*2026-07-31 · design spec, pre-implementation. Introduces D55–D56.
Motivated by two live observations on the same day: an agent unable to
correct its own mis-wiring (no removal vocabulary), and an agent
routing AROUND the firmware pipeline with a hand-written sketch
because the gate refused a circuit that never needed a breadboard.*

## 1. What this is

Two growths of the circuit model's degrees of freedom, one spec
because they share a principle: **the engine's vocabulary must cover
correction and reality, or agents improvise outside it** — and outside
it, the gates cannot protect anyone.

## 2. The decisions

- **D55 — construction gets its inverse.** Every additive circuit tool
  gains a removal partner: `part_remove`, `disconnect`, `wire_remove`,
  `unplace`, `block_remove`, `block_unlink`. Removal is an ordinary
  mutation: `check_circuit` re-adjudicates after each one; removal can
  resolve findings (pulling the unballasted LED) and can create them —
  the rules catch both. There is still no `dismiss_finding`: you
  remove geometry, never verdicts.
  **Rejected — generic undo (git revert):** coarse-grained, reverts
  unrelated settled state, and hands the agent the project's history
  as a steering wheel. **Rejected — edit-in-place tools:** remove+add
  compose to every edit; two orthogonal verbs beat N mutated ones.

- **D56 — the board becomes a target, not an assumption.** The circuit
  gains `target: 'breadboard' | 'freeform'` (default breadboard,
  existing projects unchanged). Freeform is for circuits that never
  touch the half-breadboard: onboard-LED-only firmware, module-to-
  module jumper wiring, dead-bug and perfboard builds. In freeform,
  intent nets (`connect`) are the whole electrical truth — they
  already drive simulation today; `place`/`wire` refuse with
  `BOARD_TARGET` and the build sequence emits intent-level steps
  ("connect U1.D5 to LED1.anode — polarised, anode to the pin").
  **Rejected — a separate sketch-only project type:** forks every
  consumer of the model for one flag's worth of difference.
  **Rejected — auto-detecting freeform from missing placements:** an
  agent forgetting to place parts must stay an error, not a silent
  mode switch. The maker (or agent, visibly) declares the target.

## 3. Cascade semantics (D55, normative)

- `part_remove(ref)`: removes the part, its placement, every wire
  touching a hole its pins occupied, and its memberships in intent
  nets; an intent net left with fewer than two members dies. A
  half-removed part would be a lie in the model.
- `disconnect(from, to)`: removes the intent net whose membership is
  exactly these two pin refs; refuses if no such net.
- `wire_remove(from, to)`: exact hole pair, either order.
- `unplace(ref)`: lifts the part off the board (placement + its
  wires); the part and its intent nets survive.
- `block_remove(id)`: refuses while circuit parts carry this blockId —
  remove or reassign them first; `block_unlink` mirrors `block_link`.

## 4. The gate in freeform (D47 preserved)

Flashing powers the board; the gate stands. In freeform the gate's
measurements come from the intent netlist's `predict_dc` — rail
voltage and total draw measured at the supply module's pins, recorded
with `measure` as ever.

**The empty-circuit exemption (engine-computed, never asserted):**
`gate_open` succeeds without measurements **iff** the circuit contains
at most one part, that part is a self-powered USB module, and there
are no intent nets. The danger the gate guards — wrong wiring,
energised — cannot exist with nothing wired; refusing anyway teaches
makers to route around the pipeline, which is strictly worse. The
moment a second part or a net appears, the exemption vanishes.
**Rejected — skipping the gate for freeform generally:** perfboard
mistakes burn parts exactly as well as breadboard ones.

## 5. Persona line (both decisions)

Stage personas (and the bridge context preamble) gain one sentence:
*"When a gate refuses, tell the maker exactly what it needs and walk
them there — never route around the pipeline with hand-written
sketches or external tools."* The engine cannot gate what happens
outside its tools; the persona can make the bypass a named failure
instead of initiative.

## 6. Testing

- Cascade tests per removal tool (the §3 semantics, each pinned).
- Removal → `check_circuit`: a blocker resolved by removal closes; a
  blocker created by removal opens.
- Freeform: sim + checks run intent-only; `place` refuses with
  `BOARD_TARGET`; build sequence emits intent steps with polarity.
- Gate: exemption holds for the bare-module case; one added net
  restores `MEASUREMENT_REQUIRED`. **The danger corpora are
  untouched** — every corpus circuit has parts and nets, so the
  exemption can never fire there.
