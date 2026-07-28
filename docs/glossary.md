# Glossary

Terms used throughout the spec and plan. Where a word has a **project-specific**
meaning that differs from general usage, it's marked ⚑.

---

## Circuit model

**Net / node** — a set of pins that are electrically the same point. "Node" is
used when talking about the physical board, "net" when talking about the logical
circuit; they're the same idea at different layers.

**Netlist** — the complete set of nets in a circuit. The logical description of
what connects to what, with no geometry.

⚑ **Intent netlist** — what the circuit *should* be. Owned by the agent,
produced from the student's stated goal.

⚑ **Derived netlist** — what the circuit *actually is*, computed from the
physical layout by union-find over breadboard buses and jumper wires.

⚑ **Divergence** — a mismatch between intent and derived. Two kinds:
- **split** — pins that should be connected landed on different nodes
- **merged** — pins from different nets ended up on one node *(the shape a rail
  short takes)*

**Bus** — in the Fritzing `.fzp` format, a declared set of internally connected
connectors. A breadboard's five-hole column groups and power rails are buses; so
are a microcontroller's multiple ground pins.

⚑ **Footprint** — a part's pin offsets in **breadboard hole units** from its
placement origin. A resistor is `{"0": [0,0], "1": [4,0]}`. Hand-authored, not
derived from artwork. See [decisions.md D7](decisions.md).

**Placement** — a part instance's origin hole plus orientation (0/90/180/270°).

---

## Breadboard anatomy

**Hole** — one socket. Identified by an **opaque string** like `A1`, `E30`,
`X7`. ⚠️ Never infer position or topology from the name — see
[corpus-findings.md §5](corpus-findings.md).

**Column group** — five holes in a column, internally tied. The basic unit of
breadboard connectivity.

**Rail** — the long power strips down the edges, usually marked red/blue. Note
that rails are often **split** and not electrically continuous end to end.

**Centre channel** — the gap down the middle. Splits each row so a DIP chip can
straddle it without shorting its two sides together.

**Pitch** — hole spacing. Universally **0.1 inch** — 7.2 units in Fritzing SVG
coordinates at 72 dpi.

---

## Part data

**`.fzp`** — Fritzing part metadata. XML: properties, connectors with per-view
positions, buses.

**`.fzpz` / `.fzbz`** — a zipped single part / a bundle of parts.

**Connector** — Fritzing's term for a pin. Carries `id`, `name`, `type`
(male/female/wire/pad) and per-view SVG references.

**`svgId` / `terminalId` / `legId`** — SVG element references: the connector's
clickable area, the exact wire attachment point, and (for rubber-band-leg parts)
the bendable leg. `terminalId` is optional.

⚑ **Safety profile** — the hand-authored overlay carrying electrical limits,
polarity, hazard class, and footprint. **The moat.** Keyed by part ID.

⚑ **Pin role** — `gnd` | `supply` | `io` | `passive` | `unknown`, classified
from connector names.

⚑ **Curated set** — the ~150 hand-verified parts that ship in the runtime
bundle, out of 1,794 in the corpus.

---

## Safety engine

⚑ **Finding** — a rule's verdict. Fully readonly, with **no field for
suppression or override** — that's the type-level guarantee behind "the agent
can never overrule a rule."

⚑ **Severity ladder:**

| Severity | Effect |
|---|---|
| `REFUSE` | Agent stops entirely. Design does not proceed. (Mains, >48 V) |
| `BLOCKER` | Design continues, but the power-up gate will not open |
| `WARNING` | Surfaced prominently; does not gate |
| `NOTE` | Good-practice guidance |
| `ADVISORY` | LLM-originated, separate labelled band, **never** gates |

⚑ **The gate** — the pre-power-up checkpoint. Opens only when no `REFUSE` or
`BLOCKER` remains and the student has entered the required **measurements**
(never yes/no confirmations).

⚑ **Tier 1 corpus** — the suite of known-dangerous circuits that must always be
caught. A regression here is a release blocker.

---

## Electronics

**Current-limiting resistor** — in series with an LED, sets the current. An LED
is not a resistor: connected directly it draws whatever the supply can give and
burns out.

**Forward voltage (Vf)** — the drop across a conducting diode or LED. ~2 V for a
red LED. Branch current is `(Vrail − Vf) / R`.

**Polarised** — a part that only works one way round. LEDs, electrolytic
capacitors, diodes, ICs. Reversal ranges from "doesn't work" to "vents."

**Anode / cathode** — a diode's positive and negative leads. On a 5 mm LED the
longer leg is the anode; the flat notch on the rim marks the cathode.

**Flyback diode** — placed across an inductive load (relay coil, motor) to
absorb the reverse spike when current stops. Without it, the driving transistor
dies.

**Decoupling capacitor** — a small cap across an IC's supply pins, close to the
chip, smoothing current demand spikes.

**Brownout** — supply voltage sagging under load until a chip resets. The
classic cause is running a motor off the microcontroller's regulator.

**Quiescent current** — what a part draws doing nothing.

**Stall current** — what a motor draws when prevented from turning. Often
5–10× its running current, and the number that actually matters for sizing.

**Logic level** — the voltage a digital pin uses, typically 3.3 V or 5 V.

**Voltage domain mismatch** — 5 V applied to a 3.3 V-only pin. Usually fatal,
often immediately.

**GPIO** — a general-purpose pin, configurable as input or output.

**PWM** — rapid on/off switching to approximate an analogue level. Used for
dimming and motor speed.

**I²C / SPI / I²S** — serial buses. I²C is two wires with addressed devices
(hence the "two devices, same address" failure); SPI is faster with a select
line per device; I²S carries digital audio.

**LiPo** — lithium polymer battery. High energy density, and the most dangerous
thing in hobby electronics. Requires protection circuitry.

---

## Toolchain

**ETL** — Extract, Transform, Load. Here: `.fzp` XML → normalised
`PartDefinition`.

**Union-find (disjoint set)** — the algorithm that merges holes into electrical
nodes. Nearly the whole netlist derivation.

**`arduino-cli`** — Arduino's official command-line build tool. Our compile
gate.

**Web Serial** — browser API for serial devices. **Desktop only** — this single
constraint decided the device architecture.

**esptool-js** — browser ESP32 flasher built on Web Serial.

**Devicetree / `.overlay`** — Zephyr's hardware description format. Evaluated,
rejected. See [decisions.md D12](decisions.md).

---

## PCB and production

**Schematic vs netlist** — a netlist is *what connects to what*; a schematic is
a **drawing** of it. ⚠️ Importing a netlist into KiCad gives you a PCB, **not a
schematic** — nothing reconstructs a drawing from connectivity. Hence D27.

**Ratsnest** — the straight "airwires" pcbnew draws between pads that a netlist
says should connect, before they're routed as copper.

**Footprint** *(KiCad sense)* — the physical land pattern on a PCB: pads, silk,
courtyard. ⚠️ Not the same as our breadboard **footprint** (hole offsets).

**Hierarchical sheet** — a schematic split into sub-sheets by functional block.
Makes auto-layout tractable: a 6-component sheet can be placed well by
convention; a 50-component page cannot.

**ERC / DRC** — electrical rule check (schematic) and design rule check (board).
Run headless via `kicad-cli sch erc` / `pcb drc`. The deterministic arbiters for
stage 4.

**DFM** — design for manufacture. Whether a fab can actually build it —
trace widths, annular rings, minimum spacing.

**Gerber** — the fab file format, one file per layer. Plus drill files, a BOM,
and pick-and-place for assembly.

**STEP** — the parametric CAD interchange format. What mechanical CAD accepts.

**VRML / WRL** — a *mesh* format for rendering. ⚠️ Cannot go into a STEP export.
KiCad footprints often reference only WRL, so `--subst-models` is required or
your board exports with no components on it, silently.

**GLB** — web-renderable 3D. Useful for showing a board in the browser with no
plugin.

**STL** — mesh format for 3D printing. The enclosure output for makers.

**Standoff** — the pillar holding a PCB off the enclosure floor, aligned to the
board's mounting holes.

---

## External

**eCAD** — electronic computer-aided design. KiCad, Altium, Flux.

**BOM** — bill of materials. Here, a projection of the netlist.

**MPN / SKU** — manufacturer part number / a vendor's own stock code.

**ACU** — "Agent Compute Unit," Flux's AI metering unit. Not ours; recorded in
[references.md](references.md) as a pricing model worth studying.
