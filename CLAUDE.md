# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is right now

**MakerLord** is a complete assistant for the maker's journey — idea → simulate →
prototype → product → production, across 17 stages. **All seven design specs
are implemented and deployed at makerlord.dev** (deploy: `./deploy/deploy.sh
sync`; infra details in `docs/infra.md`). Thirteen packages: `parts`,
`circuit`, `project`, `tools` (the 37-tool registry), `cli` (`maker`), `mcp`
(`maker-mcp`), `protocol`, `bridge` (`maker-bridge`), `agent`, `sim`,
`artifacts` (file-tree projections + per-project git), `server` (hosted SSE
API), and `ui` (SvelteKit; `pnpm --filter @makerlord/ui build`). Development follows the
plans in `docs/superpowers/plans/` **task-by-task, strict TDD**; each plan's
checkboxes record what is done. The specs and plans in `docs/` remain the
source of truth for all design intent; `docs/decisions.md` (D1–D48) is the
decision log. Phase 2/3 scoping and the stage-⑦ firmware spec
(2026-07-30) are approved and next to implement.

The Tier-1 danger corpus (`packages/circuit/test/danger-corpus.test.ts`) and
the firmware danger corpus (`packages/firmware/test/fw-danger-corpus.test.ts`)
are release-blocking: a failure there is not a flaky test, it is a maker's
destroyed board or bricked MCU. Never weaken either to get to green.

## Commands

```bash
pnpm test                          # Vitest across all packages
pnpm vitest run path/to/x.test.ts  # a single test file
pnpm typecheck                     # tsc -b over the packages
./scripts/verify-env.sh            # toolchain + corpus + disk check
```

- **Non-interactive shells need `CI=true`** on pnpm commands that might prompt
  (install/clean) — pnpm 11 asks for TTY confirmation on modules purge.
- pnpm 11 is pinned via `packageManager` (corepack). Its `minimumReleaseAge`
  policy can reject very fresh upstream releases at resolution time; that is
  deliberate supply-chain hygiene, not a bug. Postinstall scripts are
  allowlisted per-package in `pnpm-workspace.yaml` (`allowBuilds`).

## Working in this repository

Almost all work here is **editing the specs and plans in `docs/`** until
implementation begins. When you do, respect the existing structure:

- `docs/README.md` is the map and defines the canonical reading order.
- `docs/decisions.md` is the decision log (D1, D2, …). **Before changing anything
  that looks arbitrary, check whether it is a settled decision here** — each
  entry records the rejected alternatives and why. Don't relitigate settled
  decisions; if you must reverse one, add a new numbered entry, don't silently
  edit history.
- The seven design specs in `docs/superpowers/specs/` are **approved,
  pre-implementation**. Where a spec and an older doc (e.g. `ai-implementation.md`)
  disagree, the specs win — they were written later with the decisions in hand.
- Keep the prose style: claims over vibes, provenance labelled, tables for
  anything comparative. This mirrors the `fable-guide` spine the product is built
  on.

## When implementation starts

**Intended stack (from the plans and D36):** TypeScript `strict` (`noUncheckedIndexedAccess: true`),
Node 22+, pnpm 11+ workspace monorepo, Vitest, zod. Python is a server-side
sidecar for later slices only (CadQuery, SKiDL, `kicad-sch-api`); **not Rust.**

**Planned package layout** (a pnpm monorepo under `packages/`):
`parts` (Fritzing `.fzp` ETL + hand-authored safety overlay) · `circuit` (model,
union-find netlist, rule engine, DC solver, build sequence) · `tools` (the shared
tool core — one registry, the single source of truth) · `cli` (`maker`) ·
`mcp` (`maker-mcp`) · `bridge` (`maker-bridge`, the ACP host) · `agent` · `ui`.

**Workflow:** the plans are strict TDD, task-by-task, using the
`superpowers:subagent-driven-development` (or `executing-plans`) sub-skill.
Steps are tracked with `- [ ]` checkboxes. Start at the first unchecked task;
don't skip ahead. Slices 0–1 are headless (no UI) and need Node only.

**Environment setup** (documented in `docs/HANDOFF.md`): the parts corpus is a
~365 MB git submodule at `vendor/fritzing-parts` (gitignored, not tracked).
Config via `MAKERLORD_FRITZING_PATH` (default `./vendor/fritzing-parts`) and
`MAKERLORD_PROFILES_PATH` (default `./data/profiles`).

## Non-negotiable architecture (the invariants)

These are the load-bearing decisions. Everything downstream assumes them — treat
them as constraints, not preferences.

- **One structured circuit model is the source of truth; every artefact (image,
  netlist, PCB, firmware) is a projection of it.** You cannot run a design-rule
  check on an image. (D2)
- **Deterministic rules adjudicate; the LLM only proposes and explains.** A
  `Finding` has **no** suppression/override/severity field — the safety property
  is enforced by the *absence* of a `dismiss_finding` / `override_blocker` tool.
  You cannot call what was never defined. (D3, D4)
- **Gates are enforced by the engine, not the agent.** `advance_to_step()`,
  `open_power_gate()`, `generate_firmware()` etc. *return an error* while a
  `BLOCKER` is live. No state-changing tool may be advisory about safety. This is
  what makes external agents (Claude Code, Codex, Gemini) safe to let drive.
- **The tool surface is one registry wrapped by thin adapters.** The CLI and MCP
  server both wrap the same core; neither holds business logic, neither may add a
  tool the other lacks. One zod schema per tool drives validation, MCP
  `inputSchema`, and CLI parsing. This is also what makes the whole engine
  testable **with no LLM in the loop.**
- **Severity ladder, exact uppercase strings:** `REFUSE | BLOCKER | WARNING | NOTE`
  (rules) and `ADVISORY` (agent). Rule findings vs agent advisories are kept
  distinct (verified vs guessed).
- **Parts are never invented** — every `PartDefinition` originates from a `.fzp`
  file in the corpus. Geometry is imported from Fritzing; electrical/safety
  limits are hand-authored (only 2–4% of the corpus carries them).
- **Hole IDs are opaque strings** — never parse or infer topology from a hole
  name (`busX-2` skips `X6`; `A98` sits left of `A1`). Topology comes only from
  declared `<bus>` elements and extracted SVG geometry.
- **Mains is tiered behind a safety valve, not refused** — opening a tier *adds*
  rules. Mains on a breadboard is refused absolutely, at every tier. (D32)
- **A maker's project is a real git repo**; stage personas are versioned files
  that travel with it. (D34)

## The wedge

The **prototype stage (stage ⑥)** — a safety-gated breadboard build with real
verification — is the wedge and gets built first. Most other stages are solved by
mature tools that need driving; safe physical prototyping is the part nobody has
built. Don't start Phase 2 until Phase 1 is genuinely good. Note the oldest
design spec (`2026-07-28-makerlord-design.md`) is scoped to this stage only and
still reads as a "circuit coach" — that is correct for its scope; `roadmap.md` is
the full product.
