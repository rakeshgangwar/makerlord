# The live-API residues — web research on, compaction beta proven

**Why:** two ⚠️ rows in `deferred-work.md` §A are verifications, not builds:
web research (config landed, off by default) and the server-side compaction
beta (pass-through landed, local gating still active). Both were deferred
because asserting them against fakes would produce untested claims.

**The spec line that matters (agent runtime §8):** "a claim with no URL, or
with a URL that wasn't actually fetched this session, is rejected. The
fetching is the agent's; the standard of proof is not." The tool layer is
offline-deterministic and cannot know what was fetched — so the session-level
adjudication lives in the loop, where the server-tool results pass through.

## Tasks

- [x] **Fetched-URL ledger in the loop.** The agent session tracks every URL
      that came back in a `web_search_tool_result` / `web_fetch_tool_result`
      block this session, with a fetchedAt timestamp. TDD on fake-llm.
- [x] **Sourced claims are adjudicated against the ledger.** A
      `feasibility_claim` with grade `sourced` whose `evidence.url` was never
      fetched this session is REFUSED at the loop boundary (the engine's
      structural check still runs after). A fetched URL with no `fetchedAt`
      gets it injected from the ledger — the loop knows when; the model
      guesses. TDD on fake-llm.
- [x] **web_fetch joins the server tools** (bounded `max_uses`), with
      whatever beta header the live API wants; the exact type strings are
      pinned by the live verification, not guessed.
- [x] **Hosted enablement.** `MAKERLORD_WEB_RESEARCH=1` →
      `webResearch: true` on the hosted agent (server main → sessions →
      sdkAgent).
- [x] **Live verification script** `scripts/verify-live-api.mjs`: reads
      `ANTHROPIC_API_KEY` from env (never printed), makes one minimal call
      per capability — (a) the web tool type strings the API accepts,
      (b) the compaction beta header + a compacted-tail round trip. Prints
      accepted/rejected per item. Run on infra where the key lives; pin the
      verified type strings in `loop.ts` afterwards.
- [x] **Compaction: the protected-tail eval.** With the beta verified live,
      the eval asserts measurements + open findings survive a real
      server-side compaction. Flip `compactionBeta` default only if it
      passes; otherwise record why and keep local gating.
- [x] **Ledger.** Update both §A rows with what was verified (or what the
      live API refused, verbatim).
