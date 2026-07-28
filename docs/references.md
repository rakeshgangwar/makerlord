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

## Agent methodology

### fable-guide — the persona spine ✅ *verified 2026-07-29*

- https://github.com/rakeshgangwar/fable-guide

An operator's guide for models: claims-over-vibes, ground truth over fluency,
provenance labelling, adversarial self-review, answer-first delivery. Twelve
files, ~14k words, chaptered along a task lifecycle
(receive → plan → execute → conclude → deliver).

**Adopted as the shared epistemic spine for the stage personas** (D38), not as
a skill pack. Chapters 03, 05, 07 and 08 carry the value that `superpowers`
doesn't already cover.

### block/buzz — agent runtime reference ✅ *verified 2026-07-29*

- https://github.com/block/buzz

Nostr-based collaboration platform where agents are first-class members. Not a
circuit tool, but its agent runtime is unusually well-built and four patterns
were taken from it (ai-implementation.md): two-measure context accounting,
progressive disclosure via `load_skill`, the fake-LLM subprocess test harness,
and treating any ACP binary as interchangeable with your own.

Also the reference point for **rejecting Rust** (D36): `buzz-agent/src/llm.rs`
is 3,846 lines and `config.rs` 2,709 — the cost of having no first-party
Anthropic SDK in that language.

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

### SKiDL — netlist generation, our KiCad adapter ⚠️ *reported*

- https://devbisme.github.io/skidl/ · https://github.com/devbisme/skidl

Python module describing circuit interconnection, performing ERC, and emitting
netlists. **Supports KiCad 5–9** with version-specific modules, absorbing the
s-expression format change introduced at KiCad 6.

**Chosen as the export adapter** (D26) because it's a netlist *generator*, not a
decision-maker — all design decisions stay in our rule engine.

### `kicad-sch-api` — schematic file writing ❌ *unverified*

- Discussed: https://forum.kicad.info/t/kicad-sch-api-python-library-for-kicad-schematic-manipulation/65363

Python library for reading and writing `.kicad_sch` files. The likely dependency
for D27's schematic generation, since KiCad 9's IPC API doesn't cover the
schematic editor. **Confirm maturity and format coverage before committing.**

### atopile — evaluated, not adopted ⚠️ *reported*

- https://atopile.io/ · https://github.com/atopile/atopile

Code-first EDA: circuits described in `.ato` files (Python-inspired DSL), with a
compiler that selects components, validates constraints, and generates a KiCad
project. Version 0.16, active.

**Not adopted** — its compiler picks parts and solves constraints, which are
decisions our rule engine already makes. Building on it creates two sources of
truth. It's also better understood as an **adjacent competitor** than a
component: code-defined electronics for engineers who write code, aimed at a
different user than a maker with a breadboard.

### KiCad `packages3d` — component 3D models ⚠️ *reported*

- https://kicad.github.io/packages3d/ · https://www.kicad.org/libraries/download/

Official 3D model library. Ships **STEP and WRL** for most components.

> ⚠️ **Silent-failure gotcha:** footprints often reference *only* the VRML file,
> and VRML is a mesh format that cannot be included in a STEP export. Pass
> `--subst-models` to `kicad-cli pcb export step` so it substitutes the STEP
> file matching each VRML base name. Without it you get a bare board with no
> components — and no error.

`kicad-cli pcb export step` also emits **GLB, STL, BREP, XAO, PLY, IDF and
VRML**. GLB is web-renderable, so an in-browser 3D board view needs no plugin.

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

### Web Serial API ⚠️ *browser matrix disputed — re-verify before the UI plan*

- ESP Web Tools: https://esphome.github.io/esp-web-tools/
- esptool-js: https://github.com/espressif/esptool-js

**Desktop only.** *Not implemented on Android Chrome; absent on iOS.* That part
is not in question and it is what decided the device architecture: flashing
cannot happen on a phone, while the camera and bench ergonomics want one.

> ⚠️ **Contradiction to resolve.** This entry was recorded on 2026-07-28 as
> "Chrome/Edge/Firefox on desktop." The UI spec (D39) assumes **Chromium only** —
> Chrome, Edge, Opera — with Firefox and Safari needing the bridge, on the
> understanding that Mozilla's standards position on Web Serial is negative and
> the API was never shipped. **One of these is wrong and the difference is
> load-bearing**: it decides whether the bridge is a fallback for a minority or
> the default path for a large share of makers.
>
> Check `caniuse.com/web-serial` and Mozilla's standards-positions repo before
> writing the UI implementation plan. If Firefox does support it, the bridge
> install prompt in UI spec §11 narrows to Safari alone.

---

## Agent protocols

### Agent Client Protocol (ACP) ⚠️ *reported — method names unverified*

- https://agentclientprotocol.com/
- Open standard, JetBrains and Zed collaborating

JSON-RPC 2.0 over the agent's stdio. Our understanding of the surface —
`initialize`, `session/new` with an `mcpServers` parameter, `session/prompt`,
`session/update` notifications, `session/request_permission` — drives the
[ACP host spec](superpowers/specs/2026-07-29-acp-host-design.md) §4 and **has not
been checked against the published protocol.**

The architecture does not depend on exact spellings; the normalisation layer
absorbs drift. **One capability does matter**: if an agent cannot accept MCP
servers at session creation, we refuse to use it, because a toolless agent can
only produce prose about a circuit it cannot see.

### ACP adapter binaries ❌ *unverified*

The built-in probe table names adapters for Claude Code, Codex and Gemini CLI.
**Exact package and binary names are unconfirmed** and the adapter ecosystem is
young enough that they move. A stale entry costs a failed probe and a "not
found" — no crash, but a silently degraded feature. Confirm each against its
project before the table ships.

---

## Web application stack

All four ❌ *unverified* — chosen on characteristics, versions not pinned.

| Choice | For | Note |
|---|---|---|
| **SvelteKit** | The app shell and all UI | D41. React is the stated fallback |
| **three.js** | GLB rendering at stage ⑩ | Board and enclosure, no plugin |
| **Playwright** | End-to-end, no LLM in the loop | Drives the golden script with a browser on top |
| **Vitest** | Units, renderers, golden SVGs | Already implied by the TypeScript monorepo |

Verify licences and current majors before the UI implementation plan.

---

## Internal cross-references

| Document | Contains |
|---|---|
| [corpus-findings.md](corpus-findings.md) | Measured facts about the Fritzing corpus, with reproduction commands |
| [decisions.md](decisions.md) | Decision log — including options rejected and why |
| [spec §4](superpowers/specs/2026-07-28-makerlord-design.md) | How the part library and licence split are structured |
| [spec §10](superpowers/specs/2026-07-28-makerlord-design.md) | Firmware toolchain reasoning in full |
| [ACP host spec](superpowers/specs/2026-07-29-acp-host-design.md) | Where each ACP assumption is relied on |
| [UI spec §12](superpowers/specs/2026-07-29-ui-design.md) | Why SvelteKit, and what a switch to React would cost |
| [simulation spec](superpowers/specs/2026-07-29-simulation-design.md) | How ngspice is driven, and the model-provenance ceiling |

---

## Maintenance

When adding an entry: record the **licence**, the **free-tier limit** if it's an
API, and **whether you verified it or took someone's word.** An unmarked
assertion that turns out wrong is worse than a gap, because nobody re-checks it.
