# Deferred Work — why, scope, and what unblocks each item

Every deferral named in the implementation plans, scoped. "Deferred" here
means *deliberately not built yet, with the reason recorded* — not forgotten.
Three items people might look for are **not** deferrals: Monte Carlo, thermal
and firmware-in-the-loop simulation were **rejected** by the simulation spec
(§9), and the metering model (D37) is an **open product decision**, not code.

Last reconciled: 2026-07-29 (evening pass). ✅ = since resolved.

## The one that was blocking tests — resolved

| | |
|---|---|
| **ngspice integration** ✅ | Installed 2026-07-29. The known-answer suite runs: divider exact, LED branch within 5% of hand calculation. Installing it immediately caught a real bug — the diode emission coefficient was mis-derived (`N = Vf/0.7`), fixed to `N = Vf/(Vt·ln(If/Is))` at rated current. This is why the plan said "skip loudly": a silent skip would have shipped that model. |

## A. Blocked on a live deployment or the live API

These cannot be *verified* from this repo alone. Building them against fakes
would produce untested claims — the thing this project exists to avoid.

| Item | Why deferred | Scope when unblocked | Size |
|---|---|---|---|
| **Streaming transport** (agent) ✅ | Resolved 2026-07-29 with the go-live cluster: the agent streams by default, and the fake LLM speaks real Anthropic SSE so every loop test covers the streaming wire. | — | done |
| **SSE / WS live wiring** ✅ | Both paths resolved 2026-07-29. Hosted: SSE with `Last-Event-ID` replay. Bridge: `maker-bridge` daemon — origin-pinned, paired localhost WS spawning the maker's own agent, whose tools execute on the hosted engine via maker-mcp remote mode. Verified live: a browser turn answered by local Claude Code calling hosted `project_status`/`check_circuit`. | — | done |
| **Server-side compaction beta** (agent) ⚠️ | Pass-through landed (a `compactionBeta` option adds the beta header); local gating + protected tail remain the active path. Remaining: the live eval asserting the protected tail survives a real server-side compaction, then flip the default. | Live eval + default flip. | ½ day |
| **Web-research live execution** (agent) ⚠️ | Config landed (a `webResearch` option adds the server-tool defs), off by default. Remaining: enable on the hosted agent, verify the tool type against the live API, map citations → `evidence.url`/`fetchedAt`. | ½ day, live |

**Status of A:** the go-live plan shipped 2026-07-29 — makerlord.dev is live (TLS, basic auth over the shell, bearer token over the API). The three ⚠️ residues above are live-API verifications, not builds.

## B. Blocked on content and curation — human-verified, not code

| Item | Why deferred | Scope | Size |
|---|---|---|---|
| **Persona prose** (17 files, D38) | ✅ **Phase 1 shipped 2026-07-29** — `data/personas/` carries ②③④⑥ on the fable-guide spine, loaded as the default pack (a project's own pack wins, D34). Remaining: the other thirteen, written as their stages are built; iteration against live transcripts. | Write each stage's persona with its stage. Iterate against transcripts once the go-live cluster lands. | Ongoing with stages |
| **Sampled prose evals** | Needs personas to evaluate — there is nothing to sample yet. Agent-runtime spec §13 says it deserves its own spec. | An eval spec: rubric per persona, transcript sampling harness reusing `fake-llm.ts` posture against the live API, regression tracking. | Own spec + ~2 days harness |
| **Curated library → ~150 parts** | **The schedule risk, named since HANDOFF day one.** ~12 fields per part verified against datasheets. **At 20 parts as of 2026-07-29** (caps, 1N4001 + SPICE model, pushbutton, pot, motor, relay, RGB LED, LDR, DHT22, batteries, TO-220 NPN, servo, WeMos D1 mini, soil-moisture sensor, LD1117V33 regulator) — footprints extracted from corpus SVG geometry, datasheet values cited in each profile, `curated-manifest.test.ts` is the permanent gate. | Keep the drip: ESP32-class board (needs a corpus part or a contributed one), more sensors, MOSFETs, LiPo cell + charger (unlocks the LiPo rule). SPICE models + KiCad symbols follow in Phase 2/3 (D25). | Steady drip |
| **Four deferred rules** (flyback, source capacity, LiPo, decoupling) | ✅ **Three of four shipped 2026-07-29**: `RULE_FLYBACK_MISSING` (BLOCKER — bare inductive winding with no rectifier bridging it; wired modules like servos exempt), `RULE_SOURCE_OVER_CAPACITY` (WARNING — declared loads vs the source's new `maxContinuousMa`, hand-authored with datasheet citations on the PP3/AA profiles), `RULE_DECOUPLING_MISSING` (WARNING — a quiescent-drawing module with a bare supply net). 11 rules total; danger corpus grew a BLOCKER entry + a named-degradations section for the WARNINGs. Only LiPo remains, blocked on its part. | LiPo rule waits for a curated cell + charger. | blocked on curation |

## C. Tooling that earns its keep at a later stage

| Item | Why deferred | Scope | Size |
|---|---|---|---|
| **Playwright e2e** ✅ | Resolved 2026-07-30: `packages/ui/e2e/` — the real stack (API server + built SvelteKit app), projects seeded through the real tool registry (§7 golden script + a live-BLOCKER danger project), no LLM. Twelve tests: front door, lens walk, the §14 sweep (BLOCKER at 1440/1024/390, no dismiss control on any stage of either project, rule-id provenance, agent prose claiming a fix does not clear the card, the advance refuses in the browser), bridge-absent help. CI `e2e` job with cached chromium. | — | done |
| **svelte-check in CI** ✅ | Resolved 2026-07-29: `.github/workflows/ci.yml` on push/PR — corpus submodule cached by pinned SHA, ngspice installed so the known-answer suite runs for real, `pnpm test` (typecheck + all 526), then `svelte-check` (first run ever: 332 files, 0 errors, 0 warnings). First run green. | — | done |
| **three.js GLB viewer** | Stage ⑩ (mechanical) has no spec — a viewer with nothing to view. UI spec §5 reserves the surface. | Arrives inside the mechanical-stage spec: CadQuery → GLB server-side, `three.js` scene with the board inside the case, collision highlights from engine findings. | With stage ⑩ |
| **Schematic layout + symbols** ✅ | Resolved 2026-07-29 (D45): ELK layered layout + per-family glyphs (resistor zigzag, LED/diode, battery, capacitor, IC box). Interactivity (zoom/pan/hover) had landed the same day. Remaining polish: breadboard label de-collision, part glyphs on the breadboard view. | — | done |
| **PNG derivation from CSV** | Needs a rendering dependency choice (resvg/node-canvas); CSV is canonical and the repo-archival PNG is a convenience, not a capability. | `waveformView` points → SVG → PNG via `@resvg/resvg-js` in `sim/results/`; wire into `report.md`. | ½ day |
| **Bridge packaging, signing, update** ⚠️ | Mostly resolved 2026-07-29: one-file `dist/bridge.cjs` (esbuild, self-spawning MCP role), `install.sh` → `maker-bridge` + `mlb` with `~/.makerlord/bridge.json`, CI uploads the bundle as an artifact. Still needs Node on the machine. Remaining: true single-binary (Node SEA/bun), macOS/Windows signing, update channel against a release feed. | The remainder is cert ops + a release feed — deliberately deferred until there are external users to update. | Cert ops, later |

## Resolved outside this ledger

The 2026-07-29 file-structure audit found one spec gap that was never a named
deferral: projects did not carry the user-journey §3 file tree. Resolved the
same day — `@makerlord/artifacts` projects every facet to files
(feasibility.md, requirements.md, **DECISIONS.md** (D29, via the
`decision_record` tool), architecture.md + .svg, circuit/, sim/) inside a real
per-project git repo (D34), committed after every turn; the five legacy
projects were backfilled.

## Suggested order

1. ~~CI~~ ✅ → 2. ~~The three unblocked rules~~ ✅ → 3. ~~Playwright~~ ✅ → 4. **The live-API residues** (compaction eval, web research) → 5. **Curation drip** running underneath it all (LiPo part unlocks the fourth rule) → 6. Stage specs ⑦/⑧/⑨ bring the viewer and packaging with them.
