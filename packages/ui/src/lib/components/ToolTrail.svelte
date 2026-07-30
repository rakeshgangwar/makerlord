<script>
  import { app } from '$lib/app.svelte.js';

  /**
   * Tool calls as status cards (the AI Elements Tool anatomy): name +
   * state badge, refusals loud and open. What the engine did is part of
   * the conversation, not a footnote under it.
   */
  let { activity = null } = $props();
  const list = $derived(activity ?? app.toolActivity);
</script>

{#if list.length > 0}
  <div class="tools">
    {#each list as t}
      <div class="tool-card" class:refused={t.refused} class:running={!t.done}>
        <span class="tool-state mono" aria-hidden="true">
          {t.done ? (t.refused ? '⛔' : '✓') : '◌'}
        </span>
        <span class="tool-name mono">{t.name}</span>
        <span class="tool-badge mono" class:bad={t.refused}>
          {t.done ? (t.refused ? t.refused : 'done') : 'running'}
        </span>
      </div>
      {#if t.refused}
        <p class="tool-refusal">The engine refused this — the finding strip below
          has the rule and the fix.</p>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .tools { display: flex; flex-direction: column; gap: var(--s1); }
  .tool-card {
    display: flex; align-items: center; gap: var(--s2);
    background: var(--mat); border: 1px solid var(--line);
    border-radius: var(--r-sm); padding: var(--s1) var(--s2);
  }
  .tool-card.running { border-style: dashed; }
  .tool-card.refused { border-color: var(--sev-blocker); background: #fdf3f1; }
  .tool-state { font-size: var(--t-xs); }
  .tool-card.running .tool-state { color: var(--copper-ink); }
  .tool-card.refused .tool-state { color: var(--sev-blocker); }
  .tool-name { flex: 1; font-size: var(--t-xs); color: var(--ink); }
  .tool-badge {
    font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--ink-soft);
  }
  .tool-badge.bad { color: var(--sev-blocker); font-weight: 600; }
  .tool-refusal { font-size: var(--t-xs); color: var(--sev-blocker); margin: 0 0 var(--s1) var(--s4); }
</style>
