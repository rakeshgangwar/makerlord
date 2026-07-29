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
