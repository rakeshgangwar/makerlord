# MakerLord Curation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the D50/D51 pipeline — provenance tiers on the bundle, the proposals queue, `PROFILE_UNVERIFIED` on both gates, `profile_propose` (48 → 49), the human-only `maker curate` CLI, tier-labelled search with geometry browse, and UI badges.

**Architecture:** Proposals live in `data/proposals/` (`MAKERLORD_PROPOSALS_PATH`), loaded by `@makerlord/parts` beside profiles; tier = file location, computed by the bundle, never stored as a flag. Promotion exists only in the `cli` package — not the registry, not MCP (D51, the absence pattern).

**Spec:** [../specs/2026-07-30-curation-pipeline-design.md](../specs/2026-07-30-curation-pipeline-design.md)

## Global Constraints

- **Tier is location.** No field, no tool sets it; only promotion moves a file.
- **The gates own physicality:** `gate_open` and `fw_manifest` refuse `PROFILE_UNVERIFIED` while any circuit part is not verified-tier. Checks and sim run on sourced data unchanged — findings are not softened (D50).
- **No citation, no field.** Every electrical field in a proposal cites a URL; the agent-side fetched-URL ledger adjudicates them like sourced claims.
- **Geometry parts never enter a circuit** in this slice.
- **The danger corpus is untouched** — verified parts behave exactly as today.

## Tasks

### Task 1: Proposals in `@makerlord/parts`

- [x] `proposalSchema` (`partId`, `file` (corpus path), `proposedAt`, `citations` record, `profile` = profileSchema); `loadProposals(dir)` keyed by partId; a proposal shadowing a verified profile is rejected at load
- [x] `Bundle` gains `tiers: Record<string, 'verified' | 'sourced'>`; `buildBundle` accepts proposals (def loaded from the proposal's corpus file, profile from its body)
- [x] Tests: proposal loads as sourced; shadowing rejected; malformed citations rejected

### Task 2: Tiered data layer in `@makerlord/tools`

- [x] `data.ts`: proposals dir env (`MAKERLORD_PROPOSALS_PATH`, default `./data/proposals`), merged into `bundle()`; `tierOf(partId)`; lazy `geometryIndex()` over `loadCorpus` (cached once) for browse-only hits
- [x] Tests: sourced part usable by `part_add`; `tierOf` per location

### Task 3: The gate property

- [x] `PROFILE_UNVERIFIED` refusal code; `gate_open` and `fw_manifest` refuse while any circuit part is sourced-tier, naming parts + the path
- [x] `check_circuit` appends the `PART_PROFILE_SOURCED` NOTE naming sourced parts
- [x] Tests: design/check/sim run on a sourced part; both gates refuse; moving the file (fixture promotion) unblocks

### Task 4: `profile_propose` (48 → 49)

- [x] Input `{file, partId, profile, citations}`: corpus def loads + moduleId matches, footprint pins ⊆ real connectors, URL citation per electrical field present, no shadowing; archetype plausibility warnings (LED Vf 1.2–4 V, resistor field set) in the response; writes `data/proposals/<partId>.yaml`
- [x] Registry: 49 tools; guard-rail regex grows `promote`; loop adjudication extends to `profile_propose` citations (fetched-URL ledger, like sourced claims)
- [x] Tests: happy path; each refusal; plausibility named; agent-loop citation adjudication

### Task 5: `maker curate` — the human-only CLI (D51)

- [x] `maker curate list | show <partId> | promote <partId>` in the cli package ONLY: show prints profile + citations + plausibility; promote validates, moves the file to `data/profiles/` with citations folded into a provenance comment
- [x] Tests: promote round-trip; absence — the registry exposes no promote/tier tool

### Task 6: Tier-labelled search + geometry browse

- [x] `parts_search` hits gain `tier`; `includeGeometry: true` adds corpus-wide browse-only hits
- [x] Tests: tiers labelled; geometry hits marked and not addable

### Task 7: UI badges

- [x] Library hits + detail show tier badges ("sourced — usable; the power gate requires verification", "geometry — ask the agent to research it"); svelte-check clean

### Task 8: Docs + reconciliation

- [x] Golden script grows a `profile_propose` + gate-refusal leg; D50/D51 in decisions.md; ledger curated-library row updated; docs/README rows; CLAUDE.md tool count
