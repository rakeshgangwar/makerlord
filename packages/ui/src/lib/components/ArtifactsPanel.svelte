<script>
  import { app, searchLibrary, openPart, ownPart, loadInventoryGap, loadFiles, openFile } from '$lib/app.svelte.js';

  let { projectFile = null, tab = null } = $props();
  const file = $derived(projectFile ?? app.projectFile);
  const activeTab = $derived(tab ?? app.panelTab);

  /** Files grouped by MEANING, not just directory — the maker looks for
   *  "the requirements doc", not a path. */
  const DESIGN_DOCS = ['feasibility.md', 'requirements.md', 'DECISIONS.md', 'architecture.md', 'architecture.svg'];
  const fileGroups = $derived.by(() => {
    const g = { 'Design documents': [], 'Circuit': [], 'Firmware': [], 'Simulation': [], 'Journal': [], 'Model': [] };
    for (const f of app.fileList) {
      if (DESIGN_DOCS.includes(f.path)) g['Design documents'].push(f);
      else if (f.path.startsWith('circuit/')) g['Circuit'].push(f);
      else if (f.path.startsWith('firmware/')) g['Firmware'].push(f);
      else if (f.path.startsWith('sim/')) g['Simulation'].push(f);
      else if (f.path === 'transcript.jsonl') g['Journal'].push(f);
      else g['Model'].push(f);
    }
    return Object.entries(g).filter(([, files]) => files.length > 0);
  });

  /** Strip the directory for display — the group already says where it lives. */
  const basename = (p) => p.split('/').pop();

  /** Curated hits grouped by family — the browse-first library view. */
  const libraryGroups = $derived.by(() => {
    const groups = new Map();
    for (const hit of app.libraryHits) {
      const fam = hit.family || 'other';
      if (!groups.has(fam)) groups.set(fam, []);
      groups.get(fam).push(hit);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });
</script>

<aside class="artifacts" aria-label="Artifacts">
  <div class="panel-tabs" role="tablist">
    <button role="tab" aria-selected={activeTab === 'bench'} class:on={activeTab === 'bench'}
      onclick={() => (app.panelTab = 'bench')}>On the bench</button>
    <button role="tab" aria-selected={activeTab === 'library'} class:on={activeTab === 'library'}
      onclick={() => { app.panelTab = 'library'; if (app.libraryHits.length === 0) searchLibrary(); loadInventoryGap(); }}>Library</button>
    <button role="tab" aria-selected={activeTab === 'files'} class:on={activeTab === 'files'}
      onclick={() => { app.panelTab = 'files'; app.fileOpen = null; loadFiles(); }}>Files</button>
  </div>

  {#if activeTab === 'bench'}
    <p class="mono panel-id">project.json{app.projectId ? ` · ${app.projectId.slice(0, 6)}` : ''}</p>
    {#if file}
      {@const p = file.project}
      {#if p.requirements.length > 0}
        <h3>Requirements</h3>
        <ul class="panel-list">
          {#each p.requirements as r}
            <li>
              <span class="mono">{r.metric}</span> {r.comparator} {r.value} {r.unit}
              {#if r.provenance === 'assumed'}<span class="badge-assumed">assumed</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if p.architecture.blocks.length > 0}
        <h3>Blocks</h3>
        <ul class="panel-list">
          {#each p.architecture.blocks as b}
            <li><strong>{b.name}</strong> — <span class="mono">{b.sourcing.type === 'buy' ? b.sourcing.partId : b.sourcing.type}</span></li>
          {/each}
        </ul>
      {/if}
      {#if p.inventory.length > 0}
        <h3>Inventory</h3>
        <ul class="panel-list">
          {#each p.inventory as item}<li>{item.freeText ?? item.partId}{item.quantity ? ` ×${item.quantity}` : ''}</li>{/each}
        </ul>
      {/if}
      {#if p.requirements.length === 0 && p.architecture.blocks.length === 0 && p.inventory.length === 0}
        <p class="empty">Nothing settled yet — it fills in as you talk.</p>
      {/if}
    {:else}
      <p class="empty">No project on the bench.</p>
    {/if}
  {:else if activeTab === 'library'}
    <form class="lib-search" onsubmit={(e) => { e.preventDefault(); searchLibrary(); }}>
      <input bind:value={app.libraryQuery} name="library" placeholder="search parts…" />
    </form>
    {#if !app.projectId}
      <p class="empty">Start a project to browse the library.</p>
    {:else if app.libraryPart}
      <button class="lib-back" onclick={() => (app.libraryPart = null)}>← back</button>
      <h3>{app.libraryPart.definition.title}</h3>
      <p class="mono panel-id">{app.libraryPart.definition.family}
        {#if app.libraryPart.tier === 'sourced'}<span class="tier tier-sourced" title="agent-researched, cited — the power gate requires verification">sourced</span>{/if}
        {#if app.libraryPart.tier === 'geometry'}<span class="tier tier-geometry" title="geometry only — ask the agent to research a profile">geometry</span>{/if}
      </p>
      <button class="secondary own-btn" onclick={() => ownPart(app.libraryPart.definition.id)}>
        + I own this
      </button>
      <ul class="panel-list">
        {#each app.libraryPart.definition.pins as pin}
          <li><span class="mono">{pin.name}</span> · {pin.role}</li>
        {/each}
      </ul>
      {#if app.libraryPart.profile}
        <h3>Safety profile</h3>
        <ul class="panel-list mono small">
          {#each Object.entries(app.libraryPart.profile) as [k, v]}
            {#if typeof v !== 'object'}<li>{k}: {v}</li>{/if}
          {/each}
        </ul>
      {:else}
        <p class="empty">No safety profile yet — not usable in circuits.</p>
      {/if}
    {:else if libraryGroups.length > 0}
      {#if app.inventoryGap.length > 0}
        <div class="gap-box">
          <h3>To acquire <span class="small">the build needs these; your inventory doesn't cover them</span></h3>
          <ul class="panel-list">
            {#each app.inventoryGap as g}
              <li>
                <button class="lib-hit" onclick={() => openPart(g.partId)}>{g.title}</button>
                <span class="mono small">×{g.needed - g.owned}</span>
                <button class="own-inline" title="mark as owned" onclick={() => ownPart(g.partId)}>own it</button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      <p class="lib-count mono">{app.libraryHits.length} curated part{app.libraryHits.length === 1 ? '' : 's'} — only these can be used</p>
      {#each libraryGroups as [family, hits]}
        <details class="lib-group" open={libraryGroups.length <= 4}>
          <summary class="mono">{family} <span class="small">({hits.length})</span></summary>
          <ul class="panel-list">
            {#each hits as hit}
              <li>
                <button class="lib-hit" onclick={() => openPart(hit.id)}>{hit.title}</button>
                {#if hit.tier === 'sourced'}<span class="tier tier-sourced">sourced</span>{/if}
              </li>
            {/each}
          </ul>
        </details>
      {/each}
    {:else}
      <p class="empty">Nothing matches — clear the search to see the whole library.</p>
    {/if}
  {:else}
    {#if !app.projectId}
      <p class="empty">Start a project to see its files.</p>
    {:else}
      {#each fileGroups as [group, files]}
        <details class="file-group" open={group !== 'Journal' && group !== 'Model'}>
          <summary class="mono">{group} <span class="small">({files.length})</span></summary>
          <ul class="panel-list file-list">
            {#each files as f}
              <li><button class="lib-hit mono" class:open={app.fileOpen?.path === f.path}
                  onclick={() => openFile(f.path)}>{basename(f.path)}</button>
                <span class="mono small">{f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(1)} kB`}</span></li>
            {/each}
          </ul>
        </details>
      {/each}
      {#if app.commits.length > 0}
        <h3>History</h3>
        <ul class="panel-list">
          {#each app.commits as c}
            <li><span class="mono small">{c.date}</span> {c.subject}</li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</aside>

<style>
  .artifacts { min-width: 15rem; max-width: 17rem; }
  .panel-tabs { display: flex; gap: 0.25rem; margin-bottom: 0.7rem; }
  .own-btn { margin: 0.2rem 0 0.6rem; font-size: 0.78rem; }
  .own-inline {
    border: 1px solid var(--line); background: transparent; border-radius: 4px;
    font-size: 0.66rem; padding: 0.1rem 0.4rem; cursor: pointer; color: var(--ink-soft);
  }
  .own-inline:hover { border-color: var(--mask); color: var(--mask); }
  .tier {
    font-size: 0.6rem; border-radius: 4px; padding: 0.05rem 0.3rem;
    margin-left: 0.35rem; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .tier-sourced { background: #fdf3e3; color: #9a6b1f; border: 1px solid #e8cfa0; }
  .tier-geometry { background: #eef1f0; color: var(--ink-soft); border: 1px solid var(--line); }
  .gap-box {
    border: 1.5px solid var(--copper); border-radius: 8px;
    padding: 0.5rem 0.7rem; margin-bottom: 0.7rem; background: #fdf8f3;
  }
  .panel-tabs button {
    font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.08em;
    text-transform: uppercase; border: none; background: transparent;
    color: var(--ink-soft); padding: 0.3rem 0.5rem; cursor: pointer;
    border-bottom: 2px solid transparent;
  }
  .panel-tabs button.on { color: var(--mask); border-bottom-color: var(--mask); }
  .artifacts h3 {
    font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--ink-soft); margin: 0.9rem 0 0.3rem;
  }
  .panel-list { list-style: none; padding: 0; margin: 0; font-size: 0.82rem; }
  .panel-list li { padding: 0.18rem 0; }
  .panel-id { font-size: 0.72rem; color: var(--ink-soft); margin: 0; }
  .lib-search input {
    width: 100%; box-sizing: border-box; padding: 0.45rem 0.6rem;
    border: 1.5px solid var(--line); border-radius: 7px; font-family: var(--font-body);
  }
  .lib-hit {
    border: none; background: transparent; color: var(--mask); cursor: pointer;
    padding: 0; font-size: 0.85rem; text-align: left; text-decoration: underline;
  }
  .lib-hit.open { color: var(--mask); font-weight: 600; }
  .lib-back { border: none; background: transparent; color: var(--ink-soft); cursor: pointer; padding: 0; }
  .lib-count { font-size: 0.68rem; color: var(--ink-soft); margin: 0.5rem 0 0.4rem; }
  .lib-group summary {
    cursor: pointer; font-size: 0.72rem; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--ink-soft); padding: 0.35rem 0;
  }
  .lib-group[open] summary { color: var(--mask); }
  .lib-group ul { padding-left: 0.6rem; }
  .file-group summary {
    cursor: pointer; font-size: 0.72rem; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--ink-soft); padding: 0.35rem 0;
  }
  .file-group[open] summary { color: var(--mask); }
  .file-group ul { padding-left: 0.6rem; }
  .file-list li { display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline; }
</style>
