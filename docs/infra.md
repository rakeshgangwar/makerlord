# Infrastructure

*Surveyed 2026-07-29 via `hcloud` (context: periscope).*

## The server

| | |
|---|---|
| Host | **infra** — Hetzner, 4 cores / 8 GB / 75 GB (ssh alias `infra`) |
| IPv4 | `178.105.68.68` |
| Chosen because | Essentially fresh: load 0.08, 8.2 GB used of 75 (64 GB free), nothing deployed. MakerLord gets the machine to itself with room for the Phase-2 toolchains. Node 18 is preinstalled — the deploy installs Node 22 (fnm/NodeSource); don't reuse the system node. |
| Also surveyed | superchotu (idle, 35 GB free — the runner-up), periscope-staging (shared with Periscope, disk 80%), periscope-agent (key rejected), openclaw-vps/molt-bot (running uptime-kuma/sqld/searxng). The hcloud CLI here covers only the `periscope` project; infra is managed over SSH, or add its project's API token as a second hcloud context. |

## Domain

**makerlord.dev** is purchased. DNS is not yet pointed — **action (Rakesh):**
create an `A` record `makerlord.dev → 178.105.68.68` (and `www` if wanted) at
the registrar. `.dev` is on the HSTS preload list, so the server must terminate
TLS from day one — use Caddy (automatic Let's Encrypt) when deploying.

## Secrets

`.env` at the repo root (gitignored) carries `ANTHROPIC_API_KEY`;
`.env.example` is the tracked template. The server gets its own copy under
`/opt/makerlord/.env`, never committed, never in the image.

## Deploy sketch (the go-live cluster's plan will finalise)

```
/opt/makerlord/          git clone (read-only deploy key or https)
  .env                   ANTHROPIC_API_KEY=…
systemd: makerlord.service → node server (SSE endpoint + hosted agent)
caddy: makerlord.dev → localhost:<port>   (TLS automatic)
```

## Agent backends — where the brain runs, and who pays

The engine and gates are identical everywhere (cross-brain assertion); what
varies is where the LLM process runs and which credential it uses.

| Path | Brain runs | Credential lives | UI | State |
|---|---|---|---|---|
| **sdk** (default) | infra, our agent loop | `ANTHROPIC_API_KEY` in `/opt/makerlord/.env` | makerlord.dev | live |
| **acp on server** | infra, spawned `claude-code-acp` | Claude Code login **on infra** (`claude` → `/login`, or `claude setup-token` for headless) | makerlord.dev | built, awaiting login |
| **local Claude Code** | your laptop | your existing local login — nothing on the server | Claude Code itself | works today |
| **local bridge + web UI** | your laptop via `maker-bridge` | local | makerlord.dev connects to localhost WS | **live** — see below |

Why the server needs its own login for the hosted ACP path: the web app's
agent spawns **next to the projects** on infra, and Claude Code reads its
subscription credential from the machine the process runs on. Any path where
makerlord.dev does the driving needs *some* credential server-side — the
choice is only API key vs subscription token.

**Local Claude Code recipe** (no server credential at all): the repo itself
carries the corpus and data, so from a checkout —

```bash
cd ~/Projects/makerlord
mkdir -p projects/my-lamp && node packages/cli/dist/main.js project-init \
  --intent "a desk lamp" --cwd projects/my-lamp   # or: maker project-init
claude mcp add makerlord \
  -e MAKERLORD_PROJECT=$PWD/projects/my-lamp/project.json \
  -- node $PWD/packages/mcp/dist/main.js
claude   # all 37 tools available; gates enforced by the engine, not the agent
```

The project is a real git repo (D34) — push it anywhere, including onto the
server, and the web UI will render it.

**Local bridge recipe** (the best-of-both path — web UI, local brain):

```bash
cd ~/Projects/makerlord
set -a && . ./.env && set +a     # needs MAKERLORD_ACCESS_TOKEN
./install.sh   # once: puts maker-bridge + the `mlb` alias on PATH, stores the token
mlb            # auto-detects your agent; prints the pairing code
# mlb --help lists detected agents · mlb --agent gemini|goose|kimi|… picks one
# Claude Code / Codex CLIs work adapter-free: the bridge fetches their ACP
# adapter via npx on first run. Custom agents: ~/.makerlord/agents.json
```

Then in makerlord.dev: **⚡ local brain** (bottom of the rail) → enter the
code once. The dot goes green; every prompt now runs on YOUR Claude Code,
while every tool call executes on the hosted engine — project state, gates,
artifacts and git commits stay server-side. Restarting the bridge burns the
pairing; the app re-asks for a fresh code automatically. The bridge flushes each turn into the hosted transcript, so reloads
replay one continuous history whichever brain drove, and the app quietly
re-attaches to a running bridge on load. A fresh bridge session is fed a
digest of that transcript on its first prompt (per-turn prose capped so one
long monologue can't evict the rest; oldest turns dropped beyond ~24k chars,
and the digest says how many). Known gap: mid-turn steering is hosted-only.
