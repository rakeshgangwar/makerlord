<script>
  import { app, searchLibrary, openPart, loadFiles, openFile } from '$lib/app.svelte.js';

  let { projectFile = null, tab = null } = $props();
  const file = $derived(projectFile ?? app.projectFile);
  const activeTab = $derived(tab ?? app.panelTab);
</script>

<aside class="artifacts" aria-label="Artifacts">
  <div class="panel-tabs" role="tablist">
    <button role="tab" aria-selected={activeTab === 'bench'} class:on={activeTab === 'bench'}
      onclick={() => (app.panelTab = 'bench')}>On the bench</button>
    <button role="tab" aria-selected={activeTab === 'library'} class:on={activeTab === 'library'}
      onclick={() => { app.panelTab = 'library'; }}>Library</button>
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
      <p class="mono panel-id">{app.libraryPart.definition.family}</p>
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
    {:else if app.libraryHits.length > 0}
      <ul class="panel-list">
        {#each app.libraryHits as hit}
          <li><button class="lib-hit" onclick={() => openPart(hit.id)}>{hit.title}</button>
            <span class="mono small">{hit.family}</span></li>
        {/each}
      </ul>
    {:else}
      <p class="empty">Search the curated library — only parts here can be used.</p>
    {/if}
  {:else}
    {#if !app.projectId}
      <p class="empty">Start a project to see its files.</p>
    {:else}
      <h3>Project files</h3>
      <ul class="panel-list file-list">
        {#each app.fileList as f}
          <li><button class="lib-hit mono" class:open={app.fileOpen?.path === f.path}
              onclick={() => openFile(f.path)}>{f.path}</button>
            <span class="mono small">{f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(1)} kB`}</span></li>
        {/each}
      </ul>
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
  .file-list li { display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline; }
</style>
