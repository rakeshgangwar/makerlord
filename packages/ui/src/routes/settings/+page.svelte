<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { Dialog, Field } from '$lib/kit/index.js';

  /**
   * Settings: the maker's brains. Two roads, both ending at the same
   * engine and the same gates (D3/D4): hosted providers on their own
   * keys, or a local ACP agent on their own subscription.
   */
  const PROVIDERS = [
    ['anthropic', 'Anthropic'], ['openai', 'OpenAI'], ['google', 'Google'],
    ['mistral', 'Mistral'], ['groq', 'Groq'], ['openrouter', 'OpenRouter'],
    ['deepseek', 'DeepSeek'], ['xai', 'xAI'], ['ollama', 'Ollama (local)'],
    ['custom', 'Custom endpoint'],
  ];

  let providers = $state([]);
  let provider = $state('openrouter');
  let model = $state('');
  let apiKey = $state('');
  let baseURL = $state('');
  let busy = $state(false);
  let tokenDialogOpen = $state(false);
  let mintedToken = $state('');

  async function refresh() {
    const r = await fetch('/app-api/providers');
    if (r.ok) providers = (await r.json()).providers;
  }

  async function add(e) {
    e.preventDefault();
    busy = true;
    const body = { provider, model: model.trim(), apiKey: apiKey.trim() };
    if (baseURL.trim()) body.baseURL = baseURL.trim();
    const r = await fetch('/app-api/providers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    busy = false;
    if (r.ok) {
      providers = data.providers;
      model = ''; apiKey = ''; baseURL = '';
      toast('Provider added');
    } else toast.error(data.error ?? 'could not add the provider');
  }

  async function activate(id) {
    const r = await fetch('/app-api/providers/active', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (r.ok) {
      providers = (await r.json()).providers;
      localStorage.removeItem('makerlord.sessionId');
      toast('Active brain switched — takes effect on your next message');
    }
  }

  async function remove(id) {
    const r = await fetch(`/app-api/providers/${id}`, { method: 'DELETE' });
    if (r.ok) providers = (await r.json()).providers;
  }

  async function mintBridgeToken() {
    const r = await fetch('/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'bridge' }),
    });
    const body = await r.json();
    if (r.ok) { mintedToken = body.token; tokenDialogOpen = true; }
  }

  onMount(refresh);
</script>

<svelte:head><title>Settings — MakerLord</title></svelte:head>

<main class="settings">
  <header class="head">
    <h1>Settings</h1>
    <a class="back mono" href="/">← back to the bench</a>
  </header>

  <section class="card">
    <h2>Model providers</h2>
    <p class="small">Bring your own keys — the engine, gates and findings are
      identical whichever brain drives. Keys are encrypted at rest and shown
      never again. The <strong>active</strong> provider answers your messages;
      switch here or from the picker in the chat.</p>

    {#if providers.length > 0}
      <ul class="provider-list">
        {#each providers as p (p.id)}
          <li class="provider-row" class:is-active={p.active}>
            <label class="pick">
              <input type="radio" name="active" checked={p.active}
                onchange={() => activate(p.id)} />
              <span class="mono">{p.provider}</span> · {p.model}
              <span class="mono small">…{p.keyTail}</span>
              {#if p.active}<span class="mono active-chip">active</span>{/if}
            </label>
            <button class="remove" title="remove this provider"
              onclick={() => remove(p.id)}>✕</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">No providers yet — add one below, or connect a local
        brain instead.</p>
    {/if}

    <form class="add-form" onsubmit={add}>
      <div class="grid">
        <Field label="Provider">
          <select bind:value={provider}>
            {#each PROVIDERS as [id, label]}<option value={id}>{label}</option>{/each}
          </select>
        </Field>
        <Field label="Model" hint="e.g. gpt-5.2 · gemini-3-pro · kimi-k2 · meta-llama/llama-4">
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
      </div>
      <button class="primary" type="submit" disabled={busy || !model.trim() || !apiKey.trim()}>
        Add provider
      </button>
    </form>
  </section>

  <section class="card">
    <h2>Local brains — ACP agents</h2>
    <p class="small">Run a coding agent you already pay for — Claude Code,
      Codex, Gemini CLI, Goose, Qwen Code or Kimi CLI — on your own machine,
      driving this project. Every tool call still executes on the hosted
      engine: the gates cannot be talked past, whoever drives.</p>

    <ol class="acp-steps">
      <li>
        <strong>Mint your bridge token</strong> — it authenticates the bridge
        as you.
        <button class="secondary sm" onclick={mintBridgeToken}>Mint a bridge token</button>
      </li>
      <li>
        <strong>Install the bridge</strong> on the machine where your agent
        runs (one time):
        <pre class="mono cmd">curl -fsSL https://makerlord.dev/install.sh | bash -s -- --token &lt;your mlt_… token&gt;</pre>
        This installs <code>mlb</code> and writes the token to
        <code>~/.makerlord/bridge.json</code> (0600). Needs node ≥ 20.
      </li>
      <li>
        <strong>Start it</strong>: run <code>mlb</code>. It auto-detects your
        agent — or takes any stdio ACP agent explicitly via
        <code>mlb --agent &lt;command&gt;</code> — and prints a 6-digit
        <strong>pairing code</strong>.
      </li>
      <li>
        <strong>Pair from the bench</strong>: click <code>⚡ local brain</code>
        in the agent column, enter the code once (port defaults to 8790).
        The lamp turns green; your messages now drive your own agent.
      </li>
    </ol>
    <p class="small">Troubleshooting: <code>mlb --help</code> lists detected
      agents · a red lamp with an error means the bridge isn't reachable on
      the port — check it's running and the port matches · re-pairing is
      always safe.</p>
  </section>
</main>

<Dialog bind:open={tokenDialogOpen} title="Your bridge token">
  <p class="small">Shown <strong>once</strong> — pass it to
    <code>./install.sh --token …</code> on the machine that runs your agent.</p>
  <code class="mono token-value">{mintedToken}</code>
  <button class="primary" onclick={() => { navigator.clipboard?.writeText(mintedToken); mintedToken = ''; tokenDialogOpen = false; }}>
    Copy &amp; close
  </button>
</Dialog>

<style>
  .settings { max-width: 46rem; margin: 0 auto; padding: var(--s5) var(--s4) var(--s6); }
  .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--s4); }
  h1 { margin: 0; font-size: var(--t-xl); }
  .back { color: var(--mask); text-decoration: none; font-size: var(--t-sm); }
  .card {
    background: var(--panel); border-radius: var(--r-lg); box-shadow: var(--shadow-1);
    padding: var(--s4) var(--s5); margin-bottom: var(--s4);
  }
  h2 { margin: 0 0 var(--s2); font-size: var(--t-lg); }

  .provider-list { list-style: none; padding: 0; margin: var(--s3) 0; }
  .provider-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--s2) var(--s3); border: 1px solid var(--line);
    border-radius: var(--r-md); margin-bottom: var(--s2);
  }
  .provider-row.is-active { border-color: var(--mask); }
  .pick { display: flex; align-items: baseline; gap: var(--s2); cursor: pointer; font-size: var(--t-md); }
  .pick input { width: auto; }
  .active-chip {
    font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.04em;
    background: var(--ok-bg); color: var(--ok-ink); padding: 0 var(--s2);
    border-radius: var(--r-sm);
  }
  .remove {
    border: none; background: transparent; cursor: pointer;
    color: var(--ink-soft); font-size: var(--t-sm); padding: var(--s1);
  }
  .remove:hover { color: var(--sev-blocker); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--s4); }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }

  .acp-steps { padding-left: 1.2rem; font-size: var(--t-md); }
  .acp-steps li { margin: var(--s3) 0; }
  .acp-steps .secondary.sm { margin-left: var(--s2); font-size: var(--t-sm); padding: var(--s1) var(--s3); }
  .cmd {
    background: var(--code-bg); border: 1px solid var(--line);
    border-radius: var(--r-sm); padding: var(--s2) var(--s3);
    font-size: var(--t-xs); overflow-x: auto; margin: var(--s2) 0;
  }
  code { font-family: var(--font-mono); font-size: 0.85em; background: var(--code-bg); padding: 0 0.25em; border-radius: 3px; }
  .token-value {
    display: block; word-break: break-all; font-size: var(--t-xs);
    background: var(--code-bg); padding: var(--s2) var(--s3);
    border-radius: var(--r-sm); margin: var(--s3) 0;
  }
</style>
