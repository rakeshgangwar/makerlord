<script>
  import { app } from '$lib/app.svelte.js';
  import { md } from '$lib/md.js';
  import SvgViewer from '$lib/SvgViewer.svelte';
</script>

{#if app.fileOpen}
  <!-- Files get their own room: a workspace-wide viewer, not a sidebar squeeze. -->
  <div class="file-overlay" role="dialog" aria-label={app.fileOpen.path}>
    <div class="file-box">
      <header class="file-head">
        <span class="mono">{app.fileOpen.path}</span>
        <button class="file-close" onclick={() => (app.fileOpen = null)}>✕ close</button>
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
  </div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.fileOpen = null)} />

<style>
  .file-overlay {
    position: fixed; inset: 0; z-index: 40; display: flex;
    align-items: center; justify-content: center;
    background: rgb(14 20 17 / 45%);
  }
  .file-box {
    display: flex; flex-direction: column;
    width: min(1100px, 94vw); height: 88vh;
    background: var(--panel, #fff); border-radius: 10px;
    box-shadow: 0 12px 40px rgb(10 14 12 / 35%); overflow: hidden;
  }
  .file-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.6rem 1rem; border-bottom: 1px solid var(--line);
    font-size: 0.8rem;
  }
  .file-close {
    border: 1px solid var(--line); background: transparent; cursor: pointer;
    font-family: var(--font-mono); font-size: 0.7rem; padding: 0.25rem 0.6rem;
    border-radius: 4px;
  }
  .file-close:hover { color: var(--mask); border-color: var(--mask); }
  .file-body { flex: 1; overflow: auto; padding: 1rem 1.25rem; }
  .file-body.is-svg { padding: 0; overflow: hidden; }
  .file-raw {
    font-family: var(--font-mono); font-size: 0.68rem; line-height: 1.5;
    background: #f4f5f6; border: 1px solid var(--line);
    border-radius: 4px; padding: 0.6rem; overflow: auto;
    white-space: pre-wrap; word-break: break-all;
  }
  .file-doc { font-size: 0.85rem; max-width: 46rem; }
</style>
