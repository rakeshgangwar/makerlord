<script>
  import { updated } from '$app/state';
  import { Toaster, toast } from 'svelte-sonner';
  import '$lib/kit/kit.css';

  let { children } = $props();

  // A deploy under an open tab breaks lazy chunks (observed live: the
  // flash button 404'd its module). Say so before it bites.
  let warned = $state(false);
  $effect(() => {
    if (updated.current && !warned) {
      warned = true;
      toast('The bench was updated — refresh to pick it up', {
        duration: Infinity,
        action: { label: 'Refresh', onClick: () => location.reload() },
      });
    }
  });
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
    /* tone surfaces — every tinted background reads from here so the
       dark bench (below) can restate them */
    --code-bg: #eef1f0;
    --maker-bubble: #dcefe6;
    --gate-bg: #f2faf6;
    --ok-bg: #e7f3ed;
    --ok-ink: #0a5238;
    --warn-bg: #f3e8cf;
    --warn-ink: #7c5000;
    --danger-bg: #fdf0ee;
    --danger-ink: #c22f1e;
    --hover-bg: rgb(255 255 255 / 75%);
    --mat-veil: rgb(233 236 238 / 82%);
  }

  /* ── the bench at night — same identity, lights off ── */
  :global(:root[data-theme='dark']) {
    --mat: #171b1e;
    --panel: #21262a;
    --ink: #e8edf0;
    --ink-soft: #9aa7ae;
    --line: #343d43;
    --mask: #35b384;
    --mask-deep: #2a8f6a;
    --copper: #c98b57;
    --copper-ink: #d9a06c;
    --meter-face: #101416;
    --sev-refuse: #e07b7b;
    --sev-blocker: #ef6a57;
    --sev-warning: #d99a2b;
    --sev-note: #6aa5dd;
    --code-bg: #2a3136;
    --maker-bubble: #1f3a2f;
    --gate-bg: #1e2c26;
    --ok-bg: #1f3129;
    --ok-ink: #7fd6b0;
    --warn-bg: #3b331c;
    --warn-ink: #e3b34c;
    --danger-bg: #3d2521;
    --danger-ink: #ef8a7a;
    --hover-bg: rgb(255 255 255 / 6%);
    --mat-veil: rgb(23 27 30 / 82%);
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
    background: var(--mat-veil);
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
  /* Form fields never inherit text colour from the page — the UA picks
     black, which vanishes on the dark bench. One low-specificity rule
     sets the baseline; component styles still override. */
  :global(input), :global(select), :global(textarea) {
    color: var(--ink); background-color: var(--panel);
    border-color: var(--line); caret-color: var(--mask);
  }
  :global(input)::placeholder, :global(textarea)::placeholder {
    color: var(--ink-soft); opacity: 0.75;
  }
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
    border-radius: 0 0 8px 8px; text-decoration: none; font-size: var(--t-sm);
  }
  .skip-link:focus-visible { left: 0.5rem; }
  :global(.small) { font-size: var(--t-xs); color: var(--ink-soft); }
  :global(.empty) { color: var(--ink-soft); }
  :global(.error) { color: var(--sev-blocker); font-size: var(--t-md); }
  :global(.primary) {
    background: var(--mask); color: white; border: none;
    padding: 0.55rem 1.4rem; border-radius: var(--r-md); cursor: pointer;
    font-weight: 600; font-size: var(--t-md); margin-top: 0.6rem;
  }
  :global(.primary:hover) { background: var(--mask-deep); }
  :global(.primary:disabled) { opacity: 0.4; cursor: default; }
  :global(.secondary) {
    background: var(--panel); color: var(--mask); border: 1.5px solid var(--mask);
    padding: 0.45rem 1.1rem; border-radius: var(--r-md); cursor: pointer; font-weight: 600;
  }
  :global(.badge-assumed) {
    font-family: var(--font-mono); font-size: 0.62rem; margin-left: 0.3rem;
    background: var(--warn-bg); color: var(--warn-ink); padding: 0 0.3rem; border-radius: var(--r-md);
  }

  /* markdown inside agent messages */
  :global(.md p) { margin: 0.3em 0; }
  :global(.md table) { border-collapse: collapse; margin: 0.4em 0; font-size: 0.9em; }
  :global(.md th), :global(.md td) { border: 1px solid var(--line); padding: 0.25em 0.55em; text-align: left; }
  :global(.md th) { font-family: var(--font-mono); font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.06em; }
  :global(.md code) { font-family: var(--font-mono); font-size: 0.88em; background: var(--code-bg); padding: 0 0.25em; border-radius: var(--r-sm); }
  :global(.md pre) { background: var(--code-bg); padding: 0.6em 0.8em; border-radius: var(--r-md); overflow-x: auto; }
  :global(.md ul), :global(.md ol) { margin: 0.3em 0; padding-left: 1.3em; }
  :global(.md h1), :global(.md h2), :global(.md h3) { font-size: 1.05em; margin: 0.5em 0 0.2em; }
  @media (prefers-reduced-motion: reduce) {
    :global(*), :global(*)::before, :global(*)::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
