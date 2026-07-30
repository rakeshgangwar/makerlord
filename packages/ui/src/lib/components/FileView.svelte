<script>
  import { app } from '$lib/app.svelte.js';
  import { md } from '$lib/md.js';
  import SvgViewer from '$lib/SvgViewer.svelte';

  /**
   * A file opens in the workbench, like an editor tab — not a modal.
   * The tree stays clickable, the agent stays at hand; ✕ (or Escape)
   * returns to the stage lens (2026-07-31 feedback).
   */
</script>

{#if app.fileOpen}
  <div class="file-view">
    <header class="file-head">
      <span class="mono">{app.fileOpen.path}</span>
      <button class="file-close mono" onclick={() => (app.fileOpen = null)}>✕ close</button>
    </header>
    <div class="file-body" class:is-svg={app.fileOpen.path.endsWith('.svg')}>
      {#if app.fileOpen.path.endsWith('.md')}
        <div class="md file-doc">{@html md(app.fileOpen.content)}</div>
      {:else if app.fileOpen.path.endsWith('.svg')}
        <SvgViewer content={app.fileOpen.content} alt={app.fileOpen.path} />
      {:else}
        <pre class="file-raw">{app.fileOpen.content}</pre>
      {/if}
    </div>
  </div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.fileOpen = null)} />

<style>
  .file-view {
    display: flex; flex-direction: column; height: 100%; min-height: 0;
    background: var(--panel); border-radius: var(--r-lg);
    box-shadow: var(--shadow-1); overflow: hidden;
  }
  .file-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--s2) var(--s4); border-bottom: 1px solid var(--line);
    font-size: var(--t-sm);
  }
  .file-close {
    border: 1px solid var(--line); background: transparent; cursor: pointer;
    font-size: var(--t-xs); padding: var(--s1) var(--s2);
    border-radius: var(--r-sm); color: var(--ink-soft);
  }
  .file-close:hover { color: var(--mask); border-color: var(--mask); }
  .file-body { flex: 1; overflow: auto; padding: var(--s4) var(--s5); }
  .file-body.is-svg { padding: 0; overflow: hidden; }
  .file-raw {
    font-family: var(--font-mono); font-size: var(--t-xs); line-height: 1.5;
    background: var(--code-bg); border: 1px solid var(--line);
    border-radius: var(--r-sm); padding: var(--s3); overflow: auto;
    white-space: pre-wrap; word-break: break-all; margin: 0;
  }
  .file-doc { font-size: var(--t-sm); max-width: 46rem; }
</style>
