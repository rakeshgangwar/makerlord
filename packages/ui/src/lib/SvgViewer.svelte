<script>
  import { browser } from '$app/environment';
  import DOMPurify from 'dompurify';

  /**
   * Interactive SVG viewer: wheel zoom, drag pan, double-click reset, and a
   * readout of whatever data-part / data-net / data-wire / data-hole the
   * pointer is over. The projections already carry those attributes — the
   * renderers stay deterministic and dumb; interactivity lives here.
   */
  let { url = null, content = null, alt = '', emptyNote = 'arrives when the circuit exists',
    highlightHoles = [], highlightParts = [] } = $props();

  let svgText = $state('');
  let failed = $state(false);
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let hoverLabel = $state('');
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  /** @type {HTMLElement | null} */
  let stageEl = $state(null);

  // Paint the current step's holes/parts in copper — both views speak.
  $effect(() => {
    void svgText;
    const holes = new Set(highlightHoles);
    const parts = new Set(highlightParts);
    if (!stageEl) return;
    for (const el of stageEl.querySelectorAll('[data-hole]')) {
      if (holes.has(el.dataset.hole)) {
        el.setAttribute('fill', '#b26a38');
        el.setAttribute('r', '4.6');
        el.style.filter = 'drop-shadow(0 0 4px #b26a38)';
      } else {
        el.setAttribute('fill', '#3a3a3a');
        el.setAttribute('r', '2.2');
        el.style.filter = '';
      }
    }
    for (const el of stageEl.querySelectorAll('[data-part]')) {
      el.style.filter = parts.has(el.dataset.part)
        ? 'drop-shadow(0 0 5px #b26a38)'
        : '';
    }
  });

  function sanitize(text) {
    if (!browser) return '';
    return DOMPurify.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true } });
  }

  $effect(() => {
    if (content !== null) {
      svgText = sanitize(content);
      failed = false;
      return;
    }
    if (!url || !browser) return;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) { failed = true; svgText = ''; return; }
        svgText = sanitize(await r.text());
        failed = false;
      })
      .catch(() => { failed = true; });
  });

  function wheel(e) {
    e.preventDefault();
    const next = Math.min(12, Math.max(0.4, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    // Zoom about the cursor so the point under it stays put.
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    tx = cx - ((cx - tx) / scale) * next;
    ty = cy - ((cy - ty) / scale) * next;
    scale = next;
  }

  function down(e) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function move(e) {
    if (dragging) {
      tx += e.clientX - lastX;
      ty += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      return;
    }
    const hit = e.target.closest?.('[data-part],[data-net],[data-wire],[data-hole]');
    hoverLabel = hit
      ? (hit.dataset.part ?? hit.dataset.net ?? hit.dataset.wire ?? hit.dataset.hole)
      : '';
  }

  function up() {
    dragging = false;
  }

  function reset() {
    scale = 1;
    tx = 0;
    ty = 0;
  }
</script>

<div
  class="viewer"
  role="img"
  aria-label={alt}
  onwheel={wheel}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointerleave={up}
  ondblclick={reset}
>
  {#if failed}
    <p class="note">{emptyNote}</p>
  {:else}
    <div class="stage" bind:this={stageEl} style={`transform: translate(${tx}px, ${ty}px) scale(${scale})`}>
      {@html svgText}
    </div>
  {/if}
  {#if hoverLabel}
    <span class="hover mono">{hoverLabel}</span>
  {/if}
  {#if scale !== 1}
    <button class="reset mono" onclick={reset}>{Math.round(scale * 100)}% ⟲</button>
  {/if}
</div>

<style>
  .viewer {
    position: relative; overflow: hidden; width: 100%; height: 100%;
    min-height: 90px; cursor: grab; touch-action: none; background: #fff;
    border-radius: 4px;
  }
  .viewer:active { cursor: grabbing; }
  .stage { transform-origin: 0 0; width: 100%; height: 100%; }
  .stage :global(svg) { display: block; width: 100%; height: 100%; }
  .stage :global([data-part]:hover) { opacity: 0.75; }
  .stage :global([data-net]:hover), .stage :global([data-wire]:hover) { stroke-width: 3; }
  .note { color: var(--ink-soft, #667); font-size: 0.8rem; margin: 1.4rem 0.5rem; }
  .hover {
    position: absolute; left: 0.4rem; bottom: 0.35rem;
    background: rgb(17 24 20 / 82%); color: #e8f3ec; font-size: 0.66rem;
    padding: 0.1rem 0.45rem; border-radius: 3px; pointer-events: none;
  }
  .hover.mono, .reset.mono { font-family: var(--font-mono, monospace); }
  .reset {
    position: absolute; right: 0.4rem; top: 0.35rem; border: 1px solid var(--line, #ccc);
    background: #fff; font-size: 0.66rem; padding: 0.1rem 0.4rem; border-radius: 3px;
    cursor: pointer;
  }
</style>
