<script>
  import { page } from '$app/state';
  import {
    app, gotoStage, newProject, titleFor, loadFiles, openFile,
  } from '$lib/app.svelte.js';
  import { Dialog } from '$lib/kit/index.js';

  /**
   * The project tree (Cursor anatomy: everything the project IS lives
   * left — journey, settled artifacts, files). The agent lives right;
   * this column never talks, it shows.
   */
  let { stage = null } = $props();
  const current = $derived(stage ?? app.stage);
  // Phones get one row — the 17-chip cloud buried the hero (audit §6).
  let railOpen = $state(false);
  let tokenDialogOpen = $state(false);
  let mintedToken = $state('');

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark';
    if (dark) delete root.dataset.theme;
    else root.dataset.theme = 'dark';
    try { localStorage.setItem('makerlord.theme', dark ? 'light' : 'dark'); } catch {}
  }

  async function signOut() {
    await fetch('/auth/logout', { method: 'POST' });
    location.href = '/login';
  }

  async function mintBridgeToken() {
    const res = await fetch('/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'bridge' }),
    });
    const body = await res.json();
    if (res.ok) {
      mintedToken = body.token;
      tokenDialogOpen = true;
    }
  }

  const STAGE_NAMES = [
    'Idea', 'Feasibility', 'Requirements', 'Architecture', 'Simulate',
    'Prototype', 'Firmware', 'Debug', 'PCB', 'Mechanical',
    'Manufacturing', 'Fabricate', 'First article', 'Test', 'Compliance',
    'Document', 'Produce',
  ];

  /** The journey in four acts — the metro map's segments. `live` is
   *  product truth: Design and Prove are built; the rest say so. */
  const GROUPS = [
    { name: 'Design', phase: 1, stages: [1, 2, 3, 4], live: true },
    { name: 'Prove', phase: 2, stages: [5, 6, 7, 8], live: true },
    { name: 'Industrialize', phase: 3, stages: [9, 10, 11, 12], live: false },
    { name: 'Ship', phase: 4, stages: [13, 14, 15, 16, 17], live: false },
  ];

  const project = $derived(app.projectFile?.project ?? null);

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
  const basename = (p) => p.split('/').pop();
</script>

<nav class="rail" class:open={railOpen} aria-label="Project">
  <div class="rail-top">
    <div class="wordmark">Maker<span>Lord</span></div>
    <button class="theme-toggle" onclick={toggleTheme}
      title="light / dark" aria-label="Toggle colour theme">◐</button>
    <button class="rail-toggle mono" aria-expanded={railOpen}
      onclick={() => (railOpen = !railOpen)}>
      {String(current).padStart(2, '0')} {STAGE_NAMES[current - 1]} ▾
    </button>
  </div>

  <div class="tree">
    <div class="stage-list">
      {#each GROUPS as g}
        <p class="journey-group mono" data-phase={g.phase}>
          {g.name}{#if !g.live}<span class="soon">soon</span>{/if}
        </p>
        <div class="segment" class:future={!g.live} data-phase={g.phase}>
          {#each g.stages as n}
            <button
              class="stage"
              class:active={current === n}
              class:behind={n < current}
              onclick={() => { gotoStage(n); railOpen = false; }}
            >
              <span class="node mono" aria-hidden="true">{n < current ? '✓' : current === n ? '●' : '○'}</span>
              <span class="stage-n">{String(n).padStart(2, '0')}</span>
              {STAGE_NAMES[n - 1]}
            </button>
          {/each}
        </div>
      {/each}
    </div>

    {#if app.projectId && project}
      <div class="tree-sections">
        <p class="tree-group mono">on the bench</p>
        {#if project.requirements.length > 0}
          <details class="tree-sec" open>
            <summary class="mono">Requirements <span class="small">({project.requirements.length})</span></summary>
            <ul class="tree-list">
              {#each project.requirements as r}
                <li>
                  <span class="mono">{r.metric}</span> {r.comparator} {r.value} {r.unit}
                  {#if r.provenance === 'assumed'}<span class="badge-assumed">assumed</span>{/if}
                </li>
              {/each}
            </ul>
          </details>
        {/if}
        {#if project.architecture.blocks.length > 0}
          <details class="tree-sec" open>
            <summary class="mono">Blocks <span class="small">({project.architecture.blocks.length})</span></summary>
            <ul class="tree-list">
              {#each project.architecture.blocks as b}
                <li><strong>{b.name}</strong> — <span class="mono">{b.sourcing.type === 'buy' ? titleFor(b.sourcing.partId) : b.sourcing.type}</span></li>
              {/each}
            </ul>
          </details>
        {/if}
        {#if project.inventory.length > 0}
          <details class="tree-sec" open>
            <summary class="mono">Inventory <span class="small">({project.inventory.length})</span></summary>
            <ul class="tree-list">
              {#each project.inventory as item}
                <li>{item.freeText ?? titleFor(item.partId)}{item.quantity ? ` ×${item.quantity}` : ''}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>

      <div class="tree-sections">
        <p class="tree-group mono">files</p>
        {#each fileGroups as [group, files]}
          <details class="tree-sec" open={group === 'Design documents'}>
            <summary class="mono">{group} <span class="small">({files.length})</span></summary>
            <ul class="tree-list file-list">
              {#each files as f}
                <li><button class="file-link mono" class:openfile={app.fileOpen?.path === f.path}
                    onclick={() => openFile(f.path)}>{basename(f.path)}</button>
                  <span class="mono small">{f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(1)} kB`}</span></li>
              {/each}
            </ul>
          </details>
        {/each}
        {#if app.commits.length > 0}
          <details class="tree-sec">
            <summary class="mono">History <span class="small">({app.commits.length})</span></summary>
            <ul class="tree-list">
              {#each app.commits as c}
                <li><span class="mono small">{c.date}</span> {c.subject}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>
    {/if}

    {#if app.projectId}
      <a class="stage rail-link" href={`/library?p=${app.projectId}`}>⧉ library &amp; inventory</a>
      <button class="stage new-project" onclick={newProject}>⇤ projects</button>
    {/if}
  </div>

  {#if page.data.handle}
    <div class="user-box">
      <span class="who mono">◉ {page.data.handle}</span>
      <a class="user-act" href="/settings">⚙ settings</a>
      <button class="user-act" onclick={mintBridgeToken}>bridge token</button>
      <button class="user-act" onclick={signOut}>sign out</button>
    </div>
  {/if}
</nav>

<Dialog bind:open={tokenDialogOpen} title="Your bridge token">
  <p class="small">Shown <strong>once</strong> — paste it into <code>mlb</code>'s
    <code>bridge.json</code> as the API token, or run
    <code>./install.sh --token …</code> with it.</p>
  <code class="mono token-value">{mintedToken}</code>
  <button class="primary" onclick={() => { navigator.clipboard?.writeText(mintedToken); mintedToken = ''; tokenDialogOpen = false; }}>
    Copy &amp; close
  </button>
</Dialog>

<style>
  /* ── the project tree: phases carry their resistor colour band ── */
  .rail { display: flex; flex-direction: column; min-width: 13.5rem; max-width: 15rem; }
  .tree { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
  .rail-top { display: flex; align-items: baseline; justify-content: space-between; }
  .rail-toggle { display: none; }
  .theme-toggle {
    border: none; background: transparent; cursor: pointer;
    color: var(--ink-soft); font-size: var(--t-md); padding: 0 var(--s1);
    border-radius: var(--r-sm); line-height: 1;
  }
  .theme-toggle:hover { color: var(--ink); background: var(--hover-bg); }
  .stage-list { display: flex; flex-direction: column; gap: 1px; }
  .wordmark {
    font-weight: 800; font-size: var(--t-lg); letter-spacing: -0.02em;
    margin: 0 0 var(--s3) var(--s1);
  }
  .wordmark span { color: var(--mask); }

  /* ── the metro line: one route, four coloured segments ── */
  .journey-group {
    display: flex; align-items: baseline; gap: var(--s2);
    font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--ink-soft); margin: var(--s2) 0 0.1rem var(--s1);
  }
  .journey-group .soon {
    font-size: 0.56rem; letter-spacing: 0.06em; padding: 0 0.3rem;
    border: 1px solid var(--line); border-radius: var(--r-sm);
    color: var(--ink-soft); opacity: 0.8; text-transform: lowercase;
  }
  .segment { border-left: 2px solid var(--line); margin-left: 0.55rem; }
  .segment[data-phase='1'] { border-left-color: var(--phase-1); }
  .segment[data-phase='2'] { border-left-color: var(--phase-2); }
  .segment[data-phase='3'] { border-left-color: var(--phase-3); }
  .segment[data-phase='4'] { border-left-color: var(--phase-4); }
  .segment.future { border-left-style: dashed; }
  .segment.future .stage { opacity: 0.55; }

  .stage {
    display: flex; align-items: baseline; gap: 0.45rem; width: 100%;
    text-align: left; border: none; background: transparent;
    padding: 0.28rem 0.5rem 0.28rem 0.4rem; cursor: pointer; font-size: var(--t-sm);
    color: var(--ink-soft); border-radius: 0 var(--r-sm) var(--r-sm) 0;
    box-sizing: border-box;
  }
  .stage:hover { background: var(--hover-bg); color: var(--ink); }
  .stage.active { background: var(--panel); color: var(--ink); font-weight: 600; box-shadow: var(--shadow-1); }
  .stage.behind { color: var(--ink-soft); }
  .node { font-size: var(--t-xs); color: var(--ink-soft); width: 0.9em; }
  .stage.behind .node { color: var(--mask); }
  .stage.active .node { color: var(--mask); }
  .stage-n { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--ink-soft); }
  .stage.active .stage-n { color: var(--mask); font-weight: 600; }
  .new-project { border-left-color: transparent; }
  .rail-link { margin-top: var(--s2); text-decoration: none; display: flex; }

  /* ── settled artifacts + files, as tree sections ── */
  .tree-sections { margin-top: var(--s4); border-top: 1px solid var(--line); padding-top: var(--s2); }
  .tree-group {
    font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--ink-soft); opacity: 0.75; margin: 0 0 var(--s1) var(--s1);
  }
  .tree-sec > summary {
    cursor: pointer; font-size: var(--t-xs); text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--ink-soft); padding: var(--s1) var(--s1);
  }
  .tree-sec[open] > summary { color: var(--mask); }
  .tree-list {
    list-style: none; padding: 0 0 0 var(--s3); margin: 0 0 var(--s1);
    font-size: var(--t-sm);
  }
  .tree-list li { padding: 0.15rem 0; }
  .file-list li { display: flex; justify-content: space-between; gap: var(--s2); align-items: baseline; }
  .file-link {
    border: none; background: transparent; color: var(--mask); cursor: pointer;
    padding: 0; font-size: var(--t-sm); text-align: left; text-decoration: underline;
  }
  .file-link.openfile { font-weight: 600; }

  @media (max-width: 700px) {
    .rail { max-width: none; }
    .rail-toggle {
      display: inline-block; border: 1px solid var(--line); background: var(--panel);
      border-radius: var(--r-md); padding: 0.35rem 0.6rem; font-size: var(--t-xs);
      cursor: pointer; color: var(--ink);
    }
    .wordmark { margin-bottom: 0; }
    .stage-list { display: none; }
    .rail.open .stage-list { display: block; margin-top: var(--s2); }
    .rail.open .segment { display: flex; flex-flow: row wrap; gap: 0.15rem; }
    .rail.open .segment .stage { width: auto; align-self: flex-start; }
    .tree-sections { display: none; }
    .rail.open .tree-sections { display: block; }
  }

  /* ── signed-in strip ── */
  .user-box {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem;
    padding: var(--s2) var(--s1) 0; border-top: 1px solid var(--line);
    margin-top: var(--s2);
  }
  .who { font-size: var(--t-xs); color: var(--ink); }
  .user-act {
    border: none; background: transparent; cursor: pointer;
    font-size: 0.66rem; color: var(--ink-soft); text-decoration: underline;
    padding: 0;
  }
  a.user-act { display: inline; }
  .user-act:hover { color: var(--mask); }
  .token-value {
    display: block; word-break: break-all; font-size: var(--t-xs);
    background: var(--code-bg); padding: var(--s2) var(--s3); border-radius: var(--r-sm);
    margin: var(--s3) 0;
  }
</style>
