# MakerLord — Design Spec: The Curation Pipeline

*2026-07-30 · design spec, pre-implementation. Introduces D50–D51.
Answers the ledger's named schedule risk: how the library grows from 22
verified parts toward unlimited without the safety promise degrading to
vibes.*

---

## 1. What this is, and what it is not

Today a part is either curated or invisible, and curation is ~30–60
hand-authored minutes. That never reaches 150 parts, let alone the
corpus's ~1,800. This spec replaces the binary with **provenance tiers**
and replaces hand-drafting with a **propose → verify → promote
pipeline** where the agent does the drudgery and a human does the one
thing only a human may do: promotion to verified.

It is **not** automated curation. The fields BLOCKERs stand on —
`hazardClass`, strap pins, `managesLipo`, anything mains-adjacent —
are human-verified forever. The ceiling on automation is the safety
floor. And it is not a parts wiki: every electrical claim carries a
datasheet citation or it does not enter the queue at all.

## 2. The three tiers (D50)

D43 said a simulation's provenance bounds its findings. The same idea,
applied to the library itself:

| Tier | Source | May do |
|---|---|---|
| **verified** | hand-authored profile in `data/profiles/`, datasheet-cited, human-promoted | everything — BLOCKER-capable rules, gate-eligible |
| **sourced** | agent-drafted proposal in `data/proposals/`, per-field citations, machine-checked, awaiting promotion | design, check, simulate — but **the gates refuse** (§5) |
| **geometry** | raw corpus `.fzp`, no profile | browse and identify only — visible in search, marked, not addable to a circuit |

Tier is a property of the part's *profile state*, not a field anyone
sets: a file in `data/profiles/` is verified, a file in
`data/proposals/` is sourced, a bare corpus part is geometry. No tool
can change a part's tier by writing a flag — the tier IS the location,
and only promotion (§4) moves the file.

**Sourced findings are not softened.** A sourced profile's numbers are
cited, not invented, and a false BLOCKER at design time costs a
double-check, not a board. What sourced data must never do is authorize
*physical* action — which is exactly what the gates own. One honest
NOTE (`PART_PROFILE_SOURCED`) rides every check on a circuit containing
sourced parts, naming them and what promotion requires.

## 3. The proposals queue

`data/proposals/<partId>.yaml` — the profile schema plus the paper
trail:

```yaml
partId: SomeSensor-Module
proposedAt: 2026-07-30T18:12:00Z
citations:                      # per ELECTRICAL field — no citation, no field
  absMaxVoltageV: https://cdn.example.com/datasheets/somesensor.pdf
  quiescentMa: https://cdn.example.com/datasheets/somesensor.pdf
profile:
  partId: SomeSensor-Module
  footprint: { pins: { VCC: [0, 0], GND: [0, 1], OUT: [0, 2] } }
  absMaxVoltageV: 3.6
  quiescentMa: 1.5
  hazardClass: none             # agent MAY draft it; promotion re-checks it
```

Validated on write and on load: profile schema, footprint pins against
the corpus part's real connectors, a citation for every electrical
field, URL-shaped citations. A proposal for a partId that already has a
verified profile is refused — proposals never shadow the truth.

### 3.5 Uploaded datasheets — the second evidence channel

Web research cannot reach the seller PDF that ships with an AliExpress
module — and that is disproportionately the hobby bench. Uploads close
the gap: a PDF lands content-hashed and immutable in
`data/datasheets/<sha256>.pdf`, citable as `upload:sha256:<hash>`
beside URLs. The agent reads it through `datasheet_read`, whose output
is framed `[maker-supplied — unverified]` (agent-runtime spec §9) — the
maker may have uploaded the datasheet of a lookalike, and the label
keeps that doubt visible all the way to promotion, where the reviewing
human opens the exact same stored file. The ledger discipline is
symmetric: a URL citation must have been fetched this session; an
upload citation must have been READ this session. Text-layer PDFs only;
a scan gets an honest error, never silent garbage.

**Every geometry part carries the provision in the UI**: "ask the agent
to research it" (web) and "upload its datasheet" (file) — both roads
lead to `profile_propose` and the sourced tier. Neither road, nor any
other, leads to verified except a human's `maker curate promote`.

## 4. The pipeline

```
agent (web research) ──► profile_propose ──► data/proposals/   [sourced]
                              │                    │
                    mechanical checks         human review
                    (schema, footprint,      `maker curate` CLI
                     citations, archetype     reads citations,
                     plausibility)            checks datasheets
                              │                    │
                              └────────► PROMOTION: file moves to
                                         data/profiles/  [verified]
```

- **The agent drafts.** With web research live and the fetched-URL
  ledger enforcing that citations were actually read, `profile_propose`
  is the D13 pattern generalized: *search proposes, an arbiter
  disposes.* Here there are two arbiters — the machine for shape, the
  human for truth.
- **Mechanical checks make review cheap.** Footprint-vs-connector
  validation (exists), citation presence, and family-archetype
  plausibility (an LED's Vf between 1.2 and 4 V, a resistor needing
  only three fields) — so human attention lands only where it is
  irreplaceable.
- **Promotion is a human act, structurally (D51).** `maker curate
  list | show | promote` live in the **maintainer CLI only** — not in
  the registry, therefore not in MCP, therefore not callable by any
  agent, local brain included. The same absence pattern as
  `dismiss_finding`: the agent cannot promote because the tool does
  not exist where agents live. Promotion moves the file, strips the
  queue metadata into a provenance comment, and lands in a reviewed
  git commit; the curated-manifest CI gate stays the permanent floor.

## 5. The gates demand verified (the safety property)

`gate_open` and `fw_manifest` — the two tools whose success precedes
electricity — refuse with **`PROFILE_UNVERIFIED`** while any part in
the circuit is not verified-tier, naming the parts and the path
("promote the proposal for X, or swap in a verified part"). Design,
checks and simulation run on sourced data; **nothing physical happens
on it.** Geometry parts never reach this point: they cannot be added
to a circuit at all.

## 6. Search, browse, and the demand queue

`parts_search` returns tier-labelled hits across verified + sourced,
and — with `includeGeometry: true` — the whole corpus, geometry hits
marked browse-only. The UI badges tiers in the library ("sourced —
usable; the power gate requires verification", "geometry — not yet
usable; ask the agent to research it").

Curation is **demand-ranked**: a search that misses, or a geometry part
a maker reaches for, is the signal. The agent's natural move on that
signal is `profile_propose` — the maker asking for a part IS the drip.

## 7. The contribution path

Profiles and proposals are YAML in-repo behind a CI gate — a PR
surface that already works. Contribution rules: citation per electrical
field, the manifest gate enforces shape, human review enforces truth,
promotion authority stays with maintainers. "Unlimited" ultimately
means the community's throughput, not ours.

## 8. Tools

One addition to the registry (48 → 50):

| Tool | Mutates | Gated | Does |
|---|---|---|---|
| `profile_propose` | repo state (proposals dir) | no | validated draft + citations → `data/proposals/`; refuses shadowing a verified profile |
| `datasheet_read` | no | no | extracted text of an uploaded PDF, framed `[maker-supplied — unverified]` |

And deliberately **not** in the registry: promotion (§4, D51), and any
tier-setting tool (§2 — tier is location, location moves only by
promotion).

## 9. Scope

**In:** the tier model on the bundle, proposals loading + validation,
`PROFILE_UNVERIFIED` on both gates, `PART_PROFILE_SOURCED` NOTE,
`profile_propose`, the `maker curate` CLI group, tier-labelled search
incl. geometry browse, UI tier badges, tests below.

**Out (named):** search-miss logging as a ranked queue (needs
server-side aggregation — slice 2); geometry parts addable to circuits
(needs missing-profile rule semantics — with demand); SPICE-model and
KiCad-mapping proposals (same pipeline, later fields); community
contribution docs page (with the first outside contributor).

## 10. Testing

- **Tier semantics:** a proposal loads as sourced; the same partId in
  `data/profiles/` wins and the proposal is refused; geometry parts
  never enter a circuit.
- **The gate property:** a circuit with one sourced part —
  `check_circuit` runs, `sim_run` runs, `gate_open` and `fw_manifest`
  refuse `PROFILE_UNVERIFIED` naming it; after promotion (file moved in
  the fixture), both pass. The danger corpus is untouched — verified
  parts behave exactly as today.
- **Proposal validation:** missing citation → refused; unknown footprint
  pin → refused; shadowing → refused; archetype implausibility → named
  in the response.
- **The absence:** registry has no promote/tier tool (the guard-rail
  regex grows `promote`); `maker curate` exists only in the CLI
  package.
- **Golden:** the script grows `profile_propose` for an uncurated
  corpus part, and the gate refusal on it.

## 11. New decisions

- **D50 — the provenance-tiered library.** Tier = profile location;
  sourced parts design but never gate; geometry parts browse only.
  Rejected: severity-capping sourced findings (a cited number deserves
  its finding; the gate is the enforcement point, not the prose);
  binary curated-or-invisible (the status quo this reverses — it made
  the library look tiny and starved the demand signal).
- **D51 — promotion is human-only, by absence.** The promote operation
  exists solely in the maintainer CLI, outside the registry/MCP. 
  Rejected: an agent-callable promote behind a confirmation (a
  confirmation is a prompt away from fluent-but-wrong; the dismiss-
  finding precedent applies unchanged).
