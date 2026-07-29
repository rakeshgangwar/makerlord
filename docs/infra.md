# Infrastructure

*Surveyed 2026-07-29 via `hcloud` (context: periscope).*

## The server

| | |
|---|---|
| Host | **periscope-staging** — Hetzner cx53, 16 cores / 32 GB / 320 GB, nbg1 |
| IPv4 | `78.46.248.1` |
| Chosen because | SSH-reachable from the dev box (periscope-agent rejects our key), light load (< 1 of 16 cores), 21 GB RAM available. Shared with Periscope staging workloads — MakerLord runs alongside, isolated under its own user/service. |
| Watch | Disk is at 80% (58 GB free). Fine for the Node server + corpus (~400 MB); revisit before the Phase-2 toolchains (arduino-cli ~3 GB) land. |

## Domain

**makerlord.dev** is purchased. DNS is not yet pointed — **action (Rakesh):**
create an `A` record `makerlord.dev → 78.46.248.1` (and `www` if wanted) at the
registrar. `.dev` is on the HSTS preload list, so the server must terminate
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
