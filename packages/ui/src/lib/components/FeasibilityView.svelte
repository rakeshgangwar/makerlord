<script>
  import { app } from '$lib/app.svelte.js';

  const feas = $derived(app.projectFile?.project?.feasibility ?? null);

  const VERDICT_LABEL = {
    'buildable': 'Buildable',
    'buildable-with-caveats': 'Buildable, with caveats',
    'buy-instead': 'Buy instead',
    'out-of-envelope': 'Out of envelope',
  };
  const VERDICT_TONE = {
    'buildable': 'good',
    'buildable-with-caveats': 'caveat',
    'buy-instead': 'caveat',
    'out-of-envelope': 'bad',
  };
</script>

<div class="facet">
  <p class="facet-eyebrow mono">② Feasibility — is this worth building?</p>
  {#if feas}
    <div class="verdict {VERDICT_TONE[feas.verdict]}">
      <span class="verdict-label">{VERDICT_LABEL[feas.verdict] ?? feas.verdict}</span>
      {#if feas.roughCost}
        <span class="mono cost">~{feas.roughCost.value} {feas.roughCost.currency}
          <span class="grade">{feas.roughCost.grade}</span></span>
      {/if}
    </div>
    {#if feas.claims.length > 0}
      <h3>Claims — each carries its grade</h3>
      <ul class="claims">
        {#each feas.claims as c}
          <li>
            <span class="grade grade-{c.grade}">{c.grade}</span>
            <span class="claim-text">{c.claim}</span>
            {#if c.evidence?.url}
              <a class="mono evidence" href={c.evidence.url} target="_blank" rel="noreferrer">source ↗</a>
            {:else if c.evidence?.toolCall}
              <span class="mono evidence">via {c.evidence.toolCall}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if feas.priorArt.length > 0}
      <h3>Prior art</h3>
      <ul class="claims">
        {#each feas.priorArt as p}
          <li><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
            {#if p.parts.length}<span class="mono evidence">{p.parts.join(', ')}</span>{/if}</li>
        {/each}
      </ul>
    {/if}
  {:else}
    <p class="empty">No feasibility verdict yet — describe what you want to make and the
      agent researches whether it's worth building before anything else.</p>
  {/if}
</div>

<style>
  .facet { max-width: 46rem; }
  .facet-eyebrow {
    font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--copper); margin: 0 0 0.7rem;
  }
  .verdict {
    display: flex; align-items: baseline; justify-content: space-between;
    background: var(--panel); border-radius: 10px; padding: 1rem 1.3rem;
    border-left: 5px solid var(--mask); box-shadow: 0 1px 3px rgb(20 24 27 / 8%);
  }
  .verdict.caveat { border-left-color: var(--sev-warning); }
  .verdict.bad { border-left-color: var(--sev-blocker); }
  .verdict-label { font-size: 1.45rem; font-weight: 800; letter-spacing: -0.01em; }
  .cost { color: var(--ink-soft); }
  h3 {
    font-size: 0.78rem; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--ink-soft); margin: 1.2rem 0 0.4rem;
  }
  .claims { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .claims li {
    background: var(--panel); border-radius: 8px; padding: 0.55rem 0.8rem;
    display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap;
  }
  .claim-text { flex: 1; min-width: 12rem; }
  .grade {
    font-family: var(--font-mono); font-size: 0.62rem; text-transform: uppercase;
    padding: 0.05rem 0.4rem; border-radius: 6px; background: #eef1f0; color: var(--ink-soft);
  }
  .grade-verified { background: #dcefe6; color: var(--mask); }
  .grade-sourced { background: #e8ecf7; color: var(--sev-note); }
  .grade-inferred { background: #f3e8cf; color: var(--sev-warning); }
  .evidence { font-size: 0.7rem; color: var(--ink-soft); text-decoration: none; }
</style>
