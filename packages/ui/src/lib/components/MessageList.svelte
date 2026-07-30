<script>
  import { md } from '$lib/md.js';

  /** @type {{list: {role: string, text: string}[], streaming?: string, cursor?: boolean}} */
  let { list, streaming = '', cursor = false } = $props();
</script>

{#each list as m}
  {#if m.role === 'tool'}
    <div class="tool-card" class:refused={m.refused} class:running={!m.done}>
      <span class="tool-state mono" aria-hidden="true">
        {m.done ? (m.refused ? '⛔' : '✓') : '◌'}
      </span>
      <span class="tool-name mono">{m.name}</span>
      <span class="tool-badge mono" class:bad={m.refused}>
        {m.done ? (m.refused ? m.refused : 'done') : 'running'}
      </span>
    </div>
    {#if m.refused}
      <p class="tool-refusal">The engine refused this — the finding strip below
        has the rule and the fix.</p>
    {/if}
  {:else}
    <div class="msg {m.role}">
      <span class="who">{m.role}</span>
      {#if m.role === 'agent'}<div class="md">{@html md(m.text)}</div>{:else}{m.text}{/if}
    </div>
  {/if}
{/each}
{#if streaming}
  <div class="msg agent streaming">
    <span class="who">agent</span>
    <div class="md">{@html md(streaming)}</div>
    {#if cursor}<span class="cursor"></span>{/if}
  </div>
{/if}

<style>
  .msg {
    padding: 0.7rem 0.95rem; border-radius: var(--r-lg); white-space: pre-wrap;
    background: var(--panel); box-shadow: 0 1px 2px rgb(20 24 27 / 6%);
  }
  .msg.maker { background: var(--maker-bubble); align-self: flex-end; border-radius: var(--r-lg) 10px 2px 10px; }
  .msg.agent { border-radius: var(--r-lg) 10px 10px 2px; }
  .msg .who {
    display: block; font-family: var(--font-mono); font-size: 0.62rem;
    letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft);
    margin-bottom: 0.2rem;
  }
  .cursor {
    display: inline-block; width: 0.5em; height: 1em; margin-left: 2px;
    background: var(--mask); vertical-align: text-bottom;
    animation: blink 1s steps(2) infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }

  /* ── tool calls, inline where they fired (AI Elements anatomy) ── */
  .tool-card {
    display: flex; align-items: center; gap: var(--s2);
    background: var(--mat); border: 1px solid var(--line);
    border-radius: var(--r-sm); padding: var(--s1) var(--s2);
  }
  .tool-card.running { border-style: dashed; }
  .tool-card.refused { border-color: var(--sev-blocker); background: var(--danger-bg); }
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
