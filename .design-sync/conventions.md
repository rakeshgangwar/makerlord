# Building MakerLord screens

This design system ships **no components** — MakerLord's UI is Svelte; you
are designing future screens for it, on-brand. Build with plain elements
styled by the tokens in `styles.css` (its `@import` closure carries
everything). Read `guidelines/bench-identity.md` first — it defines the
bench identity, the four postures, and the safety rules for findings.

- Style ONLY via the CSS custom properties: surfaces `--mat`, `--panel`,
  `--ink`, `--ink-soft`, `--line`; brand `--mask`, `--mask-deep`, `--copper`;
  meter `--meter-face`, `--meter-glow`; severity `--sev-refuse`,
  `--sev-blocker`, `--sev-warning`, `--sev-note`; phases `--phase-1..4`;
  type `--font-body`, `--font-mono`. Do not invent hex values or class
  vocabularies.
- Fonts: Archivo (body/controls) + IBM Plex Mono (labels, numbers, paths)
  load via the Google Fonts `@import` in `styles.css`.
- Every screen keeps the bottom finding strip: dark `--meter-face` bar, LED
  dot, mono readout in `--meter-glow`. Severity is icon + label + colour,
  never colour alone, and findings get NO dismiss control.
- Minimal snippet of the idiom:

```html
<button style="background:var(--mask);color:#fff;border:none;
  border-radius:6px;padding:.55rem 1.3rem;font-family:var(--font-body);
  font-weight:600">Run checks</button>
<span style="font-family:var(--font-mono);font-size:.68rem;
  letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft)">
  schematic · run-5-ui</span>
```
