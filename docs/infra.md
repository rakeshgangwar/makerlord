# Infrastructure

*Surveyed 2026-07-29 via `hcloud` (context: periscope).*

## The server

| | |
|---|---|
| Host | **superchotu** — Hetzner, 4 cores / 8 GB / 75 GB (ssh alias `superchotu`) |
| IPv4 | `162.55.48.175` |
| Chosen because | Idle (load 0.18, nothing deployed) — MakerLord gets the machine to itself, rather than sharing periscope-staging with Periscope workloads. 35 GB free holds the server + corpus now and the Phase-2 toolchains later. |
| Also surveyed | periscope-staging (cx53, shared with Periscope, disk 80%), periscope-agent (key rejected), openclaw-vps/molt-bot (running uptime-kuma/sqld/searxng). This project's hcloud context covers only `periscope`; superchotu lives in another Hetzner project — manage it over SSH, or add its API token as a second hcloud context. |

## Domain

**makerlord.dev** is purchased. DNS is not yet pointed — **action (Rakesh):**
create an `A` record `makerlord.dev → 162.55.48.175` (and `www` if wanted) at
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
