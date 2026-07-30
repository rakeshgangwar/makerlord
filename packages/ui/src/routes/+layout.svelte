<script>
  import { Toaster } from 'svelte-sonner';
  import '$lib/kit/kit.css';

  let { children } = $props();
</script>

<a class="skip-link" href="#workspace">Skip to workspace</a>
<main class="frame">
  {@render children()}
</main>
<Toaster position="bottom-right" offset="3.2rem" />

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
    --copper: #b26a38;       /* trace copper — glows and diagram accents */
    --copper-ink: #8a4e26;   /* copper for TEXT — 4.5:1 on the mat (audit §7) */
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
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  :global(button) { font-family: var(--font-body); }
  :global(:focus-visible) {
    outline: 2px solid var(--mask);
    outline-offset: 2px;
  }

  /* ── shared utility classes, used across components ── */
  :global(.mono) { font-family: var(--font-mono); }
  :global(.sr-only) {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap;
  }
  .skip-link {
    position: absolute; left: -200vw; top: 0.5rem; z-index: 30;
    background: var(--mask); color: white; padding: 0.4rem 0.9rem;
    border-radius: 0 0 8px 8px; text-decoration: none; font-size: 0.85rem;
  }
  .skip-link:focus-visible { left: 0.5rem; }
  :global(.small) { font-size: 0.72rem; color: var(--ink-soft); }
  :global(.empty) { color: var(--ink-soft); }
  :global(.error) { color: var(--sev-blocker); font-size: 0.9rem; }
  :global(.primary) {
    background: var(--mask); color: white; border: none;
    padding: 0.55rem 1.4rem; border-radius: 7px; cursor: pointer;
    font-weight: 600; font-size: 0.95rem; margin-top: 0.6rem;
  }
  :global(.primary:hover) { background: var(--mask-deep); }
  :global(.primary:disabled) { opacity: 0.4; cursor: default; }
  :global(.secondary) {
    background: var(--panel); color: var(--mask); border: 1.5px solid var(--mask);
    padding: 0.45rem 1.1rem; border-radius: 7px; cursor: pointer; font-weight: 600;
  }
  :global(.badge-assumed) {
    font-family: var(--font-mono); font-size: 0.62rem; margin-left: 0.3rem;
    background: #f3e8cf; color: #7c5000; padding: 0 0.3rem; border-radius: 6px;
  }

  /* markdown inside agent messages */
  :global(.md p) { margin: 0.3em 0; }
  :global(.md table) { border-collapse: collapse; margin: 0.4em 0; font-size: 0.9em; }
  :global(.md th), :global(.md td) { border: 1px solid var(--line); padding: 0.25em 0.55em; text-align: left; }
  :global(.md th) { font-family: var(--font-mono); font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.06em; }
  :global(.md code) { font-family: var(--font-mono); font-size: 0.88em; background: #eef1f0; padding: 0 0.25em; border-radius: 4px; }
  :global(.md pre) { background: #eef1f0; padding: 0.6em 0.8em; border-radius: 8px; overflow-x: auto; }
  :global(.md ul), :global(.md ol) { margin: 0.3em 0; padding-left: 1.3em; }
  :global(.md h1), :global(.md h2), :global(.md h3) { font-size: 1.05em; margin: 0.5em 0 0.2em; }
  @media (prefers-reduced-motion: reduce) {
    :global(*), :global(*)::before, :global(*)::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
