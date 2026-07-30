<script>
  import { displayFamily } from '$lib/taxonomy.js';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import {
    adoptUrlParams, app, loadInventoryGap, openPart, ownPart,
    refreshProjections, removeInventory, researchPart, searchLibrary,
    uploadDatasheet,
  } from '$lib/app.svelte.js';

  /**
   * The library page (D49/D50 at full width): the LIBRARY is what exists
   * — every part honest about its tier — and the INVENTORY is what this
   * maker owns. The sidebar stays the quick picker; this is the browse.
   */

  const inventory = $derived(app.projectFile?.project?.inventory ?? []);

  const groups = $derived.by(() => {
    const m = new Map();
    for (const hit of app.libraryHits) {
      const fam = displayFamily(hit.family);
      if (!m.has(fam)) m.set(fam, []);
      m.get(fam).push(hit);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  onMount(async () => {
    adoptUrlParams(page.url);
    if (!app.projectId) return;
    await Promise.all([refreshProjections(), searchLibrary(), loadInventoryGap()]);
  });

  async function toggleGeometry() {
    app.libraryIncludeGeometry = !app.libraryIncludeGeometry;
    await searchLibrary();
  }

  const benchHref = $derived(
    app.projectId ? `/?p=${app.projectId}&stage=${app.stage}` : '/',
  );

  let uploadBusy = $state(false);
  let uploadNote = $state('');

  async function onDatasheetPicked(e) {
    const file = e.target.files?.[0];
    if (!file || !app.libraryPart) return;
    uploadBusy = true;
    uploadNote = '';
    try {
      const ref = await uploadDatasheet(file);
      researchPart(app.libraryPart, ref);
      uploadNote = 'Uploaded — the agent is reading it and drafting a proposal. ' +
        'Watch the conversation on the bench.';
    } catch (err) {
      uploadNote = err instanceof Error ? err.message : String(err);
    } finally {
      uploadBusy = false;
      e.target.value = '';
    }
  }
</script>

<div class="lib-page">
  <header class="lib-head">
    <div>
      <p class="eyebrow mono">the parts, and your drawer</p>
      <h1>Library &amp; Inventory</h1>
    </div>
    <a class="secondary back" href={benchHref}>← back to the bench</a>
  </header>

  {#if !app.projectId}
    <p class="empty">Start a project first — the library serves a build.
      <a href="/">Go to the front door.</a></p>
  {:else}
    <div class="lib-grid">
      <section class="col">
        {#if app.inventoryGap.length > 0}
          <div class="panel gap">
            <h2>To acquire
              <span class="small">the build needs these; your drawer doesn't cover them</span></h2>
            <ul class="rows">
              {#each app.inventoryGap as g}
                <li>
                  <button class="row-hit" onclick={() => openPart(g.partId)}>{g.title}</button>
                  <span class="mono small">×{g.needed - g.owned}</span>
                  <button class="own-inline" onclick={() => ownPart(g.partId)}>own it</button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="panel">
          <h2>Inventory <span class="small">what you own — it travels with this project</span></h2>
          {#if inventory.length === 0}
            <p class="empty">Nothing yet. Tell the agent what's in your drawer, or
              mark parts owned from the catalog.</p>
          {:else}
            <ul class="rows">
              {#each inventory as item, i}
                <li>
                  <span>{item.freeText ?? item.title ?? item.partId}{item.quantity ? ` ×${item.quantity}` : ''}</span>
                  <button class="own-inline" title="remove from inventory"
                    onclick={() => removeInventory(i)}>remove</button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        {#if app.libraryPart}
          <div class="panel detail">
            <h2>{app.libraryPart.definition.title}
              {#if app.libraryPart.tier === 'verified'}<span class="tier tier-verified">verified</span>{/if}
              {#if app.libraryPart.tier === 'sourced'}<span class="tier tier-sourced">sourced</span>{/if}
              {#if app.libraryPart.tier === 'geometry'}<span class="tier tier-geometry">geometry</span>{/if}
            </h2>
            <p class="mono small">{app.libraryPart.definition.family}</p>
            {#if app.libraryPart.tier === 'sourced'}
              <p class="tier-note">Agent-researched and cited — usable for design and
                simulation; the power gate requires human verification
                (<span class="mono">maker curate</span>).</p>
            {/if}
            {#if app.libraryPart.tier === 'geometry'}
              <p class="tier-note">Geometry only — two roads to usable: the agent
                researches the web, or you upload the datasheet that came with
                the part. Both file a proposal; a human promotes to verified.</p>
              <div class="geo-actions">
                <button class="secondary" onclick={() => researchPart(app.libraryPart)}>
                  🔎 Ask the agent to research it
                </button>
                <label class="secondary upload-label" class:busy={uploadBusy}>
                  {uploadBusy ? 'Uploading…' : '📄 Upload its datasheet'}
                  <input type="file" accept="application/pdf" onchange={onDatasheetPicked}
                    disabled={uploadBusy} />
                </label>
              </div>
              {#if uploadNote}<p class="small upload-note">{uploadNote}</p>{/if}
            {:else}
              <button class="secondary" onclick={() => ownPart(app.libraryPart.definition.id)}>
                + I own this
              </button>
            {/if}
            <h3>Pins</h3>
            <ul class="rows mono small">
              {#each app.libraryPart.definition.pins as pin}
                <li>{pin.name} · {pin.role}</li>
              {/each}
            </ul>
            {#if app.libraryPart.profile}
              <h3>Safety profile</h3>
              <ul class="rows mono small">
                {#each Object.entries(app.libraryPart.profile) as [k, v]}
                  {#if typeof v !== 'object'}<li>{k}: {v}</li>{/if}
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </section>

      <section class="col catalog">
        <div class="panel">
          <form class="search-row" onsubmit={(e) => { e.preventDefault(); searchLibrary(); }}>
            <input bind:value={app.libraryQuery} name="library"
              placeholder="search parts…" aria-label="search parts" />
            <label class="geo-toggle small">
              <input type="checkbox" checked={app.libraryIncludeGeometry}
                onchange={toggleGeometry} />
              whole corpus (~1,800 parts)
            </label>
          </form>
          <p class="mono lib-count">{app.libraryHits.length} part{app.libraryHits.length === 1 ? '' : 's'}
            — verified and sourced are usable; geometry is browse-only</p>
          {#each groups as [family, hits]}
            <details class="fam" open>
              <summary class="mono">{family} <span class="small">({hits.length})</span></summary>
              <ul class="cards">
                {#each hits as hit}
                  <li>
                    <button class="card" class:active={app.libraryPart?.definition.id === hit.id}
                      onclick={() => openPart(hit.id)}>
                      <span class="card-title">{hit.title}</span>
                      {#if hit.tier === 'sourced'}<span class="tier tier-sourced">sourced</span>{/if}
                      {#if hit.tier === 'geometry'}<span class="tier tier-geometry">geometry</span>{/if}
                    </button>
                  </li>
                {/each}
              </ul>
            </details>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .lib-page { flex: 1; overflow-y: auto; padding: 1.25rem 1.75rem; }
  .lib-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: 1rem; }
  .eyebrow { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--copper); margin: 0; }
  h1 { margin: 0.1rem 0 0; font-size: 1.7rem; letter-spacing: -0.02em; }
  .back { text-decoration: none; }
  .lib-grid { display: grid; grid-template-columns: minmax(18rem, 24rem) 1fr; gap: 1rem; align-items: start; }
  @media (max-width: 900px) { .lib-grid { grid-template-columns: 1fr; } }
  .col { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 0.9rem 1.1rem; }
  h2 { margin: 0 0 0.6rem; font-size: 1.05rem; }
  h2 .small { font-weight: 400; margin-left: 0.4rem; }
  h3 { margin: 0.8rem 0 0.3rem; font-size: 0.85rem; }
  .gap { border: 1.5px solid var(--copper); background: #fdf8f3; }
  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .rows li { display: flex; align-items: baseline; gap: 0.5rem; }
  .row-hit { border: none; background: none; cursor: pointer; color: var(--ink); text-align: left; padding: 0; font-size: 0.9rem; }
  .row-hit:hover { color: var(--mask); }
  .own-inline {
    border: 1px solid var(--line); background: transparent; border-radius: 4px;
    font-size: 0.66rem; padding: 0.1rem 0.4rem; cursor: pointer; color: var(--ink-soft);
    margin-left: auto;
  }
  .own-inline:hover { border-color: var(--mask); color: var(--mask); }
  .search-row { display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap; }
  .search-row input[name='library'] {
    flex: 1; min-width: 12rem; font-size: 0.95rem; padding: 0.5rem 0.7rem;
    border: 1.5px solid var(--line); border-radius: 7px;
  }
  .geo-toggle { display: flex; gap: 0.3rem; align-items: center; cursor: pointer; }
  .lib-count { font-size: 0.7rem; color: var(--ink-soft); margin: 0.5rem 0; }
  .fam summary { cursor: pointer; padding: 0.3rem 0; font-size: 0.8rem; }
  .cards { list-style: none; margin: 0.3rem 0 0.6rem; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.4rem; }
  .card {
    width: 100%; text-align: left; background: var(--mat); border: 1px solid var(--line);
    border-radius: 8px; padding: 0.45rem 0.6rem; cursor: pointer; display: flex;
    align-items: center; gap: 0.4rem;
  }
  .card:hover { border-color: var(--mask); }
  .card.active { border-color: var(--mask); background: #f2faf6; }
  .card-title { font-size: 0.82rem; flex: 1; }
  .tier {
    font-size: 0.6rem; border-radius: 4px; padding: 0.05rem 0.3rem;
    text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
  }
  .tier-verified { background: #e7f5ee; color: var(--mask); border: 1px solid #bfe3d2; }
  .tier-sourced { background: #fdf3e3; color: #9a6b1f; border: 1px solid #e8cfa0; }
  .tier-geometry { background: #eef1f0; color: var(--ink-soft); border: 1px solid var(--line); }
  .tier-note { font-size: 0.82rem; color: var(--ink-soft); }
  .detail { border: 1.5px solid var(--mask); }
  .geo-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.5rem 0; }
  .upload-label { position: relative; overflow: hidden; display: inline-flex; align-items: center; }
  .upload-label input[type='file'] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .upload-label.busy { opacity: 0.5; }
  .upload-note { margin: 0.2rem 0 0; }
</style>
