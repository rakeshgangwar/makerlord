# MakerLord — Scoping: stages ⑦ Firmware · ⑧ Debug · ⑨ PCB

*2026-07-30 · scoping, pre-spec. Each stage still gets its own full design
spec before implementation; this document fixes what those specs inherit,
what they must decide, and the order. The firmware spec
([2026-07-30-firmware-design.md](2026-07-30-firmware-design.md)) is written;
⑧ and ⑨ follow it.*

Phase 2 (⑤⑦⑧) closes with ⑦ and ⑧ — ⑤ shipped with the virtual bench.
⑨ opens Phase 3 and stays behind them: a prototype that doesn't run isn't
worth turning into a PCB (roadmap §5).

## What the three specs inherit (settled, do not relitigate)

| Decision | What it fixes |
|---|---|
| D2 | Every artefact is a projection of the one model — `pins.h`, `main.cpp`, the KiCad schematic included |
| D9 | Full application codegen; the netlist is the hardware/firmware contract; cross-checks are the point |
| D10–D13 | `arduino-cli`; C++ apps, MicroPython bring-up only (deferred); no Zephyr; libraries resolved by the chain, arbitrated by the compiler |
| D25 | The KiCad symbol/footprint mapping is a curated-part facet — ⑨'s curation gate |
| D33 | Compliance is design constraints applied early — ⑨ carries the EMC layout constraints |
| D35 | The maker takes over layout in KiCad GUI; we generate and verify, we don't editor |
| D37 | Compiles, ERC/DRC, ngspice: our containers. Flashing: WebSerial in the maker's browser. ①–⑧ install nothing |
| UI spec §5 | ⑦: Bench, compile log + flash progress, `pins.h`/`main.cpp`/`firmware.bin`. ⑧: Bench, one measurement at a time, hypothesis tree. ⑨: Inspect/Decide, board preview, DRC findings |

## ⑦ Firmware — spec written, see the design spec

The one-line thesis: **application code never names a pin; it names a role
that the engine bound.** Everything else — the model facet, the derived
`pins.h`, the cross-check rule family, the compile gate, WebSerial flashing
behind the power gate — follows from that. Detail in the spec.

## ⑧ Debug — what its spec must decide

Machinery that already exists: `predict_dc` (per-net predictions),
`measure` (D15's number-first discipline), the finding surface, and — once
⑦ lands — a WebSerial serial monitor streaming what the firmware observes.

1. **The hypothesis model.** A debug session is a facet: symptom →
   candidate fault set → measurements taken → surviving candidates. Rival
   hypotheses are first-class (superpowers §06): the tree always carries at
   least two live candidates or says why only one remains.
2. **Fault localisation as search.** Predicted-vs-measured deltas rank the
   next probe point — the guided binary search of the roadmap. The engine
   proposes *the* next measurement; the maker takes it; the tree prunes.
   Deterministic and testable with no LLM: seeded fault → expected probe
   sequence.
3. **The fault library.** What faults can the engine represent? First
   slice: open joint, bridged adjacent holes, reversed polarised part,
   wrong-value part, dead rail. Each is a circuit mutation whose predicted
   signature is computable with the existing DC solver.
4. **Firmware-side symptoms.** Serial output is evidence with `sourced`
   provenance (agent-read text, WARNING ceiling) unless it comes through a
   structured self-test the firmware spec's scaffold emits (then
   `verified`).
5. **Scope guard.** No oscilloscope assumptions — multimeter + serial only.
   Logic-analyser support is a later tier.

## ⑨ PCB — what its spec must decide

Mostly orchestration of mature tools (roadmap: Low–medium differentiation);
the spec's job is honest sequencing, not invention.

1. **The pipeline.** intent netlist → SKiDL script → KiCad project →
   `kicad-cli sch erc` / `pcb drc` → fab outputs. Which steps are
   deterministic projections (netlist→SKiDL) and which are agent-assisted
   (placement hints) — and ERC/DRC findings enter the same finding surface
   with the same severity ladder.
2. **The curation gate (D25).** A part crosses to ⑨ only with a KiCad
   symbol+footprint mapping. The spec must define the mapping format, the
   verification (footprint pad count vs corpus pin count, at minimum), and
   how many of the ~20 curated parts get mapped in the first slice.
3. **Layout ambition.** First slice almost certainly: generated schematic +
   rats-nest board + the maker takes over in KiCad (D35), with Freerouting
   as an optional autoroute pass (D37 puts it in our container). The spec
   decides how much auto-placement is attempted before handoff.
4. **EMC constraints early (D33).** Ground pour by default, decoupling at
   every IC (the rule exists), trace width from current budget (the budget
   exists per-net from ④). These are checks on the generated board, not
   prose advice.
5. **Round-tripping.** The maker edits in KiCad; what comes back? The spec
   must pick the boundary: we own schematic generation, the maker owns
   layout after handoff, DRC/fab-output stays ours either way. No silent
   two-way merge.

## Dependencies across the three

- **⑧ consumes ⑦'s serial monitor** (WebSerial port sharing: one port,
  flash and monitor take turns — the firmware spec owns the port broker).
- **⑨ consumes nothing from ⑦⑧** except a circuit that runs — the phase
  gate is a product decision, not a technical one.
- **Curation is the schedule risk for both ⑦ and ⑨**, in different facets:
  GPIO capability tables (⑦, two boards, small) vs KiCad mappings (⑨,
  every part on the board, large). The drip prioritises GPIO first.

## Order

1. ⑦ spec (done) → plan → implement (slices: model+rules → codegen+compile
   → flash+UI).
2. ⑧ spec once ⑦'s model is settled — the hypothesis engine reads it.
3. ⑨ spec when Phase 2 works end-to-end on the bench; its curation
   (KiCad mappings) can start earlier as drip work.
