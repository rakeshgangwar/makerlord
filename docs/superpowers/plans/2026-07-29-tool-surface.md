# MakerLord Tool Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the engine's public API — the shared tool core (`@makerlord/tools`), the `maker` CLI, and the `maker-mcp` server — so that our agent, external agents, the UI and the tests all drive one registry.

**Architecture:** Three packages. `@makerlord/tools` holds the registry (name → `ToolDef`), the three-outcome `ToolResult`, `session.ts` (load / atomic write / optimistic lock), and one file per tool group. `@makerlord/cli` and `@makerlord/mcp` are thin adapters over the registry; neither contains business logic, neither may add a tool the other lacks.

**Tech Stack:** TypeScript (strict), Node 22, pnpm, Vitest, zod, zod-to-json-schema, @modelcontextprotocol/sdk.

**Prerequisite:** Slices 0–1 and the front door. Handlers delegate to `@makerlord/project`, `@makerlord/circuit`, `@makerlord/parts`.

**Spec:** [../specs/2026-07-29-tool-surface-design.md](../specs/2026-07-29-tool-surface-design.md)

## Global Constraints

- **Three outcomes.** Success and refusal are `ToolResult`; genuine breakage throws. Refusal exits 0 on the CLI and is a *normal* MCP result, never `isError`.
- **Only the gated group refuses.** `expand` `advance_build_step` `gate_open` `measure`. Everything else succeeds or throws.
- **No escape hatches:** no tool name may match `/dismiss|override|suppress|force/`. Registry invariant test pins this.
- **Stateless, file-backed, atomic:** load → validate → mutate → temp-file + `rename()` → exit. `contentHash` optimistic locking on every mutating tool, appended by the registry (`mutates: true`), never declared per-tool.
- **Parts are never invented:** `part_add` validates the defId against the curated bundle; `connect`/`place`/`wire` validate pins, holes and boards at the boundary.
- **RefusalCode:** `BLOCKERS_UNRESOLVED | GATE_NOT_OPEN | MEASUREMENT_REQUIRED | BLOCK_UNDECIDED | MAINS_ON_BREADBOARD | TIER_NOT_OPEN | STALE_PROJECT` — exact strings.

## File Structure

```
packages/tools/
├── package.json           @makerlord/tools
└── src/
    ├── index.ts            public surface
    ├── result.ts           ToolResult, RefusalCode, ok/refuse helpers
    ├── session.ts          ProjectFile, load, atomic write, hash, discovery
    ├── registry.ts         ToolDef, register, ALL_TOOLS, runTool
    ├── data.ts             curated bundle + board loading (cached)
    └── tools/
        ├── project.ts      project_init/status/inspect
        ├── inventory.ts    inventory_add/list/remove
        ├── parts.ts        parts_search/get
        ├── feasibility.ts  feasibility_claim/verdict/show
        ├── requirements.ts req_slots/propose/confirm/list/remove
        ├── architecture.ts block_add/link/sourcing, arch_show
        ├── circuit.ts      part_add/connect/place/wire
        ├── checks.ts       check_requirements/architecture/circuit, predict_dc
        └── gated.ts        expand/advance_build_step/gate_open/measure
packages/cli/               `maker` — argv → registry → JSON on stdout
packages/mcp/               `maker-mcp` — MCP server over the registry
```

### The project file

```ts
interface ProjectFile {
  version: 1;
  project: Project;                    // @makerlord/project
  build: {
    currentStep: number;               // index into buildSequence
    gateOpen: boolean;
    measurements: { name: string; value: number; unit: string }[];
  };
}
```

---

### Task 1: Package scaffold, result type

- [ ] `packages/tools` scaffold wired into workspace + tsconfig refs
- [ ] `result.ts`: `ToolResult<T>`, `RefusalCode`, `ok()`, `refuse()`
- [ ] Tests: result shape, refusal carries findings + message

### Task 2: Session — load, hash, atomic write, optimistic lock

- [ ] `contentHash(text)` — sha256 hex
- [ ] `loadProjectFile(path)` → `{ file, hash }`; parse + version check
- [ ] `saveProjectFile(path, file, expectHash?)` — temp file + rename; hash mismatch returns `STALE_PROJECT` refusal, not a throw
- [ ] `findProjectFile(cwd)` — walk up git-style; error (throw) when absent
- [ ] `initProjectFile(path, intent)` — errors if project.json already exists
- [ ] Tests: round-trip, lock refusal on concurrent write, discovery walk-up, init-refuses-overwrite

### Task 3: Registry and invariants

- [ ] `ToolDef<I,O>` per spec §6; `registerTool`, `ALL_TOOLS`, `runTool(name, input, session)`
- [ ] Registry appends `expectHash` handling for `mutates: true` tools — session validates, once
- [ ] Invariant tests: unique names; non-empty prescriptive summaries (≥ 20 chars); `gated ⇒ mutates`; **no name matches `/dismiss|override|suppress|force/`**; every gated tool refuses when its precondition fails (asserted per-tool in later tasks, pinned here as a registry sweep once all groups land)

### Task 4: project + inventory groups

- [ ] `project_init` (mutates; errors if exists), `project_status` (summary counts + gate state), `project_inspect` (full file)
- [ ] `inventory_add/list/remove`
- [ ] Handler tests against fixture projects (adapter-free)

### Task 5: parts group

- [ ] `data.ts`: load curated bundle (curated.json + profiles) and half-breadboard board once, cached
- [ ] `parts_search {query}` → id + title + family one-liners from the curated bundle only
- [ ] `parts_get {id}` → definition + safety profile; error for unknown id
- [ ] Tests over the real vendored corpus

### Task 6: feasibility + requirements groups

- [ ] `feasibility_claim` validates through `parseFeasibilityClaim` (evidence rules); `feasibility_verdict`; `feasibility_show`
- [ ] `req_slots {intent?}` → archetype suggestion + slots; `req_propose` (provenance respected, defaults → assumed); `req_confirm` (assumed → stated); `req_list`; `req_remove`
- [ ] Tests: sourced-claim-without-evidence throws (validation error, not finding)

### Task 7: architecture + circuit groups

- [ ] `block_add`, `block_link` (validates blocks + interfaces exist), `block_sourcing`, `arch_show`
- [ ] `part_add` (defId must be in the bundle), `connect` (intent net; pins must exist on the part definitions), `place` (hole must exist on the board; resolves via footprint), `wire` (both holes must exist)
- [ ] Tests: hallucinated pin/hole/part are errors at the boundary

### Task 8: checks group

- [ ] `check_requirements` → `checkRequirements` findings
- [ ] `check_architecture` → `checkArchitecture` findings
- [ ] `check_circuit` → derive netlist + `runRules(ALL_RULES)` over the real board
- [ ] `predict_dc` → `predictDc`
- [ ] Tests: the danger-corpus rail short surfaces through the tool

### Task 9: gated group

- [ ] `expand`: refuses `BLOCK_UNDECIDED`, refuses `BLOCKERS_UNRESOLVED` while the architecture gate is shut; writes `project.circuit`
- [ ] `advance_build_step {to}`: refuses `BLOCKERS_UNRESOLVED` on live circuit blockers; refuses `MAINS_ON_BREADBOARD` when an envelope REFUSE stands; refuses `GATE_NOT_OPEN` when crossing the GATE step unopened
- [ ] `measure {name,value,unit}`: records a measurement
- [ ] `gate_open`: refuses `MEASUREMENT_REQUIRED` with no measurements; refuses `BLOCKERS_UNRESOLVED`; sets `gateOpen`
- [ ] Tests: every refusal code reachable; refusals exit `ok:false` with findings attached

### Task 10: `maker` CLI

- [ ] `packages/cli`: argv → subcommand path → registry name (`maker req propose` → `req_propose`); flags from zod shape; `--project`, `--expect-hash`
- [ ] Exit codes: success 0, refusal 0, error 1 (stderr JSON)
- [ ] Subprocess tests pin all three exit codes and the refusal-exits-0 contract

### Task 11: `maker-mcp` server

- [ ] `packages/mcp`: MCP server over stdio; `tools/list` mirrors the registry via zod-to-json-schema; refusal arrives as a normal result, never `isError`
- [ ] In-process tests: list matches registry exactly; a call round-trips; a refusal is not an error

### Task 12: Golden end-to-end script

- [ ] With **no LLM**: `project_init → req_propose → req_confirm → block_add → block_link → check_architecture → expand → check_circuit` asserted against the resulting `project.json`
- [ ] Full suite + typecheck green; commit

---

## Spec coverage

| Spec section | Tasks |
|---|---|
| §2 one core, two adapters | 1, 10, 11 |
| §3 three outcomes | 1, 9, 10, 11 |
| §4 stateless/atomic/optimistic lock | 2 |
| §5 catalogue (32 tools, 9 groups) | 4–9 |
| §6 one schema, three consumers | 3, 10, 11 |
| §7 testing incl. guard-rail grep | 3, 12 |
| §8 error handling | 2, 9, 10 |
