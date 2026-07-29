<script>
  import { app, sendPrompt } from '$lib/app.svelte.js';
  import MessageList from './MessageList.svelte';
  import ToolTrail from './ToolTrail.svelte';

  let { messages = null, streaming = null, open = null } = $props();
  const msgs = $derived(messages ?? app.messages);
  const stream = $derived(streaming ?? app.streamingText);

  /** @type {HTMLElement | null} */
  let dockLog = $state(null);

  $effect(() => {
    void app.streamingText;
    void app.messages.length;
    if (dockLog) dockLog.scrollTop = dockLog.scrollHeight;
  });
  $effect(() => {
    // Streaming latches the log open — the answer must not vanish with the
    // turn; only the maker's ▾ closes it.
    if (app.streamingText) app.dockOpen = true;
  });

  const showLog = $derived(open ?? (app.dockOpen || app.turnActive || !!stream));
</script>

<div class="dock" class:open={showLog}>
  {#if showLog}
    <div class="dock-log" bind:this={dockLog}>
      <MessageList list={msgs.slice(-4)} streaming={stream} />
      <ToolTrail />
    </div>
  {/if}
  <form class="composer dock-composer" onsubmit={(e) => { e.preventDefault(); sendPrompt(app.promptDraft); app.promptDraft = ''; }}>
    <button type="button" class="dock-toggle" aria-label={app.dockOpen ? 'collapse conversation' : 'expand conversation'}
      onclick={() => (app.dockOpen = !app.dockOpen)}>{showLog ? '▾' : '▴'}</button>
    <input bind:value={app.promptDraft} name="dockprompt"
      placeholder={app.turnActive ? 'steer the agent mid-turn…' : 'ask the agent…'} />
    <button class="primary" type="submit">{app.turnActive ? 'Steer' : 'Send'}</button>
  </form>
</div>

<style>
  /* ── the dock: chat follows the maker to every posture ── */
  .dock {
    position: sticky; bottom: 0.6rem; margin-top: 0.9rem; align-self: stretch;
    max-width: 46rem; background: var(--panel);
    border: 1px solid var(--line); border-radius: 10px;
    padding: 0.45rem 0.6rem; box-shadow: 0 4px 18px rgb(20 24 27 / 12%);
  }
  .dock-log {
    max-height: 38vh; overflow-y: auto; display: flex; flex-direction: column;
    gap: 0.5rem; padding: 0.3rem 0.2rem 0.5rem; font-size: 0.88rem;
  }
  .dock-composer { display: flex; gap: 0.5rem; margin-top: 0; }
  .dock-composer input {
    width: 100%; font-size: 1.05rem; padding: 0.85rem; box-sizing: border-box;
    font-family: var(--font-body); border: 1.5px solid var(--line);
    border-radius: 8px; background: var(--panel);
  }
  .dock-composer input:focus { border-color: var(--mask); outline: none; }
  .dock-composer .primary { margin-top: 0; }
  .dock-toggle {
    border: 1px solid var(--line); background: transparent; border-radius: 6px;
    padding: 0 0.55rem; cursor: pointer; color: var(--ink-soft);
  }
  .dock-toggle:hover { color: var(--mask); border-color: var(--mask); }
</style>
