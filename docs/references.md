# References

Every external source this project depends on or evaluated. Each entry records
**what it is, what it costs us, and whether we verified it.**

Verification status:
- ✅ **Verified** — fetched and confirmed directly, date noted
- ⚠️ **Reported** — from search results or documentation, not independently confirmed
- ❌ **Unverified** — asserted from prior knowledge; confirm before relying on it

---

## Part libraries and formats

### Fritzing parts library ✅ *verified 2026-07-28*

- **Upstream:** https://github.com/fritzing/fritzing-parts
- **Our fork:** https://github.com/rakeshgangwar/fritzing-parts
- **Licence:** **CC BY-SA 3.0 Unported** (confirmed from `LICENSE.txt`)

The primary data source. 1,794 core parts, 365 MB, overwhelmingly SVG. Provides
per-view connector positions for breadboard *and* schematic, plus `<bus>`
declarations for internal ties. See [corpus-findings.md](corpus-findings.md) for
measurements.

> **Licence consequence:** share-alike applies when redistributing the library
> *as a collection*, and serving SVGs to a browser is arguably distribution.
> Structure: part data + safety profiles live in the CC BY-SA fork with
> attribution; application code lives in a separate, separately-licensed repo.

### Fritzing `.fzp` file format ✅ *verified 2026-07-28*

- https://github.com/fritzing/fritzing-app/wiki/2.1-part-file-format

Format reference for the ETL. Key elements: `<connector>` with per-view `<p>`
entries carrying `svgId` / `terminalId` / `legId`; `<bus>` with `<nodeMember>`;
`<views>` with per-view SVG image paths. Note `terminalId` is optional and
absent on rubber-band-leg parts.

### Adafruit Fritzing library ✅ *verified 2026-07-29*

- https://github.com/adafruit/Fritzing-Library
- **Licence:** **CC BY-SA 3.0** — same terms as Fritzing core, so it composes
  cleanly with our fork.

Feathers, breakouts, LED backpacks, Raspberry Pi modules. Exactly the parts this
audience owns. Distributed as `.fzpz` / `.fzbz` bundles. A strong second source
once the curated set grows past the Fritzing core.

### KiCad symbol and footprint libraries ✅ *verified 2026-07-28*

- https://www.kicad.org/libraries/license/
- **Licence:** **CC BY-SA 4.0**, with an explicit exception — using library data
  in a design does *not* infect the design, and commercial use is fine.
  Share-alike applies only to redistributing the collection.

Better schematic-symbol coverage than Fritzing outside the hobby mainstream.
**Optional supplement for schematic symbols only** — Fritzing stays primary
because it's the only source carrying breadboard geometry.

### SparkFun Fritzing parts ⚠️ *reported*

- https://learn.sparkfun.com/tutorials/make-your-own-fritzing-parts

Referenced during research but not independently evaluated. Their tutorial on
authoring breadboard SVGs is useful if we ever generate footprints from artwork
rather than hand-authoring them. **Confirm licence before use.**

---

## Prior art

### Flux ✅ *verified 2026-07-28*

- https://www.flux.ai/p/ · docs: https://docs.flux.ai/

Browser eCAD with an AI copilot. The closest commercial comparison, and the
clearest illustration of the gap we're filling: Flux is excellent at *design*
and has nothing to say about the board on your desk.

Claims 1.1M builders, 6.4M projects, 821K components. Four-stage flow: Plan →
Schematic → Layout → Manufacture. Imports KiCad (all tiers) and Altium/Cadence
(Pro+).

**Pricing — metered on "ACUs" (Agent Compute Units), consumed per AI task:**

| Tier | Monthly | Annual | ACUs included | Overage |
|---|---|---|---|---|
| Starter | $20 | $16 | 10 | $2.50 |
| Pro | $142/editor | $112 | 100/editor | $2.00 |
| Teams | $158/editor | $120 | 100/editor, pooled | — |
| Enterprise | custom | — | — | — |

Worth studying as a metering model. Note the economics push you up a tier rather
than buy overage. **No public API or SDK** — closed SaaS surface.

---

## Component sourcing

Slice 2. Free tiers differ enough to decide the integration order.

| Source | Free tier | Verdict | Verified |
|---|---|---|---|
| [DigiKey API](https://www.digikey.com/en/resources/api-solutions) | ~1,000 searches/day | **Primary** | ⚠️ reported |
| [Mouser Search API](https://www.mouser.com/en/api-solutions/) | Free with key | Secondary | ⚠️ reported |
| [Nexar / Octopart](https://nexar.com/api) | 1,000 **results**/month | Too tight to build on | ⚠️ reported |

> **Caveat that matters more than the limits:** this audience mostly doesn't
> shop at DigiKey. Hobbyists buy modules from Adafruit, SparkFun, Amazon,
> AliExpress. Realistic plan is distributor APIs for discretes plus a curated
> vendor-SKU table for modules — Adafruit and SparkFun both publish stable
> product IDs.

---

## Firmware toolchain

### arduino-cli — **chosen primary build backend** ❌ *unverified*

Maintained by Arduino, tracks official cores, JSON output, designed for
automation. **Confirm current version and ESP32 core installation flow before
Slice 3.**

### PlatformIO — evaluated, not chosen ⚠️ *reported*

- Issue: https://www.cnx-software.com/2024/06/01/espressif-releases-arduino-esp32-core-3-0-0-but-platformio-support-in-doubt/
- Community fork: https://github.com/pioarduino/platform-espressif32 ✅ *verified 2026-07-29*

Official PlatformIO never shipped support for Arduino ESP32 Core 3.x (released
2024). The ecosystem's answer was **pioarduino**, which is genuinely healthy —
1,765 commits, 768 stars, currently tracking Espressif Arduino 3.3.11 with IDF
5.5.5, and offering hybrid compile for ESP32-C2/C61/solo1 that official
PlatformIO lacks.

> **Honest framing:** pioarduino being well-maintained softens the risk but
> doesn't overturn the decision. Our entire firmware guarantee rests on *"it
> compiled, therefore the API is real."* Resting that gate on a community fork
> of an unmaintained-for-this-chip platform is a worse position than using the
> first-party CLI. PlatformIO's **registry** remains useful as a library index.

### Zephyr RTOS — evaluated, deliberately rejected ⚠️ *reported*

- Devicetree overlays: https://www.beyondlogic.org/devicetree-overlays-on-zephyr-rtos-adding-i2c-or-spi/
- ESP32 GPIO: https://www.zephyrproject.org/how-to-set-up-esp32-gpio-pins-in-zephyr-rtos/

Architecturally a remarkable fit — devicetree *is* a hardware description
generating the firmware's view of pins, so our circuit model could emit a
`.overlay` directly. Rejected because Zephyr has drivers for proper silicon, not
for the unbranded DHT22 clone from a 10-pack. Library resolution would fail
constantly and the compile gate would reject working hardware.

**Logged as a promising advanced tier. Not built on now.**

### MicroPython / CircuitPython ⚠️ *reported*

- Comparison: https://roboticcoding.com/circuitpython-vs-micropython/

MicroPython is the bring-up REPL only — **not** a second codegen target. Chosen
over CircuitPython because ESP32 dominates this audience and CircuitPython is
weakest there, despite being the gentler on-ramp on Adafruit hardware.

`micropython-stubs` for static checking ❌ *unverified — confirm before Slice 3.*

---

## Production toolchain

Stages 4–5 of the arc. All open source, all driven by CLI or file formats per
[decisions.md D23](decisions.md).

### `kicad-cli` — the production output path ✅ *verified 2026-07-29*

- https://docs.kicad.org/9.0/en/cli/cli.html

**Fully headless**, and covers the entire production path:

| Command | Produces |
|---|---|
| `sch export netlist` | Netlist in various formats |
| `sch export bom` | Bill of materials |
| `sch erc` | Electrical rule check |
| `pcb drc` | Design rule check |
| `pcb export gerbers` | Fab files, one layer per file |
| `pcb export step` | 3D board model |

> This is why we don't need an MCP server for exports. Every one of these runs
> in CI and is reproducible.

### KiCad IPC API — **schematics not supported** ✅ *verified 2026-07-29*

- https://dev-docs.kicad.org/en/apis-and-binding/ipc-api/for-addon-developers/index.html

In KiCad 9.0 the IPC API is **implemented only in the PCB editor** — not the
schematic editor, not the library editors. A stable protobuf interface that
survives internal refactors, unlike the older SWIG bindings.

> **Consequence:** any tool claiming programmatic *schematic* editing on KiCad 9
> is manipulating `.kicad_sch` s-expression files directly. Which means it's
> competing with us simply writing the file.

### `mixelpixx/KiCAD-MCP-Server` — evaluated, not adopted ✅ *verified 2026-07-29*

- https://github.com/mixelpixx/KiCAD-MCP-Server

Drives KiCad via MCP for schematic editing, placement, routing, DRC/ERC, plus
JLCPCB catalogue and Freerouting integration. Requires KiCad 9.0+, Node 18+,
Python 3.11+. Active — 753 commits, 1.7k stars.

**Not adopted**, for three reasons: it puts state outside our model and makes
output non-reproducible; KiCad 9's IPC API doesn't do schematics anyway; and its
README names a Rust rewrite ("Konnect") as the next generation, making the
current implementation transitional.

**Revisit for:** interactive PCB layout refinement, where a human is in the loop
regardless. See [decisions.md D23](decisions.md).

### ngspice — simulation ✅ *verified 2026-07-29*

- https://ngspice.sourceforge.io/
- **Licence:** GPL · **Stable release 46**, March 2026

Mixed-signal SPICE simulator descended from Spice3f5, Cider and Xspice.
**Input is command-line or file based — it has no schematic entry**, which suits
us exactly, since we already hold the netlist. Recent versions add the KLU
solver and OpenVAF/OSDI for Verilog-A models.

### CadQuery — enclosures and 3D ⚠️ *reported*

- https://pythonhosted.org/cadquery/intro.html

Parametric CAD as Python. **Built to be used as a library with no GUI**, so it
suits server pipelines. OCCT kernel — NURBS, splines, and **STEP import/export**.

**Chosen over OpenSCAD** despite LLMs generating OpenSCAD more reliably, because
OpenSCAD cannot export parametric STEP — disqualifying for production. **Chosen
over FreeCAD** because FreeCAD is a GUI-scripting hybrid and heavier to
automate. See [decisions.md D24](decisions.md).

### Freerouting — autorouting ❌ *unverified*

Java CLI autorouter, commonly paired with KiCad. **Confirm licence, current
version, and CLI invocation before use.**

---

## Browser hardware access

### Web Serial API ✅ *verified 2026-07-28*

- ESP Web Tools: https://esphome.github.io/esp-web-tools/
- esptool-js: https://github.com/espressif/esptool-js

**Desktop only.** Chrome/Edge/Firefox on desktop; *not implemented on Android
Chrome*; absent on iOS.

> This single constraint decided the device architecture. Flashing cannot happen
> on a phone, while the camera and bench ergonomics want one — hence desktop
> primary with a thin phone companion. See spec §8.3.

---

## Internal cross-references

| Document | Contains |
|---|---|
| [corpus-findings.md](corpus-findings.md) | Measured facts about the Fritzing corpus, with reproduction commands |
| [decisions.md](decisions.md) | Decision log — including options rejected and why |
| [spec §4](superpowers/specs/2026-07-28-circuitking-design.md) | How the part library and licence split are structured |
| [spec §10](superpowers/specs/2026-07-28-circuitking-design.md) | Firmware toolchain reasoning in full |

---

## Maintenance

When adding an entry: record the **licence**, the **free-tier limit** if it's an
API, and **whether you verified it or took someone's word.** An unmarked
assertion that turns out wrong is worse than a gap, because nobody re-checks it.
