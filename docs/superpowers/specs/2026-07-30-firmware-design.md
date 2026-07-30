# MakerLord — Design Spec: Firmware (stage ⑦)

*2026-07-30 · design spec, pre-implementation. Inherits D2, D9–D13, D37;
introduces D46–D48. Companion scoping for ⑧⑨ in
[2026-07-30-phase-2-3-scoping.md](2026-07-30-phase-2-3-scoping.md).*

---

## 1. What this is, and what it is not

Stage ⑦ turns a verified breadboard into a running device. The maker
describes what the device should *do*; the engine derives every pin from
the netlist, the agent writes application logic inside an engine-owned
scaffold, the compiler arbitrates (D13), and the maker flashes from the
browser (D37). A Chromebook does all of it.

It is **not an IDE**. We do not host arbitrary sketches, import existing
codebases, or debug the maker's hand-written C++. The firmware is a
projection of the model (D2) with one agent-authored region, and every
guarantee below depends on that boundary staying sharp.

The one-line thesis, and the load-bearing decision of this spec:

> **Application code never names a pin. It names a role that the engine
> bound.** (D46)

`MOISTURE_SENSE`, not `A0`. The engine generates `pins.h` mapping roles to
pins from the netlist; a raw pin literal in the application region is a
**finding, not a style complaint** — because a raw literal is exactly how
code and circuit drift apart, and drift is how a pin set `OUTPUT HIGH`
ends up wired to ground. The same move as opaque hole IDs: makers (and
models) cannot misuse a name they never see.

## 2. The firmware model

A new facet of `project.json`. Like every facet: the agent proposes,
tools validate, the engine derives, files are projections.

```
project.firmware = {
  target: { ref: 'U1' },              // which circuit part is the MCU
  behaviors: [                        // WHAT the device does — maker-visible
    { id: 'read-soil',  kind: 'sample',  role: 'MOISTURE_SENSE',
      everyMs: 60000 },
    { id: 'alert-led',  kind: 'threshold', watch: 'read-soil',
      above: 700, drive: 'STATUS_LED', to: 'HIGH' },
    { id: 'report',     kind: 'serial_log', watch: 'read-soil' },
  ],
  roles: [                            // DERIVED — never hand-authored
    { role: 'MOISTURE_SENSE', ref: 'SENS1', pin: 'AOUT',
      mcuPin: 'A0', mode: 'ANALOG_IN' },
    { role: 'STATUS_LED', ref: 'LED1', pin: 'anode',
      mcuPin: 'D5', mode: 'OUTPUT' },
  ],
}
```

**Behaviors are the maker's vocabulary** — sample, threshold, drive,
serial_log, later pwm/i2c_read. They are deliberately a small closed set
in slice 1: a behavior kind the engine knows is a behavior the engine can
scaffold, cross-check and test deterministically. Free-form behavior lands
in the agent-authored logic region instead (§6), where the compiler and
the cross-checks still bound it.

**Roles are derived, never authored.** `fw_pin_plan` walks the netlist:
every net joining an MCU pin to a part pin yields a role candidate named
from the block/part it serves. The maker renames roles; nobody edits the
`mcuPin` column. There is no tool that sets a role's pin — the same
absence-of-tool safety property as D3/D4.

## 3. The GPIO facet — curation this stage needs (D48)

Deriving modes and checking capabilities needs per-pin MCU data the
profiles do not yet carry:

```yaml
# added to a curated MCU profile
gpio:
  A0: { analogIn: true, analogMaxV: 3.2 }     # board divider included
  D0: { digital: true, pwm: false, note: wake-from-deep-sleep }
  D3: { digital: true, strap: { atBoot: HIGH, why: "GPIO0 LOW enters flash mode" } }
  D4: { digital: true, strap: { atBoot: HIGH }, builtinLed: true }
  D8: { digital: true, strap: { atBoot: LOW,  why: "HIGH prevents boot" } }
  D5: { digital: true, pwm: true, interrupt: true }
  # …
fqbn: esp8266:esp8266:d1_mini
flash: { protocol: esptool-js, baud: 460800 }
```

Hand-authored, datasheet-cited, like every safety field. **Slice-1 scope:
the two curated MCUs** (Uno, D1 mini) — small, and it is the drip item
that unblocks everything else here. `fqbn` and `flash` ride along: the
board that can be compiled for is a property of the curated part, not of
the conversation.

## 4. The cross-check rule family

The D9 payoff: deterministic rules over **circuit × firmware model**,
faults neither side sees alone. Same engine, same `Finding` shape, same
severity ladder, same absence of any dismiss path. All grounded in the
gpio facet (verified provenance → BLOCKER is available).

| Rule | Fires when | Severity |
|---|---|---|
| `RULE_FW_OUTPUT_INTO_RAIL` | a role's mode is OUTPUT and its net ties to a supply or ground rail | BLOCKER — the D9 canonical MCU-killer |
| `RULE_FW_PIN_CAPABILITY` | mode needs a capability the pin lacks (ANALOG_IN on digital-only, PWM where none) | BLOCKER |
| `RULE_FW_STRAP_PIN_CONFLICT` | a strapping pin's net is pulled against its required boot level (D8 pulled high, D3 grounded through a load) | BLOCKER |
| `RULE_FW_ANALOG_OVERVOLTAGE` | net's predicted voltage exceeds `analogMaxV` | BLOCKER |
| `RULE_FW_INPUT_FLOATING` | mode INPUT with no pull-up/down and no defined driver on the net | WARNING |
| `RULE_FW_ROLE_UNBOUND` | a behavior references a role no netlist wiring supports | BLOCKER (structural) |
| `RULE_FW_RAW_PIN_LITERAL` | the application region names a pin (`D5`, `GPIO14`, bare small-int in a pin-position argument) instead of a role symbol | BLOCKER (D46) |

The last rule is a *lint over the one agent-authored region*, not C++
semantic analysis: a regex-table over pin-name vocabularies plus
pin-position call sites (`pinMode`, `digitalWrite`, `analogRead`, …).
Fluent-but-wrong code that names `D5` correctly today drifts silently
tomorrow; the rule makes the contract mechanical.

`check_firmware` runs the family; the results join the same finding
surface as every other check.

## 5. Codegen — scaffold owned, logic bounded

```
pins.h        100% engine-generated. Role → pin constants, modes,
              a setup_pins() doing every pinMode. Regenerated on every
              netlist change; never edited.
main.cpp      Engine scaffold: includes, setup() calling setup_pins(),
              loop() dispatching scaffolded behaviors, a marked
              // ── application logic (agent-authored) ── region.
firmware.bin  Compiler output. Exists only if compilation succeeded.
```

Closed-set behaviors (§2) compile from templates — deterministic,
golden-file-tested, no LLM. The agent-authored region holds everything
else the maker asked for, written by the agent **through the role
vocabulary** and bounded by three things: the region markers, the raw-pin
lint, and the compiler.

**The compile gate.** `fw_compile` runs `arduino-cli` in our container
(D37) against the curated `fqbn`, cores pre-installed in the image. Errors
return as *retriable tool errors with the compiler's text* — the agent
iterates. This is D13's arbitration: an invented library API dies here,
before the maker sees code that "looks right". Success stamps the build
`compiled` — the provenance grade `firmware.bin` carries. Timeout and
output-size bounds; one compile at a time per project.

**Libraries, slice 1:** curated list only (`DHT sensor library`, `Servo`,
…, pinned versions in the image). The full D13 resolution chain (registry
search → header read → compile-verify → promote) is slice 2; the chain's
last link — the compiler — is already the gate in slice 1.

## 6. Flash and serial — the browser half (D37, D47)

`firmware.bin` downloads to the browser; **WebSerial flashes it** —
esptool-js (ESP8266) or STK500 (Uno), chosen by the curated `flash`
protocol. No installs.

**Flashing is powering (D47).** Plugging USB into the MCU energises the
breadboard through its regulator — it *is* a power-up. So the flash
control lives behind the same gate as the bench power-up: measurements
recorded, `gate_open`, no live BLOCKER. The UI does not render a flash
button the engine would refuse; the engine-side guarantee is that
`fw_manifest` (which releases the bin + flash parameters) refuses like
every gated tool. No advisory path around it.

**One port, shared honestly.** Flash and the serial monitor take turns on
the same WebSerial port; a small port broker in the UI owns open/close so
a flash never fights the monitor. After flashing, the monitor streams —
which is stage ⑧'s primary symptom feed. Serial text is agent-readable
**untrusted** input (`[device output — unverified]` label, agent-runtime
spec §9 extended): a firmware print claiming "all sensors nominal" has
`sourced` provenance at best. The scaffold's structured self-test line
(`SELFTEST role=… ok`) is the exception the ⑧ spec builds on.

## 7. Tools

Six additions to the one registry (37 → 43), thin adapters as ever:

| Tool | Mutates | Gated | Does |
|---|---|---|---|
| `fw_behavior_set` | yes | no | add/update/remove a closed-set behavior |
| `fw_pin_plan` | yes | no | (re)derive roles from the netlist; report unbindable behaviors |
| `check_firmware` | no | no | run §4; findings |
| `fw_generate` | yes | **yes** | write `firmware/` projections; refuses on circuit or firmware BLOCKERs |
| `fw_compile` | yes | no | container compile; errors are retriable data; success records the build |
| `fw_manifest` | no | **yes** | release bin + flash params to the UI; refuses unless the power gate is open |

No `fw_flash` server tool — the browser flashes; the engine only decides
*whether it may* (D47). Nothing here can dismiss a finding; the property
is preserved by absence, as always.

## 8. UI — the ⑦ lens

Bench posture (UI spec §5 row ⑦). Left-to-right: behavior list (the
maker's vocabulary, editable through the agent), pin plan as a table whose
`mcuPin` column is visibly read-only, compile log streaming, then the
flash panel — button (gate-ruled), progress bar, serial monitor with huge
type. `firmware/` appears in the files panel like every projection.

## 9. Scope

**In:** the model facet, GPIO facets for Uno + D1 mini, pin-plan
derivation, the §4 rule family, scaffold codegen, curated-library compile
gate in containers, WebSerial flash for both boards, serial monitor,
the six tools, the ⑦ lens, tests below.

**Out (with owners):** MicroPython bring-up REPL (D11 — kept, sequenced
after slice 1); full library-resolution chain (slice 2); OTA updates;
interrupts/RTOS/multi-file projects; importing existing sketches (not an
IDE); logic-analyser anything (⑧'s later tier); Zephyr (D12, stays
rejected).

## 10. Testing

- **A firmware danger corpus**, same contract as Tier-1: every §4 rule has
  a table entry that must fire and a benign twin that must not. The
  OUTPUT-into-rail case is the first row. Release-blocking like its
  sibling.
- **Golden projections:** fixture model in → byte-identical `pins.h` /
  scaffold out.
- **Real compiler in CI:** `arduino-cli` + both cores cached in the CI
  image; the known-good fixture must compile, the known-bad (invented API)
  must fail. The ngspice precedent — a silent skip would have shipped a
  wrong model once already.
- **No-LLM end-to-end:** golden script grows `fw_behavior_set →
  fw_pin_plan → check_firmware → fw_generate → fw_compile`, asserted on
  the artefacts.
- **Fake-LLM loop test:** agent writes a raw pin literal → the finding
  fires → the agent's corrected region compiles.
- **WebSerial:** Playwright can't grant serial permission headlessly;
  flash UI states (gate closed / no bin / ready) are DOM-tested, the
  actual flash is a live checklist item on real hardware — which is
  sitting on the bench.

## 11. New decisions introduced

- **D46 — the role-symbol contract:** application code references roles,
  never pins; a raw literal is a BLOCKER-severity finding. Rejected:
  trusting review (drift is silent), full C++ parsing (weight without
  proportionate gain over the lint table).
- **D47 — flashing is powering:** `fw_manifest` sits behind the power
  gate. Rejected: a separate "USB gate" (two gates, one physical act);
  ungated flashing (contradicts the wedge's core promise).
- **D48 — the GPIO facet:** per-pin capabilities + strapping + flash
  protocol are hand-authored, datasheet-cited curation on MCU profiles.
  Rejected: deriving from Arduino core headers (unverified, wrong
  abstraction level for strap pins and analog domains).
