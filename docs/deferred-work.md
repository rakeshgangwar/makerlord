# Deferred Work — why, scope, and what unblocks each item

Every deferral named in the implementation plans, scoped. "Deferred" here
means *deliberately not built yet, with the reason recorded* — not forgotten.
Three items people might look for are **not** deferrals: Monte Carlo, thermal
and firmware-in-the-loop simulation were **rejected** by the simulation spec
(§9), and the metering model (D37) is an **open product decision**, not code.

Last reconciled: 2026-07-29. ✅ = since resolved.

## The one that was blocking tests — resolved

| | |
|---|---|
| **ngspice integration** ✅ | Installed 2026-07-29. The known-answer suite runs: divider exact, LED branch within 5% of hand calculation. Installing it immediately caught a real bug — the diode emission coefficient was mis-derived (`N = Vf/0.7`), fixed to `N = Vf/(Vt·ln(If/Is))` at rated current. This is why the plan said "skip loudly": a silent skip would have shipped that model. |

## A. Blocked on a live deployment or the live API

These cannot be *verified* from this repo alone. Building them against fakes
would produce untested claims — the thing this project exists to avoid.

| Item | Why deferred | Scope when unblocked | Size |
|---|---|---|---|
| **Streaming transport** (agent) | No observable effect on the event union — `SessionEvent` is already delta-shaped; streaming exists to dodge request timeouts on long turns, which only bite against the real API. D44 records the trade. | Swap `messages.create` → `client.messages.stream`; map SDK stream events to deltas incrementally instead of post-hoc; teach `fake-llm.ts` to speak SSE so the loop tests keep their determinism; drop the client-timeout workaround. | 1–2 days |
| **SSE / WS live wiring** (UI ⇄ agent/bridge) | Needs a server process and session routing — there is no deployment yet. Both transports already converge on the one `SessionConsumer`; nothing about the UI changes. | Hosted: an HTTP endpoint streaming `SessionEvent` over SSE with event ids and replay-from-last-id (UI spec §10). Bridge: a `ws` server behind `pairing.ts` (origin pinning + token already built and tested). UI: one `EventSource`/`WebSocket` shim feeding `SessionConsumer`, reconnection replay. | 2–3 days |
| **Server-side compaction beta** (agent) | The beta's behaviour (`compact-2026-01-12`) cannot be faked faithfully; a fake would test our guess about the API, not the API. The load-bearing parts — pressure gating, append-content-whole, the protected bench tail — are built and tested locally. | Add the beta flag; keep local compaction as fallback; an integration eval against the live API asserting the protected tail survives a real compaction. | ½ day + live eval |
| **Web-research live execution** (agent) | `web_search`/`web_fetch` are server tools that execute on Anthropic infra — offline tests can only assert config. The standard of proof is already enforced: `feasibility_claim` rejects unevidenced claims at the schema. | Add the two server-tool defs to the request config; label fetched content `[web content — untrusted]` (labels exist); map citations → `evidence.url` + `fetchedAt`. | 1 day |

**Trigger for all of A:** the first hosted deployment. They should land together as one "go live" plan.

## B. Blocked on content and curation — human-verified, not code

| Item | Why deferred | Scope | Size |
|---|---|---|---|
| **Persona prose** (17 files, D38) | The agent-runtime spec scopes it out explicitly: personas are *content, written per stage as the stages are built*. Format, pack loading, effort table and progressive disclosure are all implemented. | Write Phase 1 first: ②-feasibility, ③-requirements, ④-architecture, ⑥-prototype — each 1–2 pages on the fable-guide spine (chapters 03/05/07/08 carry the unique value). Iterate against transcripts. | Days of writing, ongoing |
| **Sampled prose evals** | Needs personas to evaluate — there is nothing to sample yet. Agent-runtime spec §13 says it deserves its own spec. | An eval spec: rubric per persona, transcript sampling harness reusing `fake-llm.ts` posture against the live API, regression tracking. | Own spec + ~2 days harness |
| **Curated library → ~150 parts** | **The schedule risk, named since HANDOFF day one.** ~12 hand-verified fields per part; a hallucinated pinout is a burnt component. Cannot be delegated to a model; no code accelerates it much. | Per part: safety profile + footprint (now) and SPICE model + KiCad symbol/footprint (Phase 2/3, D25). Instrument: `validateBundle` already reports gaps. Sequence by build-guide demand: LED/resistor/Uno ✅, then ESP32, sensors, transistors, caps. | The schedule itself — steady drip, not a sprint |
| **Four deferred rules** (flyback, source capacity, LiPo, decoupling) | Blocked on the row above: each needs profile fields or parts that don't exist (`hazardClass: 'inductive'`, stall currents, `'lipo'` cells, per-IC decoupling expectations). Building them now means inventing library data to test against — rules that pass their fixtures and fail on real circuits. | Each is one Slice-1-style task (rule + tests + danger-corpus entries) once ≥1 real part carrying the fields is curated. The engine needs no changes. | ~½ day each, after curation |

## C. Tooling that earns its keep at a later stage

| Item | Why deferred | Scope | Size |
|---|---|---|---|
| **Playwright e2e** | The no-LLM golden path is already covered where it's deterministic (tool layer + cross-brain). Browser-level assertions add value once the shell has real *flows* to walk — today it would screenshot a static frame. | Install browsers; seed a project; drive front door → gate through the UI; the §14 DOM safety sweep (no dismiss control anywhere; BLOCKER visible at every breakpoint; prose doesn't remove cards). | 1–2 days, after A |
| **svelte-check in CI** | There is no CI at all yet — it's a repo-level choice, not a UI one. | One GitHub Actions workflow: `pnpm install && pnpm test` + `svelte-check` + the corpus submodule checkout. Cheap and worth doing soon. | ~1 hour |
| **three.js GLB viewer** | Stage ⑩ (mechanical) has no spec — a viewer with nothing to view. UI spec §5 reserves the surface. | Arrives inside the mechanical-stage spec: CadQuery → GLB server-side, `three.js` scene with the board inside the case, collision highlights from engine findings. | With stage ⑩ |
| **PNG derivation from CSV** | Needs a rendering dependency choice (resvg/node-canvas); CSV is canonical and the repo-archival PNG is a convenience, not a capability. | `waveformView` points → SVG → PNG via `@resvg/resvg-js` in `sim/results/`; wire into `report.md`. | ½ day |
| **Bridge packaging, signing, update** | UI spec §15 and ACP spec §9 both push it out: it's an install story (certs, platforms, update channel), operationally real and orthogonal to behaviour — the bridge *runs* today via node. | Its own spec first: single-binary build (Node SEA or bun), macOS/Windows signing, update check against a release feed, the §11 install prompts already exist in the UI core. | Spec + 2–3 days + cert ops |

## Suggested order

1. **CI** (an hour, protects everything else) → 2. **Persona prose for Phase 1** (unblocks evals, improves every hosted turn) → 3. **The go-live cluster A** (streaming, SSE/WS, compaction beta, web research — one plan) → 4. **Playwright** on top of the live shell → 5. **Curation drip** running underneath it all, unlocking the four rules as parts land → 6. Stage specs ⑦/⑧/⑨ bring the viewer and packaging with them.
