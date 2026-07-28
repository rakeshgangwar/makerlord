# MakerLord — Design Spec: the Tool Surface

**Date:** 2026-07-29
**Status:** Approved design, pre-implementation
**Covers:** the shared tool core, the `maker` CLI, and the `maker-mcp` server

First of three agent-layer specs. The other two — the ACP host, and our own
agent runtime — depend on this one and are not covered here.

| Spec | Covers | Status |
|---|---|---|
| **This** | tool core, CLI, MCP server | approved |
| ACP host | process spawning, JSON-RPC over stdio, session bridging | not written |
| Agent runtime | the loop, context accounting, personas, compaction | not written |

Implements the surface sketched in
[../../ai-implementation.md](../../ai-implementation.md) §2.

---

## 1. Why this exists first

The tool surface is the engine's public API, and everything else is a client of
it — our agent, an external agent, the UI, and the tests.

Three things fall out of building it before any agent exists
([ai-implementation.md](../../ai-implementation.md) §2, following `buzz-cli`):

1. Our agent calls it.
2. **External agents call it** — a maker adds `maker-mcp` to their own Claude
   Code or Codex config and drives MakerLord today, with no ACP host.
3. **It is testable with no LLM in the loop at all.**

That third point is why this spec is first. Until it exists, nothing about the
product can be tested end to end.

---

## 2. Architecture: one core, two adapters

The only genuine structural fork is which surface wraps which. **Both wrap a
shared core** — if the CLI shelled out to the server, its bugs would become the
server's, and the LLM-free testability that motivated the CLI would evaporate.

```
packages/tools/          THE CORE — every tool as a plain async function
  src/registry.ts        name → ToolDef
  src/result.ts          ToolResult
  src/session.ts         load / mutate / atomic write
  src/tools/*.ts         one file per group

packages/cli/            `maker`      — argv → registry → JSON on stdout
packages/mcp/            `maker-mcp`  — MCP → registry → tool result
```

**Both adapters are thin and dumb.** The registry is the single source of truth
for what tools exist, what they accept, and which ones gate. Neither adapter
contains business logic, and neither may add a tool the other lacks.

`packages/tools` depends on `@makerlord/project`, `@makerlord/circuit` and
`@makerlord/parts`. The adapters depend only on `packages/tools`.

---

## 3. Three outcomes, not two

```ts
type ToolResult<T> =
  | { ok: true;  data: T }
  | { ok: false; refused: RefusalCode; findings: Finding[]; message: string };

// Genuine breakage throws. It is not a ToolResult at all.
```

| Outcome | CLI | MCP | What the agent should do |
|---|---|---|---|
| Success | exit **0**, `{ok:true,…}` on stdout | normal result | continue |
| **Refusal** | exit **0**, `{ok:false,refused:…}` | normal result | read `findings`, fix the cause |
| Error | exit **1**, `{error:…}` on stderr | `isError: true` | report; do not retry blindly |

**Refusal exiting 0 is deliberate.** *"You may not do this yet, and here is
exactly why"* is a successful call — the tool did its job. Conflating it with
breakage is what makes agents retry pointlessly and what turns a clear blocker
into a confusing failure.

```ts
type RefusalCode =
  | 'BLOCKERS_UNRESOLVED'    // a gated action while a BLOCKER stands
  | 'GATE_NOT_OPEN'          // power-up before the measurement gate opened
  | 'MEASUREMENT_REQUIRED'   // gate_open without recorded measurements
  | 'BLOCK_UNDECIDED'        // expand with sourcing: undecided
  | 'MAINS_ON_BREADBOARD'    // absolute, no tier opens it (D32)
  | 'TIER_NOT_OPEN'          // mains work with no tier opted into (D32)
  | 'STALE_PROJECT';         // optimistic-lock failure, §4
```

**There is no `dismiss_finding`, `override_blocker` or `set_severity` tool.**
The safety property from D3 is enforced by absence: you cannot call what was
never defined. The refusal path is the only response to a blocker.

---

## 4. Stateless, file-backed, atomic

Every call is independent: **load → validate → mutate → atomic write → exit.**
No daemon, no in-memory session, nothing to resume.

### Project addressing

```
--project <path>    explicit
otherwise           walk up from cwd looking for project.json, git-style,
                    terminating at the filesystem root
```

Failing to find one is an **error**, not a refusal — nothing was asked of a
project that does not exist. `project_init` is the exception: it requires the
*absence* of a project, and errors if one already exists rather than silently
overwriting it.

### Atomic writes

Writes go to a temp file in the same directory, then `rename()`. A crash
mid-write cannot leave a half-written `project.json`.

### Optimistic locking

D34 means **two writers**: the web app and a local clone can both hold the same
project. Every mutating call carries the `contentHash` it read; if the file has
changed underneath, the call refuses rather than clobbering.

```
$ maker connect LED1.anode U1.D13 --expect-hash a3f9c1…
{ "ok": false, "refused": "STALE_PROJECT",
  "message": "project changed since read; re-read and retry" }
```

**`expectHash` is a registry-level concern, not part of any tool's own zod
schema.** The registry appends it to every tool whose `mutates` flag is set, so no `ToolDef` declares it and no handler validates it — `session.ts`
does, once. It is optional on the CLI for interactive use; the MCP adapter
always supplies it, because an agent making fifty calls against a project a
human is also editing is exactly the case this protects.

This is the same lesson as D35's rejection of round-trip sync: **silently
clobbering someone's work is the failure mode worth engineering against.**

---

## 5. The tool catalogue

Thirty-two tools in nine groups. **The registry name is canonical**; the CLI
maps subcommand paths onto it (`maker req propose` → `req_propose`).

| Group | Tools |
|---|---|
| project | `project_init` `project_status` `project_inspect` |
| inventory | `inventory_add` `inventory_list` `inventory_remove` |
| parts | `parts_search` `parts_get` |
| feasibility | `feasibility_claim` `feasibility_verdict` `feasibility_show` |
| requirements | `req_slots` `req_propose` `req_confirm` `req_list` `req_remove` |
| architecture | `block_add` `block_link` `block_sourcing` `arch_show` |
| circuit | `part_add` `connect` `place` `wire` |
| checks | `check_requirements` `check_architecture` `check_circuit` `predict_dc` |
| **gated** | `expand` `advance_build_step` `gate_open` `measure` |

**Only the gated group can refuse.** Everything else either succeeds or throws.

`parts_search` → `parts_get` is the progressive-disclosure pair
([ai-implementation.md](../../ai-implementation.md) §4): the 1,794-part corpus
never enters a prompt whole. `req_slots` is the archetype-driven elicitation
from the front-door spec §5.2.

**On tool count:** thirty-two sits below the threshold where tool search and
`defer_loading` earn their complexity. All tools load every time.
Revisit if the catalogue doubles.

---

## 6. One schema, three consumers

```ts
interface ToolDef<I, O> {
  name: string;        // 'req_propose' — canonical
  summary: string;     // MCP description AND CLI --help text
  input: z.ZodType<I>;
  mutates: boolean;    // registry appends expectHash when true (§4)
  gated: boolean;      // may return a refusal; implies mutates
  handler(input: I, session: Session): Promise<ToolResult<O>>;
}
```

A single zod schema drives all three surfaces:

```
z.object({ metric: z.string(), value: z.number(), unit: z.string() })
   │
   ├─→ runtime validation     zod .parse() at the boundary
   ├─→ MCP inputSchema        zod-to-json-schema
   └─→ CLI flags              --metric <str> --value <num> --unit <str>
```

Top-level keys become flags; nested objects take JSON strings. **Adding a tool
means adding one `ToolDef`** — the CLI grows a subcommand and MCP grows a tool
with no further edits, and the three surfaces cannot drift because there is
nothing to keep in sync.

### Summaries state when to call, not just what

`summary` is prescriptive:

> ✅ *"Call this when the maker states a target with a number in it — a runtime,
> a temperature range, a size limit."*
> ❌ *"Proposes a requirement."*

Trigger conditions in tool descriptions measurably improve should-call rate,
and the summary is the only description an external agent ever sees.

---

## 7. Testing

**Handlers, adapter-free.** Every tool tested as a plain function against a
fixture project. This is the bulk of the suite.

**Registry invariants** — one file asserting across the whole catalogue:

- no duplicate names
- every tool has a non-empty, prescriptive summary
- every gated tool returns a `refused` result when its precondition fails
- **no tool name matches `/dismiss|override|suppress|force/`**

That last assertion is a guard-rail rather than a test of behaviour. D3's
guarantee is that the tool does not exist; this is how that line gets held
against a future contributor who thinks an escape hatch would be convenient.

**CLI as subprocess** — assert JSON on stdout and all three exit codes. This is
where the refusal-exits-0 contract is pinned.

**MCP in-process** — `tools/list` matches the registry exactly; a call
round-trips; a refusal arrives as a normal result rather than `isError`.

**A golden end-to-end script, with no LLM at all:**

```
project_init → req_propose → req_confirm → block_add → block_link
→ check_architecture → expand → check_circuit
```

asserted against the resulting `project.json`. That exercises the front door and
the block→circuit handoff in one deterministic pass. It is the closest thing to
an integration test the product can have before an agent exists — and it is the
main reason the CLI was worth building before the agent.

---

## 8. Error handling

| Situation | Behaviour |
|---|---|
| No `project.json` found | **Error** — exit 1. Nothing was asked of a real project. |
| Invalid arguments | **Error** — zod's message, exit 1 |
| Unknown tool name | **Error** — exit 1, listing near matches |
| Project changed under us | **Refusal** — `STALE_PROJECT` |
| Gated action with a live BLOCKER | **Refusal** — `BLOCKERS_UNRESOLVED`, findings attached |
| Mains part on a breadboard | **Refusal** — `MAINS_ON_BREADBOARD`, at every tier (D32) |
| Write fails mid-operation | **Error** — the temp file is discarded; `project.json` is untouched |

---

## 9. Scope

**In:** the tool core, the registry, the result type, session load/write with
optimistic locking, all thirty-two tools, the `maker` CLI, the `maker-mcp`
server, and the test suite above.

**Out:**
- **The ACP host** — its own spec. Nothing here spawns a process.
- **Our agent runtime** — its own spec. Nothing here calls an LLM.
- **Personas** (D38) — they belong to the agent runtime.
- **`research_prior_art`** — it needs web fetch, which belongs to the agent, not
  the engine. `feasibility_claim` accepts the *result* and validates its
  evidence (front-door spec §3.5); the fetching happens a layer up.
- **The UI** — its own spec; it is a client of this surface.

**This is one implementation plan's worth of work.** It adds three packages
sharing one registry. The only genuinely new code is `session.ts` — load,
atomic write, optimistic lock — which is plumbing, not domain logic. Every
handler delegates its actual work to `@makerlord/project`,
`@makerlord/circuit` or `@makerlord/parts`.
