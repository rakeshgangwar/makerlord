# MakerLord — Design Spec: Debug (stage ⑧)

*2026-07-30 · design spec, pre-implementation. Inherits D2/D3 (the engine
adjudicates), D15 (number before prediction), D34 (the session travels
with the repo), D43 (provenance bounds confidence), and stage ⑦'s serial
contract. Scoped in
[2026-07-30-phase-2-3-scoping.md](2026-07-30-phase-2-3-scoping.md).*

---

## 1. What this is, and what it is not

"It doesn't work" is where most maker projects die. Stage ⑧ turns that
sentence into a bounded search: a symptom names what misbehaves, the
engine enumerates the faults that could cause it, **proposes exactly one
measurement**, and every reading prunes candidates until one remains —
with the observation trail that convicted it.

It is not a chat about what might be wrong. The agent narrates and
comforts; **the engine owns the candidate set, the predictions and the
pruning** — the same D3 split as everywhere else. And it is not an
oscilloscope: slice 1 assumes a multimeter and the serial monitor,
nothing else.

## 2. The debug model

A facet, like every other piece of live state (D34 — a half-finished
debug session survives a reload, on any machine):

```
project.debug = {
  symptom: { kind: 'element_dead' | 'wrong_reading' | 'no_serial' | 'board_dead',
             ref?: string, net?: string, detail?: string },
  candidates: [
    { id: 'open-n1', fault: { kind: 'open_joint', net: 'n1' },
      status: 'live' | 'contradicted' | 'convicted',
      signature: { netVoltages: {...}, provenance: 'computed' },
      contradictedBy?: string },            // observation id
  ],
  observations: [
    { id: 'obs-1', kind: 'voltage', net: 'n1', value: 4.98, unit: 'V' },
    { id: 'obs-2', kind: 'selftest', role: 'STATUS_LED', ok: true },
  ],
  proposed?: { net: string, why: string },  // THE next measurement
  status: 'open' | 'localized' | 'exonerated',
}
```

Nothing here is agent-authored except the symptom's free-text `detail`.
Candidates, signatures, proposals and prunes are engine output; there is
no tool that removes a candidate by hand — a candidate dies only by
contradiction with a recorded observation (the D3/D4 absence pattern,
again).

## 3. The fault library

Every fault is a **deterministic mutation of the circuit model** — apply
it, and the mutated circuit is just a circuit, so the whole existing
engine (netlist projection, the op analysis) computes what that fault
would look like on a meter. No fault heuristics, no prose pattern
matching: a fault IS its predicted signature.

| Fault | Mutation | Classic bench reality |
|---|---|---|
| `open_joint` | remove one member from an intent net | the jumper that looks seated and isn't |
| `bridge` | merge two nets | solder whisker, mis-seated lead |
| `reversed_part` | swap a polarized part's pins | LED in backwards |
| `wrong_value` | scale a resistance ×10 / ÷10 | 2.2k read as 22k, orange vs red |
| `dead_rail` | supply source → 0 V | flat battery, unpowered rail |

Candidate generation is symptom-directed but generous: `element_dead(ref)`
yields every library fault touching the element's nets plus `dead_rail`;
`board_dead` yields rail-adjacent faults; `no_serial` adds the strap-pin
and rail faults around the MCU. Generosity is cheap — pruning is the
engine's job, and a fault set that was quietly too small is exactly the
fluent-but-wrong failure this stage exists to kill.

## 4. Signatures, and the tolerance that makes pruning honest

A candidate's **signature** is the per-intent-net DC voltage map of its
mutated circuit, computed by the sim package's op analysis — the real
solver, not the gate's toy predictor (which stays untouched; its job is
gate numbers, deliberately narrow). The healthy circuit's own signature
joins the set as candidate `no-fault`: debugging must be able to
conclude *"the circuit is fine — the symptom is elsewhere"* (exoneration
is a verdict, not a failure).

**Pruning:** an observation contradicts a candidate when
`|measured − predicted| > max(10% · |predicted|, 0.2 V)`. The band is
deliberate slack for meter class, contact resistance and model error —
and it is the D43 story here: signatures inherit the run's model
provenance, an idealised model makes them approximate, and the verdict
names the weakest model it stands on. A fault that two candidates both
explain within tolerance keeps both alive — rivals stay rivals until a
measurement separates them.

Signature runs need a DC stimulus, same rule as stage ⑤ (sim spec §5):
no stimulus, no debug session — the engine says so rather than assuming
one.

## 5. The next probe — a binary search the maker can trust

`proposed` is the net whose measurement **maximally splits the live
candidates**: for each measurable net, partition candidates by pairwise
tolerance-overlap of their predictions; propose the net whose worst-case
surviving set is smallest (greedy information gain, deterministic
tie-break by net name). The `why` is generated from the partition:
*"n2 separates open-joint-at-n1 (predicts 0 V) from reversed-LED
(predicts 4.3 V)"*.

One number at a time, bench posture, D15 all the way down: the engine
never shows a candidate's prediction for the proposed net **until the
reading is recorded** — the maker measures first, then sees what each
hypothesis expected.

## 6. Evidence — the meter and the serial stream

Two channels, one standard:

- **Multimeter readings** enter through the debug tools as observations
  — the maker's numbers, ground truth, same standing as the gate's
  measurements.
- **The serial monitor is shared from ⑦** — same port, same broker,
  live in the ⑧ lens. The scaffold's structured lines are machine-parsed
  observations: `SELFTEST role=X ok` exonerates the MCU-boot and
  pin-drive faults on X's net; `SELFTEST … fail` and `LOG` values enter
  the observation list typed. **Raw prints prune nothing.** A device
  print saying "all sensors nominal" is untrusted text (⑦ spec §6, §9
  labels) the agent may discuss but the engine never consumes — the
  device under debug is the least trustworthy narrator in the room.

## 7. Rivals are first-class (superpowers §06)

The surface always shows **at least two live candidates, or states
exactly why only one remains** — the observation ids that contradicted
every rival. "Convicted" requires every other candidate contradicted, or
separated beyond tolerance on a recorded reading; the engine never
convicts on plausibility. The `exonerated` verdict (no-fault survived,
all faults contradicted) is equally first-class: the answer may be "your
circuit is fine, your expectation is wrong", and saying so honestly is
the feature.

## 8. Tools

Four additions to the one registry (43 → 47):

| Tool | Mutates | Gated | Does |
|---|---|---|---|
| `debug_start` | yes | no | symptom in → candidates + signatures + first proposal; refuses without a DC stimulus |
| `debug_status` | no | no | the tree: candidates, observations, proposal, verdict state |
| `debug_observe` | yes | no | record ONE typed observation (voltage / selftest / log) → prune → next proposal |
| `debug_close` | yes | no | close the session with its verdict frozen into the facet |

No `debug_dismiss_candidate`, no manual conviction — by absence, as
ever. `debug_observe` is the only pruning path, and it takes numbers,
not opinions.

## 9. UI — the ⑧ lens

Bench posture. The proposed measurement in huge type at the top — probe
points named by net and the parts on it. Below: the hypothesis tree —
live candidates with plain-language fault names, contradicted ones
struck through with the observation that killed each. The shared serial
monitor docks alongside, SELFTEST lines lighting observations as they
arrive. One entry field: the reading, D15-ordered (predictions render
only after it lands).

## 10. Scope

**In:** the facet, the five-fault library, op-analysis signatures,
tolerance pruning, greedy probe selection, the four tools, SELFTEST
observation mapping, the ⑧ lens, tests below.

**Out (named):** oscilloscope/logic-analyser evidence (later tier);
intermittent faults (signatures are DC steady-state); multi-fault
diagnosis (one fault at a time — the dominant bench reality);
transient/AC signatures (op only in slice 1); MicroPython REPL bring-up
(ledger §B²).

## 11. Testing

- **Convergence property, no LLM:** for every library fault seeded into
  the fixture circuit, feed the engine the *mutated circuit's own
  predicted values* as readings at each proposed probe — it must convict
  the seeded fault, and the healthy circuit must exonerate. Pure logic
  on canned signatures; the ngspice leg runs in the integration suite
  (installed locally, in CI and on infra — the loud-skip contract).
- **Rivals invariant:** at every intermediate step of every convergence
  run, ≥2 live candidates or a stated separation.
- **Tolerance edges:** a reading exactly on the band keeps the
  candidate; meter-noise jitter around a prediction never convicts.
- **SELFTEST mapping:** `ok` exonerates the mapped faults; `fail` enters
  as evidence; raw prints change nothing — asserted.
- **Playwright:** the lens shows one proposal, the tree, and no control
  whose name could dismiss a candidate (§14 sweep grows stage 8).
