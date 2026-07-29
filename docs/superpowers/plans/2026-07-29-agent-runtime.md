# MakerLord Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `maker-agent` — our hosted agent: the loop over the tool registry, two-measure context accounting, compaction gating with a protected tail, cache-stable prompt assembly, persona loading, bounded objections, mid-turn steering, and `SessionEvent` emission — tested against a fake LLM over real HTTP.

**Architecture:** One package, `@makerlord/agent`. It calls the tool registry **in-process** (no MCP hop) and emits the `@makerlord/protocol` event union. The Anthropic SDK is pointed at a real local HTTP server in tests (buzz's `fake_llm` posture); assertions land on `project.json`, not on prose.

**Tech Stack:** TypeScript (strict), Node 22, pnpm, Vitest, @anthropic-ai/sdk.

**Prerequisite:** tool surface (registry), ACP host (`SessionEvent`).

**Spec:** [../specs/2026-07-29-agent-runtime-design.md](../specs/2026-07-29-agent-runtime-design.md)

## Resolved at implementation time (spec §2 ⚠️)

The spec prefers the beta tool runner but flags one requirement that would force
a manual loop: mid-turn steering by pushing a message between runner turns.
That contract cannot be verified against the beta surface offline, and the
fake-LLM harness needs deterministic control of retries, refusal handling and
steering fold-in. **Decision: manual loop**, with the runner's per-turn hook
shape kept so a later swap stays cheap. Recorded as D44.

## Global Constraints

- **Model config:** `claude-opus-5`, `thinking: { type: 'adaptive' }` (never `budget_tokens`), `max_tokens: 64000`, effort per stage.
- **Two context measures:** `estimatedBytes` (wire) vs `contextPressureBytes` (compaction gating). **Images charge 16 KiB flat pressure** — the inherited-bug regression test.
- **Cache prefix stability:** no timestamp/project-id/session-id in the stable prefix; byte-identical across turns; `cache_control` breakpoint after the corpus digest.
- **Findings re-injected every turn from engine state** — never carried in conversation prose.
- **Two refusals never look alike:** engine `ToolResult.refused` → finding data; `stop_reason: 'refusal'` (HTTP 200, possibly empty content) → `session.error`, handled before reading `content[0]`.
- **Bounded objections:** three re-justifications of a live BLOCKER, then stop and surface it; counter resets on user message.
- **Untrusted labels** on re-entering text: `[web content — untrusted]`, `[agent-authored — untrusted]`, `[maker-supplied — unverified]`, `[compacted — lossy]`.
- **Protected compaction tail:** current build step, open findings, last three measurements survive verbatim.

## File Structure

```
packages/agent/src/
├── context.ts       estimatedBytes / contextPressureBytes
├── persona.ts       pack.json + *.persona.md loading, effortFor(stage)
├── prompt.ts        assemblePrompt — stable prefix / breakpoint / volatile
├── untrusted.ts     labelling helpers
├── objections.ts    BLOCKER re-justification counter
├── compaction.ts    pressure gating + protected tail
├── events.ts        API response → SessionEvent[]
├── loop.ts          AgentSession: manual loop, steering queue, registry calls
└── index.ts
packages/agent/test/fake-llm.ts   real HTTP server, queued canned responses
```

---

### Task 1: Context accounting

- [ ] `estimatedBytes` / `contextPressureBytes`; image blocks charge 16 KiB flat pressure, true size on the wire
- [ ] Tests incl. the 3 MB image regression (≈1500× over-count prevented)

### Task 2: Personas

- [ ] Pack loading from `.makerlord/personas/` (project repo, D34): `pack.json` defaults + `NN-stage.persona.md`; active stage in context, others names only
- [ ] `effortFor(stage)`: xhigh ④⑥⑧⑨ / high default / medium ①⑯, overridable per pack
- [ ] Tests over fixture packs

### Task 3: Prompt assembly and caching

- [ ] Stable prefix: fable-guide spine → active persona → corpus digest (families + counts only); `cache_control` breakpoint; volatile: project summary → open findings (from engine state) → conversation
- [ ] Tests: byte-identical stable prefix across project mutations; findings re-injected uneroded; no session id anywhere in the prefix

### Task 4: Objections, untrusted labels, compaction

- [ ] `objections.ts`: three strikes then surface; reset on user message
- [ ] `untrusted.ts`: the four labels
- [ ] `compaction.ts`: gate on pressure only; protected tail survives verbatim; summary re-enters labelled `[compacted — lossy]`
- [ ] Tests for each

### Task 5: The loop and events

- [ ] `loop.ts`: manual loop over `client.messages.create`; tools from the registry unchanged (name + summary verbatim); tool results back as `tool_result`; steering queue folded in at round boundaries; engine refusals stay `ToolResult` in `tool.end`
- [ ] `events.ts`: response content → `message.delta` / `thought.delta` / `tool.start` / `tool.end` / `turn.end`; `stop_reason: 'refusal'` → `session.error` before content is read
- [ ] Fake LLM: real HTTP server on an ephemeral port, queued canned Messages responses, env-configured base URL

### Task 6: Golden transcript — assert on the artefact

- [ ] Canned conversation drives real tool calls against a temp project; assert on the resulting `project.json`, not the prose
- [ ] Bounded-objections case: canned model re-argues a BLOCKER four times → stopped after three
- [ ] Classifier-refusal case: empty content + `stop_reason: 'refusal'` → `session.error`, no crash, no finding card
- [ ] Full suite + typecheck green; record D44; commit

## Spec coverage

| Spec section | Tasks |
|---|---|
| §2 loop (manual, decision recorded) | 5 |
| §3 model config + two refusals | 5, 6 |
| §4 two measures | 1 |
| §5 compaction + protected tail | 4 |
| §6 prompt assembly + cache stability | 3 |
| §7 personas + effort | 2 |
| §9 untrusted labels | 4 |
| §10 steering + bounded objections | 4, 5, 6 |
| §11 events out | 5 |
| §12 testing | 1, 3, 4, 6 |

**Deferred, named:** server-side compaction beta (needs the live API; local gating + tail protection built now), the web-research server tools' live execution (config constants land; execution needs the real API), sampled prose evals (needs personas), streaming transport (production wiring when the UI lands — the event union is already delta-shaped).
