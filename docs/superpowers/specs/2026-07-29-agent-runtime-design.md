# MakerLord — Design Spec: the Agent Runtime

**Date:** 2026-07-29
**Status:** Approved design, pre-implementation
**Covers:** `maker-agent` — our own hosted agent: the loop, context accounting,
personas, prompt assembly, and how any of it gets tested

Third of three agent-layer specs. It depends on
[the tool surface](2026-07-29-tool-surface-design.md) for what it can call and
on [the ACP host](2026-07-29-acp-host-design.md) for the event union it emits.

| Spec | Covers | Status |
|---|---|---|
| Tool surface | tool core, CLI, MCP server | approved |
| ACP host | the bridge, agent registry, event normalisation | approved |
| **This** | the loop, context, personas, prompts, model config | approved |

Implements [../../ai-implementation.md](../../ai-implementation.md) §§3–7.

---

## 1. Where it runs, and why that's not obvious

**Server-side.** The maker opens a URL and talks to a good agent — no key, no
install, no subscription. That's the fourteen-year-old case, and it's the
default (D37 already puts the native toolchain server-side, so the compute is
there anyway).

The BYO path runs on the maker's machine through the bridge. **These are not
symmetric, and pretending they are would be a mistake:** our agent calls the
tool registry as a function in the same process, while an external agent reaches
it over stdio MCP through a scoped server. Same tools, same gates, very
different latency and very different prompt control.

```
maker-agent (server)                      external agent (bridge)
  │                                         │
  ├─ registry.call() in-process             ├─ JSON-RPC ──► maker-bridge mcp
  ├─ our personas, our caching              ├─ their harness, their prompts
  └─ SessionEvent ────────┐    ┌────────────┘
                          ▼    ▼
                    one union, one UI
```

Both emit `SessionEvent` from `packages/protocol` (ACP host spec §5). That is
the only thing the UI knows about either of them.

---

## 2. The loop

Use the SDK's **beta tool runner** (`client.beta.messages.tool_runner`) rather
than hand-writing `while (stop_reason === 'tool_use')`.

```ts
const runner = client.beta.messages.toolRunner({
  model: 'claude-opus-5',
  system: assemblePrompt(session),          // §6
  tools: registry.all().map(toBetaZodTool), // §3
  messages,
  thinking: { type: 'adaptive' },
  output_config: { effort: effortFor(session.stage) },  // §7
  max_tokens: 64_000,
  stream: true,
});
```

**Why the runner and not a manual loop:** its per-turn hooks give us the four
things we actually need — result interception (to attach `cache_control` and to
convert refusals into events), error interception, retry policy, and a place to
fold in mid-turn steering — without owning the loop's edge cases. We would
rebuild all of it worse.

⚠️ **One thing to verify at implementation time:** that mid-turn steering (§10)
can be done by pushing a message between runner turns. If the runner's iteration
model doesn't allow it, that single requirement forces the manual loop — and
it's worth knowing before the package is laid out, not after.

### Tools come from the registry, unchanged

```ts
function toBetaZodTool(def: ToolDef<any, any>) {
  return betaZodTool({
    name: def.name,           // 'req_propose' — canonical, same as CLI and MCP
    description: def.summary, // the prescriptive summary, verbatim
    inputSchema: def.input,
    run: (input) => registry.call(def.name, input, session),
  });
}
```

**Nothing is redefined.** The tool-surface spec's "one schema, three consumers"
becomes four, and the fourth costs eight lines. A tool the CLI has, the agent
has, with the same name and the same description — which means a bug report from
a CLI user reproduces against the agent.

---

## 3. Model configuration

| Setting | Value | Why |
|---|---|---|
| `model` | `claude-opus-5` | Default. Never downgrade for cost silently. |
| `thinking` | `{ type: 'adaptive' }` | **Not `budget_tokens`** — rejected with a 400 on Opus 5 |
| `output_config.effort` | per stage, §7 | `low`/`medium` are unusually strong; sweep rather than assume |
| `max_tokens` | ≥ 64000 at `xhigh` | Thinking and response share the cap |
| `stream` | always | Long turns otherwise hit request timeouts |
| `fallbacks` | `'default'` + beta `server-side-fallback-2026-07-01` | Classifiers can decline; route by category |
| Caching | `cache_control` on the last stable system block | 512-token minimum on Opus 5 |

### Two kinds of refusal, and they must not look alike

`stop_reason: 'refusal'` arrives as **HTTP 200 with empty or partial content.**
Code that indexes `content[0]` breaks. Handle the stop reason before reading
content.

This matters more for us than for most products. A maker asking about mains
wiring, high-current battery packs or pyrotechnics is exactly the
adjacent-to-sensitive shape that trips a classifier — and we have our *own*
refusals, which mean something completely different:

| | Engine refusal | Classifier refusal |
|---|---|---|
| Source | `ToolResult.refused` (D3) | `stop_reason: 'refusal'` |
| Means | "not yet, and here is the finding" | "the model declined to answer" |
| Actionable | **Yes** — fix the cause, retry | No — rephrase, or it's a false positive |
| UI treatment | Finding card with rule and remedy | Notice, with the tier-opt-in path if relevant (D32) |

Collapsing these would teach makers that our safety findings are arbitrary model
squeamishness. They are the opposite: deterministic, cited, and fixable.

---

## 4. Context accounting — two measures, not one

`buzz-agent/src/types.rs` keeps two size functions and the reason is a real bug
worth inheriting the fix for.

```ts
estimatedBytes(msg)        // true wire size    → request-body truncation
contextPressureBytes(msg)  // token equivalent  → compaction gating
```

**An image is charged a flat 16 KiB of context pressure**, not its base64
length, because providers bill visual tiles (~2K tokens) rather than string
length. Buzz's comment records the failure: a single 3.1 MB image result tripped
their handoff gate on a fresh context — **over-counting by roughly 1500×**.

**We will hit this exactly.** Slice 4 is breadboard photos, and stage ⑬ is
first-article inspection. Both measures land before the first image tool does,
not after — retrofitting means every stored session's accounting is wrong.

The same split applies to two of our own big payloads:

| Content | `estimatedBytes` | `contextPressureBytes` |
|---|---|---|
| Breadboard photo | actual base64 | **16 KiB flat** |
| `project.json` excerpt | actual | actual |
| A rendered SVG passed as text | actual | actual |

Only images get the flat charge. Everything else is text and is billed as text.

---

## 5. Compaction

Server-side compaction (beta `compact-2026-01-12`) handles long sessions — and
sessions here are long by nature: a build is dozens of steps and a debug session
is a binary search.

**The one non-obvious rule: append `response.content` back into `messages`, not
just the text.** Compaction blocks must survive the round trip or the state is
silently lost — and "silently" is the word that matters. Nothing errors; the
agent just quietly forgets the first half of the build.

Compaction is gated on `contextPressureBytes`, never on `estimatedBytes`. That
is the entire point of §4.

**Bench sessions get an extra guarantee.** Whatever else is compacted, the
current build step, the open findings, and the last three measurements stay
verbatim in the tail. A compaction that loses the measurement the maker just
took is a safety bug, not a UX one.

---

## 6. Prompt assembly and caching

The order is chosen for the cache boundary, not for readability:

```
┌─ STABLE (cached) ──────────────────────────────────────┐
│ 1. fable-guide spine            always-on stance (D38)  │
│ 2. active stage persona         one of seventeen (§7)   │
│ 3. part-corpus digest           families and counts     │
├─ cache_control breakpoint ─────────────────────────────┤
│ 4. project state summary        volatile                │
│ 5. open findings                volatile, and load-bearing│
│ 6. conversation                 volatile                │
└────────────────────────────────────────────────────────┘
```

**Never interpolate a timestamp, project id or session id into the stable
prefix.** It invalidates everything downstream and the failure is invisible —
the product works, it just costs several times more. Verify with
`usage.cache_read_input_tokens`; **a persistent zero means a silent
invalidator** and should trip an alert, not a log line.

The part corpus is 1,794 parts and cannot be inlined. Progressive disclosure
(ai-implementation.md §4) means the digest carries families and counts only —
"LED, resistor, ESP32 board, …" — and `parts_search` → `parts_get` fetches the
rest. Personas load the same way: the active stage's persona is in context, the
other sixteen are names.

### Open findings go in the prompt, and stay there

Findings are re-injected every turn from engine state, not carried in the
conversation. An agent that has been arguing for six turns still sees the
BLOCKER exactly as the rule engine states it, uneroded by its own prose. This is
D3 applied to context construction.

---

## 7. Personas

Seventeen stages want different behaviour — a feasibility researcher is not a
build coach. One enormous prompt would serve all of them badly.

**Personas are files**, following buzz's pack model: a pack manifest with
defaults, plus one `*.persona.md` per stage. They live in the project repo
(D34), which means **a maker's tuned persona is versioned, diffable, and travels
with their project.**

```
.makerlord/personas/
├── pack.json                 defaults: effort, tone, tool preferences
├── 02-feasibility.persona.md
├── 06-prototype.persona.md
└── …
```

### The shared spine

All seventeen rest on [`fable-guide`](https://github.com/rakeshgangwar/fable-guide)
(D38) — claims over vibes, ground truth over fluency, provenance labelling,
adversarial self-review, answer-first delivery. It maps onto this architecture
almost line for line, which is why it's the spine rather than prose written from
scratch. The four chapters `superpowers` doesn't already cover — **03** risk
allocation, **05** known vs guessed, **07** communication, **08** false
competence — are where the unique value sits and go into persona prose.

### Effort per stage

Not uniform, and the shape is worth stating: **effort follows how expensive and
how silent a mistake is** — chapter 03's rule, applied to our own inference
budget.

| Effort | Stages | Why |
|---|---|---|
| `xhigh` | ④ architecture, ⑥ prototype, ⑧ debug, ⑨ PCB | Wrong here is expensive *and* silent |
| `high` | ② feasibility, ③ requirements, ⑤ simulate, ⑦ firmware, ⑩ mechanical, ⑪ cost | Default |
| `medium` | ① idea, ⑯ document | Conversational or a projection of settled state |

These are starting points to sweep, not conclusions. `low` and `medium` are
unusually strong on Opus 5 and the assumption that harder is better deserves
measuring.

---

## 8. Web research — the one capability outside the registry

`research_prior_art` needs the network, which is why the tool-surface spec put
it out of scope: the engine stays deterministic and offline-testable.

It lives here, as **server tools** — `web_search_20260209` and
`web_fetch_20260209`.

```
agent researches ──► web_search / web_fetch ──► candidate prior art
                                                      │
                                    feasibility_claim(claim, evidence[])
                                                      │
                                    engine validates the evidence shape
```

**The engine still adjudicates.** `feasibility_claim` accepts the *result* and
checks its evidence (front-door spec §3.5) — a claim with no URL, or with a URL
that wasn't actually fetched this session, is rejected. The fetching is the
agent's; the standard of proof is not.

Fetched page content is untrusted (§9) and carries `sourced` provenance, which
caps it at WARNING. A forum post cannot produce a BLOCKER.

---

## 9. Untrusted text re-entering the prompt

Buzz labels hook output inline: `[Post-compact hook output — untrusted]`. Do the
same, and for more sources than they have:

| Source | Label |
|---|---|
| Fetched web pages | `[web content — untrusted]` |
| External agent output re-read from the repo | `[agent-authored — untrusted]` |
| Maker-supplied datasheet text | `[maker-supplied — unverified]` |
| Compaction summaries | `[compacted — lossy]` |

Same principle as the rule/advisory separation (D4), applied to prompt
construction rather than to findings. A page that says "you can safely bridge
this without a fuse" must not read as ground truth because it happens to be in
the context window.

---

## 10. Two behaviours copied deliberately

**Mid-turn steering.** Buzz folds new user messages in at *round boundaries* as
user turns — the turn continues rather than restarting. That is exactly what
build mode needs when the maker says *"wait, I don't have that resistor"* at
step seven. Restarting the turn would lose the step context; ignoring them until
the turn ends means talking past someone holding a component.

**Bounded objections.** Buzz's stop hook resets its rejection count per prompt,
so "a stubborn exchange can't permanently disable the stop guard." Our analogue:
**the agent cannot argue with a BLOCKER indefinitely.** After three attempts to
re-justify, it stops and surfaces the finding plainly. The counter resets on the
next user message — a maker who provides new information deserves a fresh
hearing; an agent talking itself in circles does not.

---

## 11. Events out

The runtime emits `SessionEvent` (ACP host spec §5) directly from the SDK
stream:

| SDK | `SessionEvent` |
|---|---|
| `text_delta` | `message.delta` |
| `thinking_delta` | `thought.delta` |
| tool call start | `tool.start` |
| tool result | `tool.end` — carrying `ToolResult<T>` **verbatim** |
| `message_stop` | `turn.end` |
| API error, `stop_reason: 'refusal'` | `session.error` |

There is no `permission.ask` on this path. Our tools gate in the engine and
return refusals, which need no human approval — the refusal *is* the answer.

---

## 12. Testing

**A fake LLM as a real HTTP server.** Buzz's `fake_llm.rs` spins a server on an
ephemeral port returning queued canned JSON, then runs the agent as a
**subprocess** over the wire. Configuration is entirely environment variables,
which is what makes the subprocess story clean. Copy all of it.

```
canned responses in ──► maker-agent subprocess ──► assert on project.json
```

**Assert on the artefact, not on the prose.** The circuit model is deterministic
even when the path to it isn't. Structure gets hard assertions; prose gets
sampled evals.

Specific cases that earn their keep:

- **Context accounting** — a 3 MB image charges 16 KiB of pressure and its true
  size on the wire. The regression test for the bug we're inheriting the fix for.
- **Compaction round-trip** — `response.content` appended whole; assert the
  current build step, open findings and last three measurements survive.
- **Cache prefix stability** — assemble a prompt twice in one session with the
  project mutated in between; assert the stable prefix is byte-identical.
- **Bounded objections** — a canned model that re-argues a BLOCKER four times
  stops after three and surfaces it.
- **Classifier refusal** — `stop_reason: 'refusal'` with empty content produces
  a `session.error`, not a crash, and not a finding card.
- **Golden transcripts** — full-session assertions reusing the harness.

**And the cheap layer underneath:** the entire engine is testable with no LLM at
all, which is where the Tier 1 danger corpus already lives. Most safety
behaviour is proven there, not here.

---

## 13. Scope

**In:** `packages/agent` — the loop, model configuration, both context measures,
compaction, prompt assembly and caching, persona loading, the web-research
tools, untrusted labelling, mid-turn steering, bounded objections, event
emission, and the test harness above.

**Out:**

- **Persona prose.** The seventeen files are content, written per stage as the
  stages are built. This spec defines the format and the loading strategy.
- **The ACP host** — its own spec.
- **The tool implementations** — tool-surface spec. This calls them.
- **The UI** — its own spec. It consumes `SessionEvent`.
- **Metering** for server-side compute (D37) — still open.
- **Evals.** Sampled prose evaluation is real work and deserves its own spec
  once there are personas to evaluate.

**One implementation plan's worth of work**, and it is the last piece before the
product can be driven by our own agent end to end.
