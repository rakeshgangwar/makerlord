# MakerLord — Design Spec: Auth (invites + passkeys)

*2026-07-30 · design spec, pre-implementation. Introduces D52–D54.
Replaces the go-live perimeter posture (nginx basic auth + one static
bearer token) with identity.*

---

## 1. What this is, and what it is not

Until now the deployment had exactly one user by construction: a shared
basic-auth password at nginx, one API token behind it, every project
belonging to "the" maker. This spec gives the product **users** — so a
second maker can exist, so projects have owners, and so the open
metering question (D37's cost model) has a *who* to meter.

It is **not** an account system in the SaaS sense: no emails, no
passwords, no reset flows, no profile pages. Identity is a **passkey**
(WebAuthn — the phone/laptop authenticator the maker already has), and
admission is an **invite code** a human minted. It is deliberately not
open registration: the instance fronts a real API key and real compute.

## 2. The three decisions

- **D52 — admission is human-minted, identity is a passkey.** `maker
  invite new` (maintainer CLI only — the D51 pattern: no agent surface,
  no web surface can mint admission) produces a single-use, expiring
  code. Registration is `/join` + code + handle + WebAuthn `create()`;
  login is WebAuthn `get()`. No passwords exist anywhere in the system.
  Rejected: GitHub OAuth (a third party in the trust chain and an app
  registration to manage); email+password (password storage plus reset
  infrastructure for a capability passkeys give for free).
- **D53 — the UI server is the sole authenticator.** The SvelteKit
  server owns the WebAuthn ceremonies and the session cookie
  (httpOnly, Secure, SameSite=Lax, 30-day sliding, server-side session
  store). The node API never sees a cookie: it accepts either the
  internal service token **plus** an `x-makerlord-user` header the UI
  server stamps after authenticating the cookie, or a **per-user API
  token** presented directly (the bridge's path). Two credentials, one
  resolution: every API request maps to a user id or dies 401.
  Rejected: sessions in the API (two session systems) and trusting the
  user header alone (spoofable without the service token).
- **D54 — projects are per-user; the library is a commons.** The
  storage layout becomes `projects/<userId>/<projectId>` and every
  project route requires ownership. The curated library, the proposals
  queue and the datasheet store stay **global**: curation is communal
  by design (§7 of the curation spec), and a part verified once is
  verified for everyone. Bridge pairing, transcripts, artifacts — all
  inherit the project's owner.

## 3. The stores

Server-state (never in the repo, deploy-excluded like projects):

```
users/users.json          id, handle, createdAt, invite used
users/credentials.json    per-user passkey credentials
                          (credentialId, COSE public key, signCount, transports)
users/sessions.json       sessionId → {userId, expiresAt}  (sliding)
users/tokens.json         sha256(token) → {userId, label, createdAt}
users/invites.json        code → {createdAt, expiresAt, usedBy?}
```

Flat files, atomic-rename writes — the same durability posture as
`project.json`, and honest about scale: this is tens of users, not
millions.

## 4. The flows

- **Invite:** maintainer runs `maker invite new [--note "for X"]` on
  the server checkout → prints a code (12 chars, 7-day expiry,
  single-use).
- **Join:** `/join` → code + handle → server validates, issues WebAuthn
  registration options → authenticator creates the passkey → server
  verifies attestation, stores the credential, burns the invite, sets
  the session cookie.
- **Login:** `/login` → WebAuthn get() (usernameless, discoverable
  credential) → verify assertion + signCount → cookie.
- **Bridge token:** minted from the UI (settings strip) or `maker
  token new --user <handle>`; shown once; stored hashed. `install.sh`
  keeps writing it to `bridge.json`.
- **Logout:** clears the cookie and the server-side session.

## 5. What changes at the perimeter

nginx basic auth **retires** once this lands — it blocks the very
users invites admit. TLS stays; the UI is the front door;
unauthenticated visits to any page redirect to `/login` (with `/join`
reachable by invite link). The static `MAKERLORD_ACCESS_TOKEN`
demotes to the **internal service secret** between UI server and API —
never a user credential again.

## 6. Migration

The pre-auth projects belong to the first registered user: `maker
users adopt <handle>` moves root-level legacy projects into
`projects/<userId>/` (one-time, maintainer CLI). The bicycle project
is the only survivor of the 2026-07-30 clear and adopts this way.

## 7. Scope

**In:** the stores, invite CLI, join/login ceremonies (SimpleWebAuthn),
cookie sessions, API user resolution (header + user tokens), per-user
project scoping on every project route, ownership checks, bridge
per-user tokens, migration command, UI gating (login/join pages, a
signed-in strip with logout + token mint), nginx config update, tests.

**Out (named):** roles/admin tiers (one tier: maker); metering itself
(D37 — this only makes it possible); account deletion/export flows
(files make it a maintainer `mv`); multi-passkey management UI (add-
only in slice 1); OAuth of any kind.

## 8. Testing

- Ceremony round-trip against SimpleWebAuthn's test vectors; invite
  single-use + expiry; session expiry + sliding renewal.
- **The ownership property:** user A cannot list, read, prompt, or
  tool-call user B's project — every project route 404s across the
  boundary (404, not 403: existence is private too).
- Token resolution: user token → scoped; service token without user
  header → 401 on project routes; spoofed user header without service
  token → 401.
- e2e: join with an invite (virtual authenticator), create a project,
  see only your own; the §14 sweep unchanged behind login.
