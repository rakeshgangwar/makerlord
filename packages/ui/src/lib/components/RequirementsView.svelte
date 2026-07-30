<script>
  import { app } from '$lib/app.svelte.js';

  const reqs = $derived(app.projectFile?.project?.requirements ?? []);

  function bound(r) {
    if (r.comparator === 'range') return `${r.value} – ${r.max} ${r.unit}`;
    return `${r.comparator} ${r.value} ${r.unit}`;
  }
</script>

<div class="facet">
  <p class="facet-eyebrow mono">③ Requirements — vague wants become testable bounds</p>
  {#if reqs.length > 0}
    <table class="req-table">
      <thead>
        <tr><th>metric</th><th>bound</th><th>category</th><th>provenance</th><th>statement</th></tr>
      </thead>
      <tbody>
        {#each reqs as r}
          <tr>
            <td class="mono metric">{r.metric}</td>
            <td class="mono">{bound(r)}</td>
            <td class="mono cat">{r.category}</td>
            <td><span class="prov prov-{r.provenance}">{r.provenance}</span></td>
            <td class="statement">{r.statement}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="legend">
      <span class="prov prov-stated">stated</span> you said it ·
      <span class="prov prov-derived">derived</span> computed from what you said ·
      <span class="prov prov-assumed">assumed</span> the agent's guess — confirm or correct these
    </p>
  {:else}
    <p class="empty">No requirements yet — they get pinned down with the agent, each with
      a number the finished build can be tested against.</p>
  {/if}
</div>

<style>
  .facet { max-width: 56rem; }
  .facet-eyebrow {
    font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--copper-ink); margin: 0 0 0.7rem;
  }
  .req-table {
    width: 100%; border-collapse: collapse; background: var(--panel);
    border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgb(20 24 27 / 8%);
  }
  .req-table th {
    font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--ink-soft); text-align: left;
    padding: 0.55rem 0.8rem; border-bottom: 2px solid var(--line);
  }
  .req-table td { padding: 0.5rem 0.8rem; border-bottom: 1px solid var(--line); font-size: 0.92rem; }
  .req-table tr:last-child td { border-bottom: none; }
  .metric { color: var(--mask); font-weight: 600; }
  .cat { font-size: 0.72rem; color: var(--ink-soft); }
  .statement { color: var(--ink-soft); font-size: 0.85rem; }
  .prov {
    font-family: var(--font-mono); font-size: 0.62rem; text-transform: uppercase;
    padding: 0.05rem 0.4rem; border-radius: 6px;
  }
  .prov-stated { background: #dcefe6; color: var(--mask); }
  .prov-derived { background: #e8ecf7; color: var(--sev-note); }
  .prov-assumed { background: #f3e8cf; color: var(--sev-warning); }
  .legend { font-size: 0.78rem; color: var(--ink-soft); margin-top: 0.6rem; }
</style>
