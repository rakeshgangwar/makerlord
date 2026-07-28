# AI Implementation

How the agent actually works: which brain, what it can call, how context is
managed, and how any of it gets tested.

Read [decisions.md](decisions.md) D3, D4, D23, D36 first — this document is the
implementation of those.

---

## 1. Two protocols, two jobs

The separation is what makes agent choice possible at all:

```
MakerLord desktop app
  ├── chat UI, canvas, build mode
  └── spawns an ACP agent process ─────┐   ← ACP: which brain
        maker-agent (ours, the default)   │
        claude-agent-acp               │
        codex-acp                      │
        gemini-cli                     │
                                       ▼   ← MCP: what it can do
                          maker-mcp — the circuit engine
                    parts · rules · netlist · DC solver · build steps
```

- **ACP** ([Agent Client Protocol](https://agentclientprotocol.com/)) is the
  app↔agent boundary. Open standard, JetBrains and Zed collaborating, published
  adapters for Claude Code and Codex.
- **MCP** is the agent↔engine boundary.

**Our own agent gets no privilege.** In `block/buzz`'s harness, `buzz-agent`
sits in the same match arm as `codex` and `claude-code-acp` — any ACP binary is
interchangeable. Copy that posture.

### Hosted default, BYO agent opt-in

Our tuned agent is the default, so a fourteen-year-old needs no subscription and
no install. Makers who already have Claude Code, Codex or Gemini can point
MakerLord at their own — using their subscription, not our inference budget.

That's the honest trade: our agent gives a better-tuned experience because the
stage personas are ours; an external agent gives power and control.

---

## 2. The engine is a CLI and an MCP server, from day one

A `maker` JSON-in/JSON-out CLI plus an MCP wrapper over the same surface. This is
`buzz-cli`'s pattern, and it buys three things at once:

1. Our agent calls it
2. External agents call it
3. **It is testable with no LLM in the loop at all**

It's also D23's principle turned inward: we prefer CLI and file formats when
driving other people's tools, so we should expose ourselves the same way.

### The tool surface

**Read — safe, advisory:**

```
search_parts(query)          → curated library hits (cannot invent parts)
get_part(id)                 → definition + safety profile (on demand — §4)
get_project()                → current model state
check_circuit()              → Finding[]
predict_dc()                 → expected measurements for the gate
get_build_step(n)            → one step
```

**Mutate — validated at the boundary:**

```
add_part(defId, ref)
connect(pinA, pinB)
place_part(ref, hole, orientation)
route_wire(holeA, holeB, color)
set_requirement(key, value, unit)
```

Every mutation validates: the pin must exist on that part definition, the hole
must exist on that board, the part must exist in the library. A hallucinated pin
name is a retriable tool error, not a wrong drawing.

**Gated — self-enforcing:**

```
advance_to_step(n)      → ERROR while any BLOCKER is unresolved
open_power_gate()       → ERROR unless measurements recorded and no BLOCKER
record_measurement(...)
generate_firmware()     → ERROR if the circuit has BLOCKERs
order_fabrication()     → gated, obviously
```

### The rule that makes external agents safe

Our whole thesis is that deterministic rules adjudicate. If an external agent
drives, what stops it ignoring a `BLOCKER`? It calls `check_circuit()`, gets
findings, and could still tell the maker "looks fine."

> **The gate is enforced by the engine, not by the agent.**

```
❌  check_circuit() → findings, agent decides what to do
✅  advance_to_step(8) → ERROR: refused, 1 BLOCKER unresolved
```

**No state-changing tool may be advisory about safety.** The agent physically
cannot advance the build past a live blocker, regardless of which model it is or
what it believes. Not a prompt instruction — a refused call.

### The strongest guarantee is a tool that doesn't exist

There is **no `dismiss_finding`, no `override_blocker`, no `set_severity`.**
The safety property is enforced by absence: you cannot call what was never
defined. Same move as D3's `Finding` having no suppression field, one layer out.

---

## 3. Context management — steal buzz's two-measure accounting

`buzz-agent/src/types.rs` keeps **two different size functions**, and the reason
is a real bug worth inheriting the fix for:

```
estimated_bytes()        // true wire size  → request-body truncation
context_pressure_bytes() // token equivalent → compaction/handoff gating
```

An image is charged a flat **16 KiB** for context pressure rather than its
base64 length, because providers bill *visual tiles* (~2K tokens), not string
length. Their comment records the failure: a single 3.1 MB `view_image` result
tripped the handoff gate on a fresh context — **over-counting by ~1500×**.

**We will hit this exactly.** Slice 4 is breadboard photos. Implement both
measures before the first image tool lands, not after.

### Compaction

Server-side compaction (beta `compact-2026-01-12`) handles long sessions. The
one non-obvious rule: **append `response.content` back into messages, not just
the text** — compaction blocks must be preserved or the state is silently lost.

---

## 4. Progressive disclosure — the answer to a 1,794-part library

The corpus cannot be inlined. Buzz solves the same shape for skills: the system
prompt carries **names and descriptions only**, and a builtin `load_skill` tool
fetches the body on demand, with supporting files pre-enumerated at discovery so
there are no arbitrary filesystem lookups at call time.

Ours is `search_parts` → `get_part`:

```
system prompt   families and counts only  ("LED, resistor, ESP32 board, …")
search_parts    matching part ids + one-line descriptions
get_part(id)    full definition + safety profile, loaded on demand
```

Same principle applies to stage personas (§6) and to safety-rule explanations.

---

## 5. The model

**Default `claude-opus-5`** with adaptive thinking. Concrete settings:

| Setting | Value | Why |
|---|---|---|
| `thinking` | `{type: "adaptive"}` | On by default on Opus 5; set explicitly for clarity |
| `output_config.effort` | `high` baseline, `xhigh` for design/agentic stages | Sweep per stage — `low`/`medium` are unusually strong here |
| `max_tokens` | ≥ 64000 at `xhigh` | Thinking + response share the cap |
| `fallbacks` | `"default"` + beta `server-side-fallback-2026-07-01` | Safety classifiers can decline; route by category |
| Prompt caching | `cache_control` on the last stable system block | 512-token minimum on Opus 5 |

**Handle `stop_reason: "refusal"` before reading `content`.** Classifiers return
HTTP 200 with an empty or partial `content` — code that indexes `content[0]`
breaks. This matters more for us than most: a maker asking about mains wiring or
high-current systems is exactly the adjacent-to-sensitive shape that can trip a
classifier, and our own refusal rules must not be confused with the model's.

**Caching strategy:** the part library digest and stage persona are the stable
prefix; the project model and conversation are volatile and go after the last
breakpoint. Never interpolate a timestamp or project id into the system prompt —
that invalidates everything downstream. Verify with
`usage.cache_read_input_tokens`; a persistent zero means a silent invalidator.

---

## 6. Stage personas as versioned files

Seventeen stages want different agent behaviour — a feasibility researcher is
not a build coach. Rather than one enormous prompt, personas are **files**,
following buzz's pack model (`.plugin/plugin.json` + `*.persona.md`, with
pack-level defaults overridden per persona).

Ours live in the project repo (D34), which means **a maker's tuned persona is
versioned, diffable, and travels with their project.**

Loaded by progressive disclosure like everything else: the active stage's
persona is in context, the others are names.

### The shared spine: fable-guide

All seventeen personas rest on one epistemic spine —
[`rakeshgangwar/fable-guide`](https://github.com/rakeshgangwar/fable-guide),
an operator's guide on claims-over-vibes, ground truth over fluency, provenance
labelling, adversarial self-review, and answer-first delivery.

**It maps onto this architecture almost line for line**, which is why it's the
right spine rather than a prompt written from scratch:

| fable-guide | MakerLord |
|---|---|
| "Claims, not vibes" | `Finding` with a `ruleId`, not prose |
| "Ground truth outranks you" | Rules adjudicate; the LLM explains (D3) |
| "Track verified vs guessed" | `RuleFinding` vs `AgentAdvisory` (D4) |
| "The check is cheaper than the correction" | The measurement gate (D15) |
| "Attack your conclusion" | The Tier-1 danger corpus |
| "Answer first, then risk" | Refusals lead with capability (spec §8.11) |

Chapter 00's core move — *route your claims through ground truth and away from
your own sense of plausibility* — is D2 and D3 stated as epistemics instead of
architecture.

**Which chapters carry which persona:**

| Chapter | Personas that lean on it |
|---|---|
| 03 risk allocation | All — "spend where being wrong is expensive *and silent*" is the safety thesis |
| 05 known vs guessed | ② feasibility, ⑪ cost modelling — both traffic in estimates |
| 06 attack your conclusion | ⑧ debug (rival hypotheses), ⑭ test |
| 07 communication | All — answer-first, and the §8.11 refusal pattern |
| 08 false competence | All — the anti-patterns are cross-cutting |

**Deliberately not packaged as Claude Code skills.** Skills are task-triggered;
this is always-on stance, and `superpowers` already covers the overlapping
chapters (04/09 ≈ `verification-before-completion`, 06 ≈ the code-review pair,
01 ≈ `brainstorming`). Two overlapping sets competing for the same trigger
moments is worse than either alone. The uncovered chapters — **03, 05, 07,
08** — are where the unique value sits, and they belong in persona prose.

---

## 7. Two behaviours worth copying verbatim

**Mid-turn steering.** Buzz folds new user messages in at *round boundaries* as
user turns — the turn continues rather than restarting. That is exactly what
build mode needs when the maker says "wait, I don't have that resistor" at step
seven.

**Bounded objections.** Their `_Stop` hook's rejection count resets per prompt,
so "a stubborn exchange can't permanently disable the stop guard." Our analogue:
**the agent cannot argue with a `BLOCKER` indefinitely.** After N attempts to
re-justify, it stops and surfaces the finding.

**And treat LLM-derived text as untrusted when it re-enters a prompt.** Buzz
labels hook output inline: `[Post-compact hook output — untrusted]`. Same
principle as our rule/advisory separation, applied to prompt construction.

---

## 8. Testing an LLM product

Spec §12 Tier 3 says *assert on the artefact the agent produced, not on what it
said.* Buzz's harness is how that's actually done:

- **`fake_llm.rs`** spins a **real HTTP server** on an ephemeral port returning
  queued canned JSON, then runs the agent as a **subprocess** driven over the
  wire protocol.
- **`golden_transcripts.rs`** reuses the harness and asserts on full transcripts.
- Configuration is **entirely environment variables**, which is what makes the
  subprocess story clean.

Our version:

```
canned LLM responses in  →  agent subprocess  →  assert on project.json
```

The circuit model is deterministic even when the path to it isn't. Prose gets
sampled evals; **structure gets hard assertions.**

The CLI gives us a second, cheaper layer: the entire engine is testable with no
LLM at all — which is where the Tier 1 danger corpus already lives.

---

## 9. What we deliberately don't take from buzz

Their pool, queue, and relay machinery exists because agents are chat
participants across many rooms with cryptographic identities. We have one
project and one maker. Nostr identity is overkill.

Their ACP bridge matters only if we want external agent frameworks driving us —
and the MCP server gives us that more cheaply.

---

## 10. Open items

| Item | Status |
|---|---|
| `maker` CLI command surface | ✅ [tool-surface spec](superpowers/specs/2026-07-29-tool-surface-design.md) — 32 tools in 9 groups |
| MCP server tool schemas | ✅ Same spec — one zod schema, four consumers |
| Stage persona format | ✅ [agent-runtime spec](superpowers/specs/2026-07-29-agent-runtime-design.md) §7 — buzz's pack model, in the project repo |
| Compaction vs context editing for long builds | ✅ Server-side compaction, gated on context pressure — agent-runtime §5 |
| Which brain, and how it is spawned | ✅ [ACP host spec](superpowers/specs/2026-07-29-acp-host-design.md) — `maker-bridge`, per-session scoped MCP |
| Metering model for server-side compute (D37) | **Open** — see Flux ACUs in [references.md](references.md) |
| Sampled prose evals for personas | **Open** — needs personas to evaluate first |
| Whether the tool runner permits mid-turn steering | **Open** — verify before laying out `packages/agent` (agent-runtime §2) |

**Sections 1–9 above are the summary; the three agent-layer specs are the
detail.** Where they disagree, the specs win — they were written later and with
the decisions in hand.

One correction worth naming: §1's diagram says "MakerLord desktop app." D39 made
the product web-first, and the ACP host moved into `maker-bridge` for the reason
that diagram implies but doesn't state — a browser cannot spawn a process.
