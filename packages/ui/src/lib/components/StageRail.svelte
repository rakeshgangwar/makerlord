<script>
  import { page } from '$app/state';
  import {
    app, gotoStage, newProject, titleFor, loadFiles, openFile,
  } from '$lib/app.svelte.js';

  /**
   * IDE anatomy (2026-07-31): a thin activity bar of icons and ONE
   * swappable panel — journey, bench, or files — never all at once.
   * Clicking the active icon collapses the panel entirely; the
   * workbench takes the room. Library and settings are pages, so their
   * icons navigate. Mobile keeps its one-row chip treatment.
   */
  let { stage = null } = $props();
  const current = $derived(stage ?? app.stage);
  let railOpen = $state(false);   // mobile disclosure

  const isMobile =
    typeof matchMedia !== 'undefined' && matchMedia('(max-width: 700px)').matches;

  let activity = $state('journey');
  let panelOpen = $state(true);
  if (typeof localStorage !== 'undefined') {
    const a = localStorage.getItem('makerlord.activity');
    if (a === 'journey' || a === 'bench' || a === 'files') activity = a;
    panelOpen = localStorage.getItem('makerlord.panelOpen') !== '0';
  }

  function pick(a) {
    if (activity === a && panelOpen) panelOpen = false;
    else {
      activity = a;
      panelOpen = true;
      if (a === 'files') loadFiles();
    }
    try {
      localStorage.setItem('makerlord.activity', activity);
      localStorage.setItem('makerlord.panelOpen', panelOpen ? '1' : '0');
    } catch {}
  }

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark';
    if (dark) delete root.dataset.theme;
    else root.dataset.theme = 'dark';
    try { localStorage.setItem('makerlord.theme', dark ? 'light' : 'dark'); } catch {}
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

  const PANEL_TITLES = { journey: 'Journey', bench: 'On the bench', files: 'Files' };
</script>

<div class="side">
  <div class="activity" role="toolbar" aria-label="Activity">
    <span class="act-mark" title="MakerLord">M<span>L</span></span>
    <button class="act-btn" class:on={panelOpen && activity === 'journey'}
      aria-label="Journey" title="Journey" onclick={() => pick('journey')}>⑃</button>
    <button class="act-btn" class:on={panelOpen && activity === 'bench'}
      aria-label="On the bench" title="On the bench" onclick={() => pick('bench')}>▤</button>
    <button class="act-btn" class:on={panelOpen && activity === 'files'}
      aria-label="Files" title="Files" onclick={() => pick('files')}>🗎</button>
    {#if app.projectId}
      <a class="act-btn" aria-label="Library and inventory" title="Library & inventory"
        href={`/library?p=${app.projectId}`}>⧉</a>
    {/if}
    <span class="act-space"></span>
    <button class="act-btn" onclick={toggleTheme}
      title="light / dark" aria-label="Toggle colour theme">◐</button>
    <a class="act-btn" aria-label="Settings" title="Settings" href="/settings">⚙</a>
    {#if page.data.handle}
      <a class="act-btn act-user" aria-label="Account" title={`◉ ${page.data.handle} — settings`}
        href="/settings">{page.data.handle.slice(0, 1).toUpperCase()}</a>
    {/if}
  </div>

  {#if panelOpen || isMobile}
    <nav class="rail" class:open={railOpen} aria-label="Project">
      <div class="rail-top">
        <div class="wordmark">Maker<span>Lord</span></div>
        <button class="rail-toggle mono" aria-expanded={railOpen}
          onclick={() => (railOpen = !railOpen)}>
          {String(current).padStart(2, '0')} {STAGE_NAMES[current - 1]} ▾
        </button>
      </div>
      <p class="panel-title mono">{PANEL_TITLES[activity]}</p>

      <div class="tree">
        {#if activity === 'journey'}
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
          {#if app.projectId}
            <button class="stage new-project" onclick={newProject}>⇤ projects</button>
          {/if}
        {:else if activity === 'bench'}
          {#if app.projectId && project}
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
            {#if project.requirements.length === 0 && project.architecture.blocks.length === 0 && project.inventory.length === 0}
              <p class="empty">Nothing settled yet — it fills in as you talk.</p>
            {/if}
          {:else}
            <p class="empty">No project on the bench.</p>
          {/if}
        {:else if activity === 'files'}
          {#if app.projectId}
            {#each fileGroups as [group, files]}
              <details class="tree-sec" open={group === 'Design documents' || group === 'Firmware'}>
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
          {:else}
            <p class="empty">Start a project to see its files.</p>
          {/if}
        {/if}
      </div>
    </nav>
  {/if}
</div>

<style>
  .side { display: flex; min-height: 0; gap: var(--s2); }

  /* ── the activity bar: icons, one decision each ── */
  .activity {
    display: flex; flex-direction: column; align-items: center;
    gap: var(--s2); padding: var(--s1) 0;
    width: 2.1rem; flex-shrink: 0;
  }
  .act-mark {
    font-weight: 800; font-size: var(--t-sm); letter-spacing: -0.04em;
    margin-bottom: var(--s2); color: var(--ink); cursor: default;
  }
  .act-mark span { color: var(--mask); }
  .act-btn {
    display: flex; align-items: center; justify-content: center;
    width: 1.8rem; height: 1.8rem; border: none; background: transparent;
    border-radius: var(--r-sm); cursor: pointer; font-size: 0.95rem;
    color: var(--ink-soft); text-decoration: none; line-height: 1;
  }
  .act-btn:hover { background: var(--hover-bg); color: var(--ink); }
  .act-btn.on {
    background: var(--panel); color: var(--mask);
    box-shadow: inset 2px 0 0 var(--mask);
  }
  .act-space { flex: 1; }
  .act-user {
    font-family: var(--font-mono); font-size: var(--t-xs); font-weight: 600;
    border: 1px solid var(--line); border-radius: 50%;
  }

  /* ── the panel: one thing at a time ── */
  .rail { display: flex; flex-direction: column; min-width: 13rem; max-width: 14.5rem; }
  .tree { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
  .rail-top { display: flex; align-items: baseline; justify-content: space-between; }
  .rail-toggle { display: none; }
  .stage-list { display: flex; flex-direction: column; gap: 1px; }
  .wordmark {
    font-weight: 800; font-size: 1.05rem; letter-spacing: -0.02em;
    margin: 0 0 var(--s1) var(--s1);
  }
  .wordmark span { color: var(--mask); }
  .panel-title {
    font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--ink-soft); opacity: 0.75; margin: 0 0 var(--s2) var(--s1);
  }

  /* ── the metro line ── */
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
  .new-project { margin-top: var(--s3); }

  /* ── tree sections (bench + files panels) ── */
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
    .side { flex-direction: column; }
    .activity { flex-direction: row; width: auto; padding: 0; }
    .act-space { display: none; }
    .rail { max-width: none; }
    .rail-toggle {
      display: inline-block; border: 1px solid var(--line); background: var(--panel);
      border-radius: 6px; padding: 0.35rem 0.6rem; font-size: var(--t-xs);
      cursor: pointer; color: var(--ink);
    }
    .wordmark { margin-bottom: 0; }
    .panel-title { display: none; }
    .stage-list { display: none; }
    .rail.open .stage-list { display: block; margin-top: var(--s2); }
    .rail.open .segment { display: flex; flex-flow: row wrap; gap: 0.15rem; }
    .rail.open .segment .stage { width: auto; align-self: flex-start; }
  }
</style>
