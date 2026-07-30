<script>
  import { app } from '$lib/app.svelte.js';
  import SvgViewer from '$lib/SvgViewer.svelte';

  const blocks = $derived(app.projectFile?.project?.architecture?.blocks ?? []);
  const decisions = $derived(app.projectFile?.project?.history ?? []);
</script>

<div class="facet">
  <p class="facet-eyebrow mono">④ Architecture — blocks first, parts later</p>
  {#if blocks.length > 0}
    <figure class="blocks-canvas">
      <figcaption class="mono">block diagram <span class="fig-hint">scroll to zoom · drag to pan</span></figcaption>
      <SvgViewer url={`/render/${app.projectId}/blocks?t=${app.renderTick}`} alt="block diagram" />
    </figure>
    <div class="cols">
      <section>
        <h3>Blocks &amp; sourcing</h3>
        <ul class="block-list">
          {#each blocks as b}
            <li>
              <strong>{b.name}</strong>
              <span class="src src-{b.sourcing?.type ?? 'undecided'}">
                {b.sourcing?.type === 'buy' ? `buy · ${b.sourcing.partId}` : b.sourcing?.type ?? 'undecided'}
              </span>
            </li>
          {/each}
        </ul>
      </section>
      {#if decisions.length > 0}
        <section>
          <h3>Decisions — with what was rejected</h3>
          <ul class="dec-list">
            {#each decisions as d}
              <li>
                <span class="mono dec-id">{d.id}</span> <strong>{d.title}</strong>
                <p class="dec-body">{d.decision}</p>
                {#each d.rejected as r}
                  <p class="dec-rej"><span class="mono">rejected:</span> {r.option} — {r.reason}</p>
                {/each}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  {:else}
    <p class="empty">No architecture yet — the agent proposes functional blocks (power,
      sensing, control…) and each gets a sourcing decision: buy a part, build it, or leave
      it undecided until feasibility says more.</p>
  {/if}
</div>

<style>
  .facet { max-width: 60rem; }
  .facet-eyebrow {
    font-size: var(--t-xs); letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--copper-ink); margin: 0 0 0.7rem;
  }
  .blocks-canvas {
    margin: 0 0 1rem; background: var(--panel); border-radius: var(--r-lg); padding: 0.7rem;
    box-shadow: 0 1px 3px rgb(20 24 27 / 8%);
  }
  .blocks-canvas figcaption {
    font-size: var(--t-xs); letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--ink-soft); margin-bottom: 0.4rem;
  }
  .blocks-canvas :global(.viewer) { height: 220px; }
  .fig-hint { text-transform: none; letter-spacing: 0; opacity: 0.6; float: right; }
  .cols { display: flex; gap: 1.5rem; flex-wrap: wrap; }
  .cols section { flex: 1; min-width: 18rem; }
  h3 {
    font-size: var(--t-sm); letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--ink-soft); margin: 0 0 0.4rem;
  }
  .block-list, .dec-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.45rem; }
  .block-list li {
    background: var(--panel); border-radius: var(--r-md); padding: 0.55rem 0.8rem;
    display: flex; justify-content: space-between; align-items: baseline; gap: 0.7rem;
  }
  .src {
    font-family: var(--font-mono); font-size: var(--t-xs); padding: 0.05rem 0.45rem;
    border-radius: var(--r-md); background: var(--code-bg); color: var(--ink-soft);
  }
  .src-buy { background: var(--maker-bubble); color: var(--mask); }
  .src-build { background: color-mix(in srgb, var(--copper) 16%, var(--panel)); color: var(--copper-ink); }
  .src-undecided { background: var(--warn-bg); color: var(--sev-warning); }
  .dec-list li { background: var(--panel); border-radius: var(--r-md); padding: 0.6rem 0.85rem; }
  .dec-id { font-size: var(--t-xs); color: var(--copper-ink); }
  .dec-body { margin: 0.25rem 0 0; font-size: var(--t-md); }
  .dec-rej { margin: 0.25rem 0 0; font-size: var(--t-sm); color: var(--ink-soft); }
</style>
