# design-sync notes — MakerLord

- This repo is a Svelte 5 APP, not a React component library: no dist/
  components, no Storybook; nearly all UI lives in
  packages/ui/src/routes/+page.svelte. The sync is **identity-only**
  (off-script layout): tokens + styles.css + guidelines, a stub
  _ds_bundle.js (window.MakerLord = {}), no component cards, no
  _ds_sync.json anchor (next sync re-verifies everything — correct).
- Token source of truth: packages/ui/src/routes/+layout.svelte `:root`.
  If those tokens change, regenerate ds-bundle/tokens/bench-tokens.css.
- Fonts come from Google Fonts (see packages/ui/src/app.html), not repo
  files — styles.css @imports the same URL; no fonts/ dir shipped.
- Future path if the UI is ever componentized (StageRail, FindingStrip,
  MeterStrip, Dock, SvgViewer…): a React bridge that mounts the compiled
  Svelte components is feasible (Svelte 5 mount() in an effect; callback
  props map well, slots don't). Revisit then; not worth it for one
  component today.
