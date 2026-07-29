<script>
  import { app } from '$lib/app.svelte.js';
</script>

{#if app.toolActivity.length > 0}
  <div class="tools">
    {#each app.toolActivity as t}
      <span class="tool" class:refused={t.refused} class:running={!t.done}>
        {t.done ? (t.refused ? '⛔' : '✓') : '·'} {t.name}{t.refused ? ` ${t.refused}` : ''}
      </span>
    {/each}
  </div>
{/if}

<style>
  .tools { display: flex; flex-wrap: wrap; gap: 0.3rem 0.7rem; padding: 0.2rem 0.3rem; }
  .tool { font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-soft); }
  .tool.running { color: var(--copper); }
  .tool.refused { color: var(--sev-blocker); font-weight: 600; }
</style>
