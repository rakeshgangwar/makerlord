<script>
  import { page } from '$app/state';
  import { stagePhase } from '$lib/postures.js';
  import { app, gotoStage, newProject, bridgeConnect, bridgePair } from '$lib/app.svelte.js';

  let { stage = null } = $props();
  const current = $derived(stage ?? app.stage);
  // Phones get one row — the 17-chip cloud buried the hero (audit §6).
  let railOpen = $state(false);

  let mintedToken = $state('');

  async function signOut() {
    await fetch('/auth/logout', { method: 'POST' });
    location.href = '/login';
  }

  async function mintBridgeToken() {
    const res = await fetch('/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'bridge' }),
    });
    const body = await res.json();
    if (res.ok) mintedToken = body.token;
  }

  const STAGE_NAMES = [
    'Idea', 'Feasibility', 'Requirements', 'Architecture', 'Simulate',
    'Prototype ★', 'Firmware', 'Debug', 'PCB', 'Mechanical',
    'Manufacturing', 'Fabricate', 'First article', 'Test', 'Compliance',
    'Document', 'Produce',
  ];
</script>

<nav class="rail" class:open={railOpen} aria-label="Stages">
  <div class="rail-top">
    <div class="wordmark">Maker<span>Lord</span></div>
    <button class="rail-toggle mono" aria-expanded={railOpen}
      onclick={() => (railOpen = !railOpen)}>
      {String(current).padStart(2, '0')} {STAGE_NAMES[current - 1]} ▾
    </button>
  </div>
  <div class="stage-list">
  {#each STAGE_NAMES as name, i}
    <button
      class="stage"
      class:active={current === i + 1}
      data-phase={stagePhase(i + 1)}
      onclick={() => { gotoStage(i + 1); railOpen = false; }}
    >
      <span class="stage-n">{String(i + 1).padStart(2, '0')}</span>
      {name}
    </button>
  {/each}
  </div>
  {#if app.projectId}
    <a class="stage rail-link" href={`/library?p=${app.projectId}`}>⧉ library &amp; inventory</a>
    <button class="stage new-project" onclick={newProject}>⇤ projects</button>
  {/if}
  <div class="bridge-box">
    <button class="stage bridge-toggle" onclick={() => bridgeConnect()}>
      <span class="lamp-dot" class:on={app.bridgeStatus === 'ready'}></span>
      {app.bridgeStatus === 'ready'
        ? `local brain ✓${app.bridgeAgent ? ` · ${app.bridgeAgent}` : ''}`
        : '⚡ local brain'}
    </button>
    {#if app.bridgeStatus === 'pair'}
      <div class="bridge-help">
        <p>The bridge is running — its terminal printed a 6-digit
          <strong>pairing code</strong>. Enter it once:</p>
      </div>
      <form class="bridge-pair" onsubmit={(e) => { e.preventDefault(); bridgePair(); }}>
        <input bind:value={app.bridgeCodeDraft} name="paircode" placeholder="pairing code"
          inputmode="numeric" maxlength="6" />
      </form>
    {/if}
    {#if app.bridgeStatus === 'pair' || app.bridgeStatus === 'error'}
      <label class="bridge-port mono">port
        <input inputmode="numeric" bind:value={app.bridgePort} name="bridgeport" />
      </label>
    {/if}
    {#if app.bridgeError}<p class="bridge-err">{app.bridgeError}</p>{/if}
    {#if app.bridgeStatus === 'error'}
      <details class="bridge-help" open>
        <summary>how to set up</summary>
        <ol>
          <li>On this machine: <code>mlb</code> (installed once via
            <code>./install.sh</code>) — or <code>pnpm bridge</code> from a
            checkout. <code>mlb --help</code> shows your detected agents.</li>
          <li>It auto-detects your agent — Claude Code, Codex, Gemini CLI,
            Goose, Qwen or Kimi — or takes any stdio ACP agent via
            <code>--agent &lt;command&gt;</code>.</li>
          <li>It prints a 6-digit pairing code. Click ⚡ again and enter it.</li>
        </ol>
        <p>Your agent runs here with your own login; every tool call still
          executes on the hosted engine, gates intact.</p>
      </details>
    {/if}
  </div>
  {#if page.data.handle}
    <div class="user-box">
      <span class="who mono">◉ {page.data.handle}</span>
      <button class="user-act" onclick={mintBridgeToken}>bridge token</button>
      <button class="user-act" onclick={signOut}>sign out</button>
      {#if mintedToken}
        <div class="token-once">
          <p>Your bridge token — shown <strong>once</strong>. Paste it into
            <code>mlb</code>'s <code>bridge.json</code> as the API token:</p>
          <code class="mono token-value">{mintedToken}</code>
          <button class="user-act" onclick={() => { navigator.clipboard?.writeText(mintedToken); mintedToken = ''; }}>
            copy &amp; close
          </button>
        </div>
      {/if}
    </div>
  {/if}
</nav>

<style>
  /* ── the rail: phases carry their resistor colour band ── */
  .rail { display: flex; flex-direction: column; gap: 1px; min-width: 12.5rem; }
  .rail-top { display: flex; align-items: baseline; justify-content: space-between; }
  .rail-toggle { display: none; }
  .stage-list { display: flex; flex-direction: column; gap: 1px; }
  .wordmark {
    font-weight: 800; font-size: 1.05rem; letter-spacing: -0.02em;
    margin: 0 0 0.9rem 0.25rem;
  }

  @media (max-width: 700px) {
    .rail-toggle {
      display: inline-block; border: 1px solid var(--line); background: var(--panel);
      border-radius: 6px; padding: 0.35rem 0.6rem; font-size: 0.72rem;
      cursor: pointer; color: var(--ink);
    }
    .wordmark { margin-bottom: 0; }
    .stage-list { display: none; }
    .rail.open .stage-list {
      display: flex; flex-flow: row wrap; gap: 0.15rem; align-items: flex-start;
      margin-top: 0.5rem;
    }
    .rail.open .stage-list .stage { align-self: flex-start; }
    .bridge-box { margin-top: 0.4rem; padding-top: 0.3rem; }
  }
  .wordmark span { color: var(--mask); }
  .stage {
    display: flex; align-items: baseline; gap: 0.55rem;
    text-align: left; border: none; background: transparent;
    border-left: 3px solid transparent;
    padding: 0.32rem 0.6rem; cursor: pointer; font-size: 0.85rem;
    color: var(--ink-soft); border-radius: 0 4px 4px 0;
  }
  .stage[data-phase='1'] { border-left-color: var(--phase-1); }
  .stage[data-phase='2'] { border-left-color: var(--phase-2); }
  .stage[data-phase='3'] { border-left-color: var(--phase-3); }
  .stage[data-phase='4'] { border-left-color: var(--phase-4); }
  .stage:hover { background: rgb(255 255 255 / 75%); color: var(--ink); }
  .stage.active { background: var(--panel); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px rgb(20 24 27 / 8%); }
  .stage-n { font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-soft); }
  .stage.active .stage-n { color: var(--mask); font-weight: 600; }
  .new-project { border-left-color: transparent; }
  .rail-link { margin-top: 1rem; text-decoration: none; display: flex; }

  .bridge-box { margin-top: auto; padding-top: 0.8rem; }
  .bridge-toggle { font-size: 0.72rem; color: var(--ink-soft); }
  .lamp-dot {
    width: 7px; height: 7px; border-radius: 50%; background: #9aa5a0;
    display: inline-block; margin-right: 0.3rem;
  }
  .lamp-dot.on { background: #19c37d; box-shadow: 0 0 6px #19c37d; }
  .bridge-pair input {
    width: 8rem; font-family: var(--font-mono); font-size: 0.8rem;
    padding: 0.25rem 0.5rem; border: 1px solid var(--line); border-radius: 4px;
    margin: 0.3rem 0 0 0.25rem; letter-spacing: 0.2em;
  }
  .bridge-err { font-size: 0.68rem; color: #b3423a; margin: 0.3rem 0.25rem 0; max-width: 12rem; }
  .bridge-port {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.62rem; color: var(--ink-soft); margin: 0.3rem 0.25rem 0;
  }
  .bridge-port input {
    width: 4rem; font-family: var(--font-mono); font-size: 0.72rem;
    padding: 0.15rem 0.4rem; border: 1px solid var(--line); border-radius: 4px;
  }
  .bridge-help {
    font-size: 0.68rem; color: var(--ink-soft); max-width: 12.5rem;
    margin: 0.3rem 0.25rem 0;
  }
  .bridge-help summary { cursor: pointer; color: var(--mask); }
  .bridge-help ol { margin: 0.3rem 0; padding-left: 1.1rem; }
  .bridge-help li { margin: 0.25rem 0; }
  .bridge-help code {
    font-family: var(--font-mono); font-size: 0.62rem; background: #eef1f0;
    padding: 0 0.25rem; border-radius: 3px;
  }

  /* ── signed-in strip (auth spec §7) ── */
  .user-box {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem;
    padding: 0.5rem 0.25rem 0; border-top: 1px solid var(--line);
    margin-top: 0.5rem;
  }
  .who { font-size: 0.72rem; color: var(--ink); }
  .user-act {
    border: none; background: transparent; cursor: pointer;
    font-size: 0.66rem; color: var(--ink-soft); text-decoration: underline;
    padding: 0;
  }
  .user-act:hover { color: var(--mask); }
  .token-once {
    font-size: 0.66rem; color: var(--ink-soft); max-width: 12.5rem;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 6px; padding: 0.4rem 0.5rem; margin-top: 0.3rem;
  }
  .token-value {
    display: block; word-break: break-all; font-size: 0.62rem;
    background: #eef1f0; padding: 0.2rem 0.3rem; border-radius: 4px;
    margin: 0.3rem 0;
  }
</style>
