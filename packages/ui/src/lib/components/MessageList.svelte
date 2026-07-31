<script>
  import { toast } from 'svelte-sonner';
  import { md } from '$lib/md.js';

  /**
   * The thread: maker/agent messages and tool status cards, in the
   * order they happened. Tool cards expand to their input and result
   * (AI Elements anatomy — refusals ship open); messages carry hover
   * actions (copy everywhere, retry on maker turns — assistant-ui).
   */
  let { list, streaming = '', cursor = false, onretry = null } = $props();

  /** Consecutive completed calls of the same tool collapse into one
   *  row (place ✓ ×14) — refusals and in-flight calls always stand
   *  alone. Grouping is display-only; the timeline stays intact. */
  const rows = $derived.by(() => {
    const out = [];
    for (const m of list) {
      const groupable = m.role === 'tool' && m.done && !m.refused;
      const prev = out[out.length - 1];
      if (groupable && prev?.kind === 'group' && prev.name === m.name) {
        prev.items.push(m);
      } else if (groupable) {
        out.push({ kind: 'group', name: m.name, items: [m] });
      } else {
        out.push({ kind: 'one', m });
      }
    }
    // Second pass: contiguous completed activity folds into one
    // accordion block — the chat foregrounds words; the work is a
    // click away. Running calls and refusals never fold.
    const blocks = [];
    for (const row of out) {
      const doneTool = row.kind === 'group'
        || (row.kind === 'one' && row.m.role === 'tool' && row.m.done && !row.m.refused);
      const prev = blocks[blocks.length - 1];
      if (doneTool && prev?.kind === 'block') prev.rows.push(row);
      else if (doneTool) blocks.push({ kind: 'block', rows: [row] });
      else blocks.push(row);
    }
    for (const b of blocks) {
      if (b.kind === 'block') {
        b.count = b.rows.reduce((n, r) => n + (r.kind === 'group' ? r.items.length : 1), 0);
      }
    }
    return blocks;
  });

  function copyText(text) {
    navigator.clipboard?.writeText(text);
    toast('Copied');
  }

  /** Adapter plumbing stays out of the maker's eyes: MCP-prefixed
   *  names render as the tool they are. */
  function toolName(name) {
    return String(name ?? '').replace(/^mcp__[a-z0-9_-]+?__/i, '');
  }

  /** Compact JSON for the card body — evidence, not a firehose. */
  function fmt(x) {
    if (x === null || x === undefined) return '';
    const s = typeof x === 'string' ? x : JSON.stringify(x, null, 1);
    return s.length > 700 ? `${s.slice(0, 700)}\n…` : s;
  }
</script>

{#snippet toolCard(m)}
  <details class="tool-card" class:refused={m.refused} class:running={!m.done} open={!!m.refused}>
    <summary>
      <span class="tool-state mono" aria-hidden="true">
        {m.done ? (m.refused ? '⛔' : '✓') : '◌'}
      </span>
      <span class="tool-name mono">{toolName(m.name)}</span>
      <span class="tool-badge mono" class:bad={m.refused}>
        {m.done ? (m.refused ? m.refused : 'done') : 'running'}
      </span>
    </summary>
    {#if m.input !== undefined && m.input !== null && fmt(m.input) !== '{}'}
      <p class="tool-io-label mono">input</p>
      <pre class="tool-io mono">{fmt(m.input)}</pre>
    {/if}
    {#if m.result !== undefined && m.result !== null && fmt(m.result) !== '{}'}
      <p class="tool-io-label mono">{m.refused ? 'findings' : 'result'}</p>
      <pre class="tool-io mono">{fmt(m.result)}</pre>
    {/if}
    {#if m.refused}
      <p class="tool-refusal">The engine refused this — the finding strip below
        has the rule and the fix.</p>
    {/if}
  </details>
{/snippet}

{#snippet groupRow(row)}
  {#if row.kind === 'group' && row.items.length > 1}
    <details class="tool-card tool-group">
      <summary>
        <span class="tool-state mono" aria-hidden="true">✓</span>
        <span class="tool-name mono">{toolName(row.name)} <span class="tool-count">×{row.items.length}</span></span>
        <span class="tool-badge mono">done</span>
      </summary>
      <div class="group-items">
        {#each row.items as m}{@render toolCard(m)}{/each}
      </div>
    </details>
  {:else if row.kind === 'group'}
    {@render toolCard(row.items[0])}
  {:else}
    {@render toolCard(row.m)}
  {/if}
{/snippet}

{#each rows as row}
  {#if row.kind === 'block'}
    {#if row.count === 1}
      {@render groupRow(row.rows[0])}
    {:else}
      <details class="tool-card tool-block">
        <summary>
          <span class="tool-state mono" aria-hidden="true">⚙</span>
          <span class="tool-name mono">{row.count} tool calls</span>
          <span class="tool-badge mono">done</span>
        </summary>
        <div class="group-items">
          {#each row.rows as r}{@render groupRow(r)}{/each}
        </div>
      </details>
    {/if}
  {:else if row.m.role === 'tool'}
    {@render toolCard(row.m)}
  {:else}
    {@const m = row.m}
    <div class="msg {m.role}">
      <span class="who">{m.role}</span>
      {#if m.role === 'agent'}<div class="md">{@html md(m.text)}</div>{:else}{m.text}{/if}
      <span class="acts">
        <button class="act" title="copy" onclick={() => copyText(m.text)}>⧉</button>
        {#if m.role === 'maker' && onretry}
          <button class="act" title="send this again" onclick={() => onretry(m.text)}>⟳</button>
        {/if}
      </span>
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
    position: relative;
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

  /* ── hover actions (assistant-ui ActionBar) ── */
  .acts {
    position: absolute; right: 0.4rem; top: 0.3rem; display: none; gap: 0.2rem;
  }
  .msg:hover .acts, .msg:focus-within .acts { display: inline-flex; }
  .act {
    border: 1px solid var(--line); background: var(--panel); cursor: pointer;
    font-size: var(--t-xs); color: var(--ink-soft); padding: 0.05rem 0.35rem;
    border-radius: var(--r-sm); line-height: 1.4;
  }
  .act:hover { color: var(--mask); border-color: var(--mask); }

  /* ── tool calls, inline where they fired (AI Elements anatomy) ── */
  .tool-card {
    background: var(--mat); border: 1px solid var(--line);
    border-radius: var(--r-sm); padding: var(--s1) var(--s2);
  }
  .tool-card > summary {
    display: flex; align-items: center; gap: var(--s2); cursor: pointer;
    list-style: none;
  }
  .tool-card > summary::-webkit-details-marker { display: none; }
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
  .tool-io-label {
    font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink-soft); margin: var(--s2) 0 0.1rem;
  }
  .tool-io {
    font-size: 0.62rem; line-height: 1.5; background: var(--code-bg);
    border: 1px solid var(--line); border-radius: var(--r-sm);
    padding: var(--s1) var(--s2); margin: 0; overflow-x: auto;
    white-space: pre-wrap; word-break: break-word; max-height: 14rem; overflow-y: auto;
  }
  .tool-refusal { font-size: var(--t-xs); color: var(--sev-blocker); margin: var(--s1) 0 0; }
  .tool-count { color: var(--ink-soft); }
  .group-items { display: flex; flex-direction: column; gap: var(--s1); margin-top: var(--s2); }
  .tool-block { background: transparent; border-style: dotted; }
  .tool-block > summary .tool-name { color: var(--ink-soft); }
</style>
