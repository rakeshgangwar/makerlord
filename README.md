# MakerLord

**An AI assistant for the maker's journey — idea → simulate → prototype → product — with a safety engine the AI cannot override.**

Live at [makerlord.dev](https://makerlord.dev) (invite-only).

Most AI assistants will happily tell you to wire an LED straight to 5 V. MakerLord's engine won't let anyone — human or model — power a circuit that would burn out a part, brick an MCU, or worse. The LLM proposes and explains; **deterministic rules adjudicate**, and gates like "open the power gate" or "generate firmware" are enforced by the engine, not by prompt discipline. There is no `dismiss_finding` tool. You cannot call what was never defined.

## What it does

Seventeen stages of the maker's journey in four acts; the first two are built:

- **Design** — describe what you want to make; feasibility research with cited evidence; requirements with units, not vibes; block architecture with power budgets.
- **Prove** — simulate on a virtual bench (ngspice); build the real breadboard through safety-ordered steps (power off first, power wires last, continuity check before energising); firmware derived from the wiring (pins are never hand-named); guided debug that proposes one measurement at a time until the fault has nowhere left to hide.
- **Industrialize / Ship** — PCB through production; future releases.

Every artefact — schematic, breadboard view, netlist, firmware — is a projection of one structured circuit model. Your project is a real git repo that travels with you.

## Three ways to drive it, one engine

| Door | What it is | Who pays |
|---|---|---|
| **Bring your own key** | Configure any provider in settings — OpenAI, Google, Mistral, Groq, OpenRouter, DeepSeek, xAI, local Ollama, any OpenAI-compatible endpoint, or Anthropic | Your API key |
| **Local brain** | Run the agent you already have — Claude Code, Codex, Gemini CLI, Goose, Qwen Code, Kimi CLI, or any stdio [ACP](https://agentclientprotocol.com) agent — on your own machine via `maker-bridge` | Your subscription |
| **MCP** | `maker-mcp` exposes the whole tool surface to any MCP client | Whatever drives it |

All three run the same 50-tool registry against the same engine. The gates hold whichever brain drives — that's the design, not a promise.

### Connect your own agent

```sh
curl -fsSL https://makerlord.dev/install.sh | bash -s -- --token <your mlt_… token>
mlb   # prints a 6-digit pairing code
```

The token is minted in Settings on the web app; the installer fetches a
prebuilt bridge bundle (node ≥ 20 is the only requirement). From a repo
checkout, `./install.sh` builds the bundle locally instead.

Then click **⚡ local brain** in the web app and enter the code. Full instructions live on the Settings page.

## Self-hosting

TypeScript strict, Node 22+, pnpm 11 monorepo. Sixteen packages under `packages/`: the safety engine (`circuit`, `sim`, `firmware`, `debug`), the parts library (`parts` — geometry imported from the Fritzing corpus, electrical limits hand-authored, parts are never invented), the shared tool registry (`tools`) with thin `cli` / `mcp` / server adapters, the ACP `bridge`, the agent loop (`agent`), auth (invites + passkeys, no passwords anywhere), and the SvelteKit `ui`.

```sh
pnpm install
git clone --depth 1 https://github.com/rakeshgangwar/fritzing-parts vendor/fritzing-parts
pnpm test          # Vitest across all packages
pnpm typecheck
```

Deployment scripts live in `deploy/`; design specs, plans, and the decision log (D1–D54, with rejected alternatives recorded) in `docs/` — start at `docs/README.md`.

Two test suites are release-blocking and never weakened: the circuit danger corpus and the firmware danger corpus. A failure there is not a flaky test — it is a maker's destroyed board.

## License

[MIT](LICENSE)
