<script>
  import { toast } from 'svelte-sonner';
  import { STAGE_PURPOSE } from '$lib/postures.js';
  import { app, sendPrompt, bridgeConnect, bridgePair, store } from '$lib/app.svelte.js';
  import MessageList from './MessageList.svelte';

  /** BYOK (2026-07-31): the maker's provider book — the active entry
   *  answers; a picker appears in the chat once there's a real choice. */
  let providers = $state([]);
  const active = $derived(providers.find((p) => p.active) ?? null);

  async function loadProviders() {
    const r = await fetch('/app-api/providers');
    if (r.ok) providers = (await r.json()).providers;
  }

  async function switchProvider(id) {
    const r = await fetch('/app-api/providers/active', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (r.ok) {
      providers = (await r.json()).providers;
      store.del('makerlord.sessionId');
      app.sessionId = null;
      toast('Brain switched — takes effect on your next message');
    }
  }

  $effect(() => { loadProviders(); });

  let log = $state(null);

  // The column is the maker's to size — drag the left edge, kept per
  // browser. Clamped so neither the thread nor the workbench collapses.
  let width = $state(384);
  if (typeof localStorage !== 'undefined') {
    const stored = Number(localStorage.getItem('makerlord.agentWidth'));
    if (Number.isFinite(stored) && stored >= 280 && stored <= 720) width = stored;
  }

  function startResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev) => {
      width = Math.min(720, Math.max(280, startW + (startX - ev.clientX)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { localStorage.setItem('makerlord.agentWidth', String(width)); } catch {}
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  $effect(() => {
    void app.streamingText;
    void app.messages.length;
    if (log) log.scrollTop = log.scrollHeight;
  });

  const lastMaker = $derived(
    [...app.messages].reverse().find((m) => m.role === 'maker')?.text ?? '',
  );

  function retry() {
    if (lastMaker && !app.turnActive) sendPrompt(lastMaker);
  }

  function editLast() {
    if (lastMaker && !app.turnActive) app.promptDraft = lastMaker;
  }
</script>

<aside class="agent" aria-label="Agent" style={`width:${width}px`}>
  <div class="resizer" role="separator" aria-orientation="vertical"
    aria-label="Resize agent panel" onpointerdown={startResize}></div>
  <header class="agent-head">
    <span class="mono agent-title">agent</span>
    {@const driving = app.bridgeStatus === 'ready'}
    <a class="brain brain-link" class:standby={driving} href="/settings"
      title={driving
        ? 'standby — answers again when the local brain disconnects'
        : 'providers and agents — settings'}>
      ◇ {active ? `${active.provider} · ${active.model}` : 'set up a brain'}{driving && active ? ' · standby' : active ? ' · driving' : ''}
    </a>
    <button class="brain" class:driving onclick={() => bridgeConnect()}
      title={driving ? 'your local agent answers — click to disconnect' : 'connect your own agent'}>
      <span class="lamp-dot" class:on={driving}></span>
      {driving
        ? `local brain${app.bridgeAgent ? ` · ${app.bridgeAgent}` : ''} · driving`
        : '⚡ local brain'}
    </button>
  </header>

  {#if app.bridgeStatus === 'pair'}
    <div class="bridge-setup">
      <p class="small">The bridge is running — its terminal printed a 6-digit
        <strong>pairing code</strong>. Enter it once:</p>
      <form class="bridge-pair" onsubmit={(e) => { e.preventDefault(); bridgePair(); }}>
        <input bind:value={app.bridgeCodeDraft} name="paircode" placeholder="pairing code"
          inputmode="numeric" maxlength="6" />
        <button class="pair-btn" type="submit"
          disabled={app.bridgeCodeDraft.trim().length < 6}>Pair</button>
        <label class="bridge-port mono">port
          <input inputmode="numeric" bind:value={app.bridgePort} name="bridgeport" />
        </label>
      </form>
    </div>
  {/if}
  {#if app.bridgeError}<p class="bridge-err">{app.bridgeError}</p>{/if}
  {#if app.bridgeStatus === 'error'}
    <details class="bridge-help" open>
      <summary>how to set up the local brain</summary>
      <ol>
        <li>On this machine: <code>mlb</code> (installed once via
          <code>./install.sh</code>) — or <code>pnpm bridge</code> from a checkout.</li>
        <li>It auto-detects your agent — Claude Code, Codex, Gemini CLI, Goose,
          Qwen or Kimi — or takes any stdio ACP agent via <code>--agent</code>.</li>
        <li>It prints a 6-digit pairing code. Click ⚡ again and enter it.</li>
      </ol>
      <label class="bridge-port mono">port
        <input inputmode="numeric" bind:value={app.bridgePort} name="bridgeport2" />
      </label>
    </details>
  {/if}

  <div class="thread" bind:this={log}>
    {#if app.messages.length === 0 && !app.streamingText}
      <p class="thread-empty">{STAGE_PURPOSE[app.stage]}</p>
    {/if}
    <MessageList list={app.messages} streaming={app.streamingText} cursor
      onretry={(text) => { if (!app.turnActive) sendPrompt(text); }} />
    {#if app.lastError}<div class="error">{app.lastError}</div>{/if}
  </div>

  <footer class="agent-foot">
    {#if lastMaker && !app.turnActive}
      <div class="verbs">
        <button class="verb" onclick={retry} title="send the last message again">⟳ retry</button>
        <button class="verb" onclick={editLast} title="edit the last message">✎ edit</button>
      </div>
    {/if}
    {#if providers.length > 1}
      <select class="brain-pick mono" aria-label="Active model provider"
        value={active?.id} onchange={(e) => switchProvider(e.currentTarget.value)}>
        {#each providers as p (p.id)}
          <option value={p.id}>{p.provider} · {p.model}</option>
        {/each}
      </select>
    {/if}
    <form class="composer" onsubmit={(e) => { e.preventDefault(); sendPrompt(app.promptDraft); app.promptDraft = ''; }}>
      <input bind:value={app.promptDraft} name="prompt"
        placeholder={app.turnActive ? 'steer the agent mid-turn…' : 'ask the agent…'} />
      <button class="primary send" type="submit">{app.turnActive ? 'Steer' : 'Send'}</button>
    </form>
  </footer>
</aside>



<style>
  .agent {
    width: 24rem; min-width: 17.5rem; display: flex; flex-direction: column;
    min-height: 0; background: var(--panel); border-radius: var(--r-lg);
    box-shadow: var(--shadow-1); padding: var(--s3);
    position: relative; flex-shrink: 0;
  }
  .resizer {
    position: absolute; left: -5px; top: 0; bottom: 0; width: 10px;
    cursor: col-resize; touch-action: none; z-index: 5;
  }
  .resizer:hover, .resizer:active { background: color-mix(in srgb, var(--mask) 25%, transparent); border-radius: 3px; }
  .agent-head {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--line); padding-bottom: var(--s2);
    margin-bottom: var(--s2);
  }
  .agent-title {
    font-size: var(--t-xs); letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--ink-soft);
  }
  .brain {
    border: none; background: transparent; cursor: pointer;
    font-size: var(--t-xs); color: var(--ink-soft); padding: var(--s1);
    border-radius: var(--r-sm);
  }
  .brain:hover { color: var(--ink); background: var(--mat); }
  .lamp-dot {
    width: 7px; height: 7px; border-radius: 50%; background: #9aa5a0;
    display: inline-block; margin-right: var(--s1);
  }
  .lamp-dot.on { background: #19c37d; box-shadow: 0 0 6px #19c37d; }

  .bridge-setup, .bridge-help { font-size: var(--t-xs); color: var(--ink-soft); }
  .bridge-pair { display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap; }
  .bridge-pair input, .bridge-port input {
    font-family: var(--font-mono); font-size: var(--t-sm);
    padding: var(--s1) var(--s2); border: 1px solid var(--line); border-radius: var(--r-sm);
  }
  .bridge-pair input[name='paircode'] { width: 8rem; letter-spacing: 0.2em; }
  .pair-btn {
    background: var(--mask); color: white; border: none; cursor: pointer;
    padding: var(--s1) var(--s3); border-radius: var(--r-sm);
    font-size: var(--t-sm); font-weight: 600;
  }
  .pair-btn:hover:not(:disabled) { background: var(--mask-deep); }
  .pair-btn:disabled { opacity: 0.45; cursor: default; }
  .bridge-port { display: inline-flex; align-items: center; gap: var(--s1); }
  .bridge-port input { width: 4rem; }
  .bridge-err { font-size: var(--t-xs); color: var(--danger-ink); margin: var(--s1) 0; }
  .bridge-help summary { cursor: pointer; color: var(--mask); padding: var(--s1) 0; }
  .bridge-help ol { margin: var(--s1) 0; padding-left: 1.1rem; }
  .bridge-help li { margin: var(--s1) 0; }
  .bridge-help code {
    font-family: var(--font-mono); font-size: 0.62rem; background: var(--code-bg);
    padding: 0 var(--s1); border-radius: 3px;
  }

  .thread {
    flex: 1; min-height: 0; overflow-y: auto; display: flex;
    flex-direction: column; gap: var(--s2); padding: var(--s2) var(--s1);
    font-size: var(--t-sm);
  }
  .thread-empty { color: var(--ink-soft); font-size: var(--t-sm); margin: var(--s2) var(--s1); }

  .agent-foot { border-top: 1px solid var(--line); padding-top: var(--s2); }
  .brain-link { text-decoration: none; }
  .brain-link.standby { opacity: 0.55; }
  .brain.driving { color: var(--mask); font-weight: 600; }
  .brain-pick {
    width: 100%; margin-bottom: var(--s1); font-size: var(--t-xs);
    padding: var(--s1) var(--s2); border: 1px solid var(--line);
    border-radius: var(--r-sm); background: var(--panel); color: var(--ink);
  }
  .verbs { display: flex; gap: var(--s3); margin-bottom: var(--s1); }
  .verb {
    border: none; background: transparent; cursor: pointer;
    font-size: var(--t-xs); color: var(--ink-soft); padding: 0;
  }
  .verb:hover { color: var(--mask); }
  .composer { display: flex; gap: var(--s2); }
  .composer input {
    width: 100%; font-size: var(--t-md); padding: var(--s2) var(--s3);
    box-sizing: border-box; font-family: var(--font-body);
    border: 1.5px solid var(--line); border-radius: var(--r-md);
    background: var(--panel);
  }
  .composer input:focus { border-color: var(--mask); outline: none; }
  .send {
    background: var(--mask); color: white; border: none; cursor: pointer;
    padding: var(--s2) var(--s4); border-radius: var(--r-md); font-weight: 600;
  }
  .send:hover { background: var(--mask-deep); }

  @media (max-width: 1100px) {
    .agent { width: 100% !important; min-width: 0; max-height: 45vh; }
    .resizer { display: none; }
  }
</style>
