# Playwright e2e — the browser-level safety sweep

**Why:** the danger corpus proves the *engine* can't be talked out of a
BLOCKER; nothing yet proves the *presentation* layer can't lose one. UI spec
§14 names the assertions: a BLOCKER visible in every posture and at every
breakpoint, no control anywhere that dismisses a finding, provenance matching
the severity ceiling, agent prose unable to remove a card. Those are safety
tests, not UI polish — they get the same no-LLM determinism as everything
else.

**Approach:** Playwright drives the real stack — `makerlord-server` (dummy
API key; no agent turn is ever prompted) + the built SvelteKit app with its
`/app-api` proxy — against projects seeded through the **real tool registry**
(tool-surface spec §7 golden script), so the browser assertions sit on top of
the same deterministic engine the rest of the suite trusts. No mocks of our
own code anywhere.

**Depends on:** the live shell (done), CI (done).

## Tasks

- [x] **Harness.** `packages/ui/e2e/`: `@playwright/test` dev-dep,
      `playwright.config.ts` (chromium; `webServer` boots the API server on a
      scratch `MAKERLORD_PROJECTS_ROOT` + `vite preview` with
      `MAKERLORD_API_URL` pointed at it). Global setup seeds two fixture
      projects through the registry, no LLM:
      - **golden** — the §7 script: `project_init → req_propose →
        req_confirm → block_add → block_link → check_architecture → expand →
        check_circuit`, clean
      - **danger** — a circuit carrying a live `BLOCKER` (LED with no
        series resistor — the corpus's own first entry)
      One smoke spec proving both boot paths: front door lists the two
      projects, opening golden renders the stage rail.
- [x] **Golden path in the browser.** Walk golden through the lenses:
      requirements table shows the confirmed reqs, architecture view renders
      the blocks, files panel shows the projected tree, schematic renders
      with ladder layout (`data-layout` attribute present).
- [x] **§14 finding-surface sweep** (the point of the plan), on danger:
      - BLOCKER card visible at 1440×900, 1024×768 and 390×844, on every
        stage lens that surfaces findings
      - **no dismiss control**: every button/link/input in the whole DOM has
        an accessible name; none matches
        `/dismiss|hide|ignore|suppress|override|snooze|mute|silence/i`
      - provenance: rule findings carry the verified badge; agent
        `ADVISORY` never renders with BLOCKER severity styling
      - prose can't clear a card: with agent prose in the transcript claiming
        the finding is fixed, the card count is unchanged
      - the gate refuses in the browser: advancing past the power gate with
        the BLOCKER live surfaces the refusal, not a success state
- [x] **Bridge-absent states.** No bridge running: ⚡ local brain shows the
      error path with the how-to-set-up help and the port field; nothing
      renders as connected.
- [x] **CI.** An `e2e` job after `test`: cache the Playwright browser
      download, run the suite headless, upload traces + screenshots only on
      failure.
- [x] **Ledger.** `deferred-work.md`: Playwright row ✅; bridge-packaging row
      updated (bundle + install.sh landed 2026-07-29 — only SEA/signing/
      update-channel remain deferred).
