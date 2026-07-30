<script>
  import { toast } from 'svelte-sonner';
  import { STAGE_PURPOSE } from '$lib/postures.js';
  import { api, app, sendPrompt, bridgeConnect, bridgePair, store } from '$lib/app.svelte.js';
  import { Dialog, Field } from '$lib/kit/index.js';
  import MessageList from './MessageList.svelte';

  /** BYOK (2026-07-31): the maker's own provider drives the same engine. */
  const PROVIDERS = [
    ['anthropic', 'Anthropic (your key)'], ['openai', 'OpenAI'], ['google', 'Google'],
    ['mistral', 'Mistral'], ['groq', 'Groq'], ['openrouter', 'OpenRouter'],
    ['deepseek', 'DeepSeek'], ['xai', 'xAI'], ['ollama', 'Ollama (local)'], ['custom', 'Custom endpoint'],
  ];
  let providerOpen = $state(false);
  let provider = $state('openrouter');
  let model = $state('');
  let apiKey = $state('');
  let baseURL = $state('');
  let current = $state(null);

  async function loadProvider() {
    const r = await api('provider');
    current = r.status === 200 ? r.data.config : null;
    if (current) { provider = current.provider; model = current.model; }
  }

  async function saveProvider() {
    const body = { provider, model: model.trim(), apiKey: apiKey.trim() };
    if (baseURL.trim()) body.baseURL = baseURL.trim();
    const r = await api('provider', body);
    if (r.status === 200) {
      current = r.data.config;
      apiKey = '';
      providerOpen = false;
      store.del('makerlord.sessionId');   // the next message minds the new brain
      app.sessionId = null;
      toast('Provider saved — takes effect on your next message');
    } else {
      toast.error(r.data.error ?? 'could not save the provider');
    }
  }

  async function clearProvider() {
    await fetch('/app-api/provider', { method: 'DELETE' });
    current = null;
    providerOpen = false;
    store.del('makerlord.sessionId');
    app.sessionId = null;
    toast('Back to the hosted brain');
  }

  /**
   * The agent column (Cursor anatomy: the assistant lives at your right
   * hand, full height). Thread on top, verbs and composer at the foot,
   * the local brain where a model picker belongs — with the composer.
   * Anatomy follows AI Elements / assistant-ui: messages + tool status
   * cards inline, retry/edit on the last turn.
   */
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
    <button class="brain" onclick={() => { loadProvider(); providerOpen = true; }}
      title="choose the model provider — your key, your models">
      ◇ {current ? `${current.provider} · ${current.model}` : 'hosted'}
    </button>
    <button class="brain" onclick={() => bridgeConnect()}>
      <span class="lamp-dot" class:on={app.bridgeStatus === 'ready'}></span>
      {app.bridgeStatus === 'ready'
        ? `local brain ✓${app.bridgeAgent ? ` · ${app.bridgeAgent}` : ''}`
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
    <form class="composer" onsubmit={(e) => { e.preventDefault(); sendPrompt(app.promptDraft); app.promptDraft = ''; }}>
      <input bind:value={app.promptDraft} name="prompt"
        placeholder={app.turnActive ? 'steer the agent mid-turn…' : 'ask the agent…'} />
      <button class="primary send" type="submit">{app.turnActive ? 'Steer' : 'Send'}</button>
    </form>
  </footer>
</aside>

<Dialog bind:open={providerOpen} title="Model provider">
  <p class="small">Bring your own key — the engine, gates and findings stay
    identical whichever brain drives (D3/D4). Keys are encrypted at rest and
    never shown again{current ? ` · current: ${current.provider} · ${current.model} · …${current.keyTail}` : ''}.</p>
  <Field label="Provider">
    <select bind:value={provider}>
      {#each PROVIDERS as [id, label]}<option value={id}>{label}</option>{/each}
    </select>
  </Field>
  <Field label="Model" hint="e.g. gpt-5.2, gemini-3-pro, meta-llama/llama-4-maverick">
    <input bind:value={model} placeholder="model id" />
  </Field>
  <Field label="API key">
    <input bind:value={apiKey} type="password" placeholder="pasted once, stored encrypted" />
  </Field>
  {#if provider === 'custom' || provider === 'ollama'}
    <Field label="Base URL" hint="an OpenAI-compatible endpoint">
      <input bind:value={baseURL} placeholder="http://127.0.0.1:11434/v1" />
    </Field>
  {/if}
  <div class="provider-acts">
    <button class="primary" onclick={saveProvider} disabled={!model.trim() || !apiKey.trim()}>Save</button>
    {#if current}<button class="secondary" onclick={clearProvider}>Use the hosted brain</button>{/if}
  </div>
</Dialog>

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
  .provider-acts { display: flex; gap: var(--s3); margin-top: var(--s2); }
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
