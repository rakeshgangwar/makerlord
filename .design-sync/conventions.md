# Building MakerLord screens

This design system ships MakerLord's **actual UI components** — compiled
Svelte 5 wrapped in React. Use them from `window.MakerLord.*` as normal
React elements: `StageRail`, `FindingStrip`, `BenchView`, `ChatDock`,
`ArtifactsPanel`, `Conversation`, `ConverseStart`, `MessageList`,
`ToolTrail`, `Composer`, `SvgViewer`. Each renders its own markup and
styles; **do not pass children** — configure via props (each component's
`.d.ts` and `.prompt.md` carry the exact contract). Omitted props render a
sensible empty state.

Layout glue you write yourself styles ONLY via the CSS custom properties
in `styles.css`'s closure: surfaces `--mat`, `--panel`, `--ink`,
`--ink-soft`, `--line`; brand `--mask`, `--mask-deep`, `--copper`; meter
`--meter-face`, `--meter-glow`; severity `--sev-refuse`, `--sev-blocker`,
`--sev-warning`, `--sev-note`; phases `--phase-1..4`; type `--font-body`,
`--font-mono`. Utility classes `.mono`, `.small`, `.empty`, `.primary`,
`.secondary`, `.badge-assumed` exist. Do not invent hex values. Fonts
(Archivo + IBM Plex Mono) load via the Google Fonts `@import`.

The canonical screen shape (see `guidelines/bench-identity.md` for the
four postures and safety rules):

```jsx
const ML = window.MakerLord;
<div style={{display:'flex', gap:'1.5rem', padding:'1.25rem 1.5rem'}}>
  <ML.StageRail stage={5} />
  <main style={{flex:1}}>{/* posture surface */}</main>
  <ML.ArtifactsPanel tab="bench" projectFile={file} />
</div>
<ML.FindingStrip findings={findings} />   {/* ALWAYS last, full width */}
```

Safety rules that are design rules: `FindingStrip` appears on every
screen at every breakpoint; findings never get a dismiss/close control;
severity is always icon + label + colour (the components do this — never
rebuild findings out of plain divs).
