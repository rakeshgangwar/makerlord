<script>
  let { children } = $props();
</script>

<main class="frame">
  {@render children()}
</main>

<style>
  :global(:root) {
    /* bench tokens */
    --mat: #e9ecee;          /* the bench mat */
    --panel: #ffffff;
    --ink: #14181b;
    --ink-soft: #4c555c;
    --line: #d3d9dd;
    --mask: #0e6b4a;         /* solder-mask green — primary */
    --mask-deep: #0a5238;
    --copper: #b26a38;       /* trace copper — secondary */
    --meter-face: #23282c;   /* the instrument strip */
    --meter-glow: #9ae6c3;
    /* severity — always icon + label + colour together */
    --sev-refuse: #7f1d1d;
    --sev-blocker: #c22f1e;  /* probe red */
    --sev-warning: #b87400;  /* meter amber */
    --sev-note: #2b6cb0;
    /* resistor colour code = phase number */
    --phase-1: #6b4226;      /* brown */
    --phase-2: #c0392b;      /* red */
    --phase-3: #e67e22;      /* orange */
    --phase-4: #d4ac0d;      /* yellow */
    --font-body: 'Archivo', system-ui, sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  }
  :global(body) {
    margin: 0;
    font-family: var(--font-body);
    color: var(--ink);
    background-color: var(--mat);
    /* faint engineering grid, like schematic paper on the bench */
    background-image:
      linear-gradient(var(--line) 1px, transparent 1px),
      linear-gradient(90deg, var(--line) 1px, transparent 1px);
    background-size: 28px 28px;
    background-position: -1px -1px;
  }
  :global(body)::before {
    /* soften the grid so it reads as texture, not chart */
    content: '';
    position: fixed;
    inset: 0;
    background: rgb(233 236 238 / 82%);
    pointer-events: none;
    z-index: 0;
  }
  .frame {
    position: relative;
    z-index: 1;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  :global(button) { font-family: var(--font-body); }
  :global(:focus-visible) {
    outline: 2px solid var(--mask);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(*), :global(*)::before, :global(*)::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
