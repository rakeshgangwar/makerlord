# Migration Handoff

Context for picking this project up on a different machine — or in a fresh
session with no memory of how it got here.

---

## What this project is

**MakerLord** — a complete assistant for the maker's journey, from an idea to a
real product. Seventeen stages: feasibility research, testable requirements,
architecture, simulation, a safety-gated breadboard build, firmware, PCB,
enclosure, and manufacturing prep.

Read [vision.md](vision.md) first. It's short and it's the *why*.

> ⚠️ **The design spec is scoped to the prototype stage only** (stage ⑥, the
> wedge). It predates the whole-journey reframe and still reads as a circuit
> coach. That's correct for what it covers — don't mistake it for the product's
> full scope. [roadmap.md](roadmap.md) is the product; the spec is one stage of
> it.

## Read these, in this order

1. [vision.md](vision.md) — what and why
2. [roadmap.md](roadmap.md) — the 17-stage journey, four phases
3. [user-journey.md](user-journey.md) — what it feels like to use; output files
4. [ai-implementation.md](ai-implementation.md) — ACP/MCP, tool surface, testing
5. [glossary.md](glossary.md) — keep open alongside the spec
6. [superpowers/specs/2026-07-28-makerlord-design.md](superpowers/specs/2026-07-28-makerlord-design.md) — **the design for the prototype stage**, 14 sections, 914 lines. Read fully; every section is load-bearing
7. [superpowers/plans/2026-07-28-slices-0-and-1.md](superpowers/plans/2026-07-28-slices-0-and-1.md) — 25 TDD tasks, start at Task 1
8. [decisions.md](decisions.md) — before changing anything that looks arbitrary
9. [corpus-findings.md](corpus-findings.md) — before touching the ETL or board model

## Settled — do not relitigate

Each has a numbered entry in [decisions.md](decisions.md) with the alternatives
that were rejected and why.

**Architecture**
- **One structured model is the source of truth**; every artefact is a
  projection. You cannot run a design-rule check on an image. *(D2)*
- **Deterministic rules adjudicate; the LLM only explains.** `Finding` has no
  suppression field, by design. *(D3, D4)*
- **The gate is enforced by the engine, not the agent** — `advance_to_step()`
  errors while a blocker is live. There is no `dismiss_finding` tool.
  *(ai-implementation.md §2)*

**Scope**
- **The product is the whole idea→production arc**, not a circuit tool.
  *(D22, D29)*
- **The prototype stage is the wedge** — build it first, and don't start Phase 2
  until Phase 1 is genuinely good. *(roadmap §5)*
- **Mains is tiered behind a safety valve**, not refused. Opening a tier **adds**
  rules. Mains on a breadboard is refused at every tier, absolutely. *(D32)*
- **Compliance is early design constraints, not a late stage.** *(D33)*

**Stack and tooling**
- **TypeScript core, Python sidecar. Not Rust.** *(D36)*
- **Native tools run server-side.** Stages ①–⑧ need nothing installed. *(D37)*
- **Geometry imported from Fritzing; electrical limits hand-authored** — only
  2–4% of the corpus carries them. *(D6)*
- **Firmware is Arduino C++ via `arduino-cli`, not PlatformIO.** MicroPython is
  the bring-up REPL only. *(D10, D11)*
- **KiCad targeted at the netlist layer via SKiDL**; schematics generated as
  hierarchical sheets. *(D26, D27)*

**Product**
- **Desktop primary, phone as a thin companion** — Web Serial is desktop-only.
  *(D14)*
- **The gate collects measurements, never yes/no consent.** *(D15)*
- **A project is a real git repo**, hosted and clonable. *(D34)*
- **One-way ownership handoff at the PCB** — we generate, they route, we
  re-verify. *(D35)*

## Current state

**All seven specs are implemented and deployed** (2026-07-29). Live at
**makerlord.dev** on the infra server (see [infra.md](infra.md)): nginx + TLS,
basic auth over the shell, bearer token over the API, ngspice on the host.
Thirteen packages: parts, circuit, project, tools (37-tool registry), cli, mcp,
protocol, bridge, agent, sim, artifacts, server, ui. Every project is a real
git repo (D34) carrying the user-journey §3 tree incl. DECISIONS.md (D29).
501 tests green. Each spec has a ticked implementation plan in
[superpowers/plans/](superpowers/plans/); the full pipeline ①→⑤ was driven
live through the browser, and the three engine bugs the agent found in the
process are fixed with regressions.

```
main · github.com/rakeshgangwar/makerlord (private)
```

**Next:** the remaining deferrals are scoped with reasons and triggers in
[deferred-work.md](deferred-work.md) — suggested order: CI (an hour, protects
everything), the three deferred rules that are now unblocked on data
(flyback, source capacity, decoupling), Playwright on the live shell, the
three live-API residues (bridge WS, compaction eval, web research), with the
curation drip from 20 toward ~150 parts (the schedule risk) running
underneath. Then the Phase 2+ stage specs (firmware ⑦, debug ⑧, PCB ⑨).

## External dependencies

| What | Where | Note |
|---|---|---|
| Parts corpus fork | https://github.com/rakeshgangwar/fritzing-parts | CC BY-SA 3.0. Vendored as a submodule at `vendor/`, **not** tracked content — it's 365 MB |
| Upstream | https://github.com/fritzing/fritzing-parts | Refresh source |

Full list with licences, API limits, and verification status:
[references.md](references.md).

## Environment setup

```bash
git clone git@github.com:rakeshgangwar/makerlord.git && cd makerlord

# Node 22 + pnpm
curl -fsSL https://fnm.vercel.app/install | bash && exec $SHELL
fnm install 22 && fnm use 22
corepack enable && corepack prepare pnpm@latest --activate

# The parts corpus
git submodule add https://github.com/rakeshgangwar/fritzing-parts vendor/fritzing-parts
git submodule update --init --depth 1
```

Then `./scripts/verify-env.sh` — written in Task 1 — checks the toolchain, that
the corpus has ≥1,794 core parts, and that there's ≥20 GB free.

**Slices 0–1 need Node only.** Python (CadQuery, SKiDL, `kicad-sch-api`) and the
native CLIs arrive with later slices, and run server-side by default (D37).

**Environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `MAKERLORD_FRITZING_PATH` | `./vendor/fritzing-parts` | Corpus location |
| `MAKERLORD_PROFILES_PATH` | `./data/profiles` | Hand-authored safety profiles |

## Why we moved machines

*Decided 2026-07-29 (D20).*

The Mac was an M1 with 16 GB RAM at **97% disk — 6.5 GB free of 228 GB** — and
already swapping 2 GB. CPU and memory were fine; disk was not.

Slices 0–1 would have fitted after reclaiming ~26 GB (`.colima` 13 GB,
`.android` 5.1 GB, `.platformio` 4.1 GB — the last no longer needed once we
chose `arduino-cli`). But **Slice 3 needs 20–30 GB** for toolchains plus a
Docker compile sandbox, and on macOS every container runs inside a Linux VM that
costs RAM and disk natively-run Docker doesn't.

Migration was done while the project was three markdown files, when it cost
nothing. It only ever gets more expensive.

## Known risks

**The curated part set is the schedule.** Every stage past architecture needs
more facets per part — safety profile, SPICE model, KiCad symbol and footprint
(D25). Progress is gated on parts curated, not code written. The most
under-estimated cost in the whole plan.

**The safety overlay can't be delegated.** ~12 hand-verified fields across ~150
parts, and every one must be right or the guarantee is hollow. A hallucinated
pinout is a burnt component.

**Server-side compute is an unpriced cost.** Firmware compiles and CadQuery runs
are CPU-bound; a maker iterating firmware can trigger dozens of compiles an hour
(D37). No metering model exists yet — see Flux's ACUs in
[references.md](references.md).

**Two UX claims are unvalidated.** That build and bring-up modes are the real
differentiation, and that the diagnostic is the feature people talk about. Both
are reasoning, not evidence — and both are cheap to test by watching four people
build a circuit from a written guide.

**The first plan produces no UI.** Slices 0–1 are headless (D21). A working,
tested engine and nothing to demo. Deliberate, but worth knowing before you're
three weeks in expecting a screenshot.

**Mains tiers open onto rules that don't exist yet.** IPC-2221 clearance and
creepage, fusing, and isolation are PCB-geometry rules landing in Phase 3 (D32).
Don't ship Tier B before its rule set does.
