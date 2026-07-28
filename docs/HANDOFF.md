# Migration Handoff

Context for picking this project up on a different machine — or in a fresh
session with no memory of how it got here.

---

## What this project is

An AI coach for building real circuits safely. Students hold physical
breadboards; the agent designs the circuit, draws it as schematic and
breadboard, sequences the build, and gates power-up behind deterministic safety
checks.

Read [vision.md](vision.md) first. It's short and it's the *why*.

## Read these, in this order

1. [vision.md](vision.md) — what and why
2. [glossary.md](glossary.md) — keep open alongside the spec
3. [superpowers/specs/2026-07-28-circuitking-design.md](superpowers/specs/2026-07-28-circuitking-design.md) — **the design, all 14 sections.** Read it fully; it's ~880 lines and every section is load-bearing
4. [superpowers/plans/2026-07-28-slices-0-and-1.md](superpowers/plans/2026-07-28-slices-0-and-1.md) — 25 TDD tasks, start at Task 1
5. [decisions.md](decisions.md) — before changing anything that looks arbitrary
6. [corpus-findings.md](corpus-findings.md) — before touching the ETL or board model

## Settled — do not relitigate

Each has a numbered entry in [decisions.md](decisions.md) with the alternatives
that were rejected and why.

- **One structured circuit model is the source of truth.** You cannot run a
  design-rule check on an image. *(D2)*
- **Deterministic rules adjudicate safety; the LLM only explains.** `Finding`
  has no suppression field, by design. *(D3, D4)*
- **Mains is tiered behind a safety valve** (D32), not refused. Tier A
  (certified AC-DC module) is recommended; B and C need explicit opt-in, and
  opening a tier ADDS rules. Mains on a breadboard is refused at every tier.
- **Geometry is imported from Fritzing; electrical limits are hand-authored** —
  only 2–4% of the corpus carries them. *(D6)*
- **Firmware is Arduino C++ via `arduino-cli`, not PlatformIO.** MicroPython is
  the bring-up REPL only. *(D10, D11)*
- **Desktop primary, phone as a thin companion** — Web Serial is desktop-only.
  *(D14)*
- **The gate collects measurements, never yes/no consent.** *(D15)*

## Current state

Nothing is built. Three documents plus this docs folder; no code, no
`package.json`, no dependencies installed.

```
4 commits · main · github.com/rakeshgangwar/circuitking (private)
```

**Start at Task 1** of the plan (PopOS environment bootstrap). Task 0 — publish
the repo and write this handoff — is done.

## External dependencies

| What | Where | Note |
|---|---|---|
| Parts corpus fork | https://github.com/rakeshgangwar/fritzing-parts | CC BY-SA 3.0. Vendored as a submodule at `vendor/`, **not** tracked content — it's 365 MB |
| Upstream | https://github.com/fritzing/fritzing-parts | Refresh source |

Full list with licences and API limits: [references.md](references.md).

## Environment setup

```bash
git clone git@github.com:rakeshgangwar/circuitking.git && cd circuitking

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

**Environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `CK_FRITZING_PATH` | `./vendor/fritzing-parts` | Corpus location |
| `CK_PROFILES_PATH` | `./data/profiles` | Hand-authored safety profiles |

## Why we moved machines

*Decided 2026-07-29 (D20).*

The Mac was an M1 with 16 GB RAM at **97% disk — 6.5 GB free of 228 GB** — and
already swapping 2 GB. CPU and memory were fine; disk was not.

Slices 0–1 would have fitted after reclaiming ~26 GB (`.colima` 13 GB,
`.android` 5.1 GB, `.platformio` 4.1 GB — the last no longer needed once we
chose `arduino-cli`). But **Slice 3 needs 20–30 GB** for ESP32/RP2040/AVR
toolchains plus a Docker compile sandbox, and on macOS every container runs
inside a Linux VM that costs RAM and disk natively-run Docker doesn't.

Migration was done while the project was three markdown files, when it cost
nothing. It only ever gets more expensive.

## Known risks

**The safety overlay is the bottleneck.** ~12 hand-verified fields across ~150
parts, and every one must be right or the guarantee is hollow. This can't be
automated or delegated to the model — a hallucinated pinout is a burnt
component.

**Two UX claims are unvalidated.** Spec §8.2 asserts build and bring-up modes
are the entire differentiation; §8.10 claims the diagnostic is the feature
students would tell friends about. Both are reasoning, not evidence — and both
are cheap to test by watching three or four people build a circuit from a
written guide. If the diagnostic isn't the moment of relief predicted, the slice
ordering is wrong.

**The first plan produces no UI.** Slices 0–1 as planned are headless (D21).
There is a working, tested engine at the end and nothing to demo. Deliberate,
but worth knowing before you're three weeks in expecting a screenshot.
