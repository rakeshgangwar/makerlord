# MakerLord — Design Spec: the ACP Host

**Date:** 2026-07-29
**Status:** Approved design, pre-implementation
**Covers:** `maker-bridge`, the local daemon that spawns and drives external
agent binaries over the Agent Client Protocol

Second of three agent-layer specs. It depends on
[the tool surface](2026-07-29-tool-surface-design.md) and is depended on by
[the agent runtime](2026-07-29-agent-runtime-design.md).

| Spec | Covers | Status |
|---|---|---|
| Tool surface | tool core, CLI, MCP server | approved |
| **This** | the bridge, ACP host, agent registry, event normalisation | approved |
| Agent runtime | the loop, context accounting, personas, compaction | approved |

Implements the ACP half of [../../ai-implementation.md](../../ai-implementation.md) §1.

---

## 1. What this is for

A maker who already pays for Claude Code, Codex or Gemini should be able to
point MakerLord at it and use their own subscription instead of our inference
budget ([ai-implementation.md](../../ai-implementation.md) §1). Our agent stays
the default — a fourteen-year-old needs no subscription and no install — but it
gets **no privilege**. In `block/buzz`'s harness, `buzz-agent` sits in the same
match arm as `codex` and `claude-code-acp`. Copy that posture.

**ACP is the app↔agent boundary; MCP is the agent↔engine boundary.** This spec
owns the first. The second is already built (tool-surface spec).

---

## 2. Where it runs: the bridge

D39 makes the UI web-first. A browser cannot spawn a process, and the maker's
Claude Code licence lives on the maker's machine — so the ACP host cannot be
server-side either. It runs in **`maker-bridge`**, a small local daemon.

```
browser (makerlord.io)
  │
  │  A. hosted agent — server-side, our runtime
  ├──────────────────────────────► agent runtime ──► tool registry (in-process)
  │
  │  B. BYO agent — localhost WebSocket
  └──► maker-bridge ──spawn──► claude-code-acp        (the maker's binary)
            │                        │
            │                        └──stdio MCP──► maker-bridge mcp --session
            │                                              │
            └──────────────────────────────────────────────┘
                       one project's authority, nothing more
```

Both paths emit **the same normalised event stream** (§5), so the UI has one
code path rather than two.

### The bridge is the local-capabilities daemon, not an ACP daemon

Hosting ACP is one of three jobs it does, and bundling them is what makes the
install worth asking for at all:

| Job | Why it can't be server-side |
|---|---|
| **ACP host** | The maker's agent binary and licence are local |
| **Serial** | Firefox and Safari have no Web Serial; flashing needs a port |
| **Local clone** | Power users work in KiCad on their own disk (D34, D35) |

**It is optional.** A Chromium maker using the hosted agent never installs it —
Web Serial covers stage ⑦, and the server repo covers everything else. The
bridge is what a maker installs when they want their own agent, their own
browser, or their own filesystem. Distribution and update are the UI spec's
problem, not this one's.

---

## 3. The agent registry

Which binaries can be a brain, and how we find them.

```ts
interface AgentEntry {
  id: string;              // 'claude-code' | 'codex' | 'gemini' | custom
  displayName: string;
  command: string;         // resolved absolute path
  args: string[];
  env?: Record<string, string>;
  source: 'builtin' | 'user';
  detected: boolean;       // found on PATH at last probe
}
```

Two sources, merged with user entries winning:

- **Built-in probes** — a table of known ACP adapters checked against `PATH`.
- **`~/.makerlord/agents.json`** — hand-written entries for anything else,
  including a locally built binary.

⚠️ **The built-in table's exact package and binary names are unverified** — the
ACP adapter ecosystem is young and names move. They are recorded in
[references.md](../../references.md) as ❌ and must be confirmed against each
project before the table ships. Getting one wrong costs a failed probe and a
"not found", not a crash, but a stale table is a silently degraded feature.

**Probing is cheap and explicit.** The bridge probes on start and on demand from
the UI's settings panel — never on every session. A probe is `command --version`
with a 2-second timeout; anything else is a non-detection.

---

## 4. Protocol lifecycle

JSON-RPC 2.0 over the child's stdio, one process per session.

```
spawn ──► initialize ──► session/new ──► session/prompt ──► session/update*
                                              ▲                    │
                                              └────────────────────┘
                                         (turn ends on stopReason)
```

⚠️ **ACP method and payload names below follow the published protocol as we
currently understand it and must be checked against
[agentclientprotocol.com](https://agentclientprotocol.com/) at implementation
time.** They are recorded in [references.md](../../references.md) as ⚠️. The
architecture here does not depend on the exact spelling — the normalisation
layer (§5) is where any drift gets absorbed.

### 4.1 `initialize` — and the capability that decides everything

The client sends its protocol version and capabilities; the agent replies with
its own plus any auth methods it needs.

**If the agent cannot accept MCP servers at session creation, we refuse to use
it.** An agent with no tools cannot mutate the project, cannot run a check, and
cannot be gated — it can only produce prose about a circuit it cannot see. That
is precisely the product we are not building (D2).

```
✅  agent supports mcpServers  → usable
❌  agent does not             → refuse, with a message naming the missing
                                 capability and offering the hosted agent
```

This is a refusal in the tool-surface sense: an outcome, not a crash. Failing
soft here — running the agent toolless and hoping — would produce an assistant
that confidently describes circuits it has never inspected.

`initialize` gets a **10-second timeout**. A binary that does not handshake in
ten seconds is broken or is not an ACP agent.

### 4.2 `session/new` — scoping authority

```
cwd         the project working directory
mcpServers  [ { command: 'maker-bridge', args: ['mcp', '--session', <id>] } ]
```

**The bridge hands the agent a per-session MCP server pointed back at itself.**
This is the security property worth the indirection:

- The agent never receives an API token, a project id, or a repo URL.
- The session id is opaque, short-lived, and bound to exactly one project.
- Whether the project is a local clone or a hosted repo is the bridge's
  business; the agent sees one uniform tool surface either way.
- Revoking a session is killing a process, not rotating a credential.

A third-party binary running on the maker's machine gets **one project's worth
of authority and nothing else.**

### 4.3 `session/prompt` and cancellation

One prompt per user turn. The turn ends when the agent returns a stop reason.
Cancellation is a protocol notification, and the bridge must treat the turn as
over the moment the user cancels — not when the agent gets round to
acknowledging it.

### 4.4 Termination and failure

| Situation | Behaviour |
|---|---|
| Session ends normally | `SIGTERM`, then `SIGKILL` after 5 s |
| Agent exits mid-turn | Emit `session.error` with exit code and last 4 KiB of stderr; offer restart |
| Agent stops reading stdin | Treated as a crash after a write timeout |
| Bridge shuts down | All child processes killed. **No orphans.** |
| Agent needs auth | Surface the ACP auth method to the UI; never attempt it silently |

**Stderr is captured, ring-buffered and surfaced, never discarded.** When
someone's own Claude Code install fails to start, the error message is the
entire debugging story and it arrives on stderr.

---

## 5. Event normalisation — the load-bearing piece

The UI must not know or care which brain is running. Both paths emit one union,
defined once in `packages/protocol`:

```ts
// packages/protocol/src/events.ts — consumed by the bridge, the agent
// runtime and the UI. This is the only shape the UI renders.
type SessionEvent =
  | { t: 'message.delta';  text: string }
  | { t: 'thought.delta';  text: string }
  | { t: 'tool.start';     callId: string; name: string; input: unknown }
  | { t: 'tool.end';       callId: string; result: ToolResult<unknown> }
  | { t: 'permission.ask'; askId: string; title: string; options: PermissionOption[] }
  | { t: 'plan';           steps: PlanStep[] }
  | { t: 'turn.end';       reason: StopReason }
  | { t: 'session.error';  message: string; detail?: string };
```

The bridge translates ACP session updates into this; the agent runtime (its own
spec, §12) emits it directly from the Anthropic SDK's stream. **Neither the UI
nor the tests contain a branch on which agent produced an event.**

### Why normalise rather than pass ACP through

Passing ACP straight to the browser would be less code today and would couple
the UI to a young external protocol forever. Every ACP version bump would reach
the renderer. More practically: our own agent does not speak ACP and never
will — it runs server-side and calls the registry in-process — so a
pass-through design needs the translation layer anyway, just placed where it
helps least.

### Tool results keep their shape

`tool.end` carries `ToolResult<T>` verbatim from the tool-surface spec. **A
refusal stays a refusal all the way to the renderer** — it does not become an
error, a string, or a chat message. That is what lets the UI render findings
from engine data rather than from agent prose (§6).

---

## 6. What an external agent gets, and what it doesn't

The honest version of the trade, because getting this wrong is how a safety
promise becomes marketing.

| | Hosted agent | BYO agent |
|---|---|---|
| The 32-tool surface | ✅ | ✅ |
| Engine-enforced gates | ✅ | ✅ **identical** |
| Findings rendered in the UI | ✅ | ✅ **identical** |
| Stage personas (D38) | ✅ | ❌ |
| Progressive part disclosure | ✅ | ⚠️ tool-level only |
| Two-measure context accounting | ✅ | ❌ their harness |
| Prompt caching tuned to our prefix | ✅ | ❌ |

> **Equally gated, less well coached.**

The gate is a refused call (D3), so it holds regardless of which model is
driving or what it believes. What we lose is tuning: the persona that knows a
feasibility researcher is not a build coach, the effort sweep, the part-corpus
disclosure strategy.

### The prose gap, and how the UI closes it

An external agent physically cannot advance the build past a live BLOCKER. It
*can* say "that finding looks conservative, just wire it up" — and the maker has
hands.

**So findings are rendered by the client from engine data, never from agent
prose.** The finding strip is populated by `tool.end` payloads and by the UI's
own `check_*` calls. It is not written by the agent, cannot be summarised by the
agent, and has no dismiss control (UI spec §7). A BLOCKER is on screen whatever
the agent chose to say about it.

That is a UI requirement that exists *because* of this spec, and it is the
reason BYO agents are acceptable at all.

### Permissions

ACP permission requests — file writes outside the project, shell commands,
network — surface to the maker as `permission.ask`. **The bridge auto-approves
nothing.** We are hosting someone else's binary on someone's machine; silently
granting it capability is not ours to do.

Our own tool calls never generate a permission ask. Their gating is engine-side
and produces refusals instead, which need no human in the loop.

---

## 7. Transport and trust between browser and bridge

Localhost WebSocket. Two things it must get right:

**Origin pinning.** The bridge accepts WebSocket connections only from the
configured app origin. Without it, any page the maker visits can drive their
agent and read their project.

**Pairing.** First connection requires a code the bridge prints to its own
console and the maker enters once in the app. The token is stored per origin.
This is a small amount of ceremony that prevents a drive-by page from claiming
the bridge, and it happens exactly once.

**No inbound network surface beyond localhost.** The bridge binds `127.0.0.1`
only. It is not a server.

---

## 8. Testing

**A fake ACP agent.** A Node script that speaks the protocol from a queued
script of responses, run as a real subprocess over real stdio — the same posture
as buzz's `fake_llm.rs`, which spins a real HTTP server rather than mocking a
client. Mocking the transport is what lets protocol bugs through.

Cases it covers:

- handshake, session creation, a prompt, a clean turn end
- an agent that omits the MCP capability → **refused, with the naming message**
- an agent that never answers `initialize` → timed out at 10 s
- an agent that exits mid-turn → `session.error` carrying its stderr
- a permission request → surfaced, never auto-approved
- cancellation mid-turn → turn ends immediately

**Normalisation golden tests.** A recorded ACP update stream in, a
`SessionEvent[]` out, asserted exactly. This is where protocol drift will be
caught when the ACP spec moves.

**The cross-brain assertion.** Run the tool-surface spec's golden end-to-end
script through the fake ACP agent and assert **the same refusals fire and the
same `project.json` results** as the direct-registry run. That is the executable
form of "equally gated" — if it ever fails, the two-protocol split is broken and
the BYO path must be disabled until it passes.

**Registry probing** against a temp `PATH` with stub binaries: detection,
non-detection, timeout, and user entries overriding built-ins.

---

## 9. Scope

**In:** the bridge process, the agent registry and probing, ACP lifecycle,
per-session MCP scoping, event normalisation, permission surfacing, the
localhost transport with origin pinning and pairing, and the tests above.

**Out:**

- **Our agent runtime** — its own spec. Nothing here calls an LLM.
- **Serial and flashing** — the bridge hosts them, the firmware spec designs
  them.
- **Git operations** — the bridge exposes local clone access; D34/D35 govern
  behaviour.
- **Bridge packaging, signing and update** — UI spec, since it is part of the
  install story the maker experiences.
- **Personas** — agent runtime.

**One implementation plan's worth of work.** It adds `packages/bridge` and
`packages/protocol`. The genuinely new code is the ACP client and the
normalisation layer; the MCP server it hands out is the one that already exists,
launched in a scoped mode.
