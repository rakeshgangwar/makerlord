<script>
  import { stagePhase } from '$lib/postures.js';
  import { app, newProject, bridgeConnect, bridgePair } from '$lib/app.svelte.js';

  let { stage = null } = $props();
  const current = $derived(stage ?? app.stage);

  const STAGE_NAMES = [
    'Idea', 'Feasibility', 'Requirements', 'Architecture', 'Simulate',
    'Prototype ★', 'Firmware', 'Debug', 'PCB', 'Mechanical',
    'Manufacturing', 'Fabricate', 'First article', 'Test', 'Compliance',
    'Document', 'Produce',
  ];
</script>

<nav class="rail" aria-label="Stages">
  <div class="wordmark">Maker<span>Lord</span></div>
  {#each STAGE_NAMES as name, i}
    <button
      class="stage"
      class:active={current === i + 1}
      data-phase={stagePhase(i + 1)}
      onclick={() => { app.stage = i + 1; app.stagePinned = true; }}
    >
      <span class="stage-n">{String(i + 1).padStart(2, '0')}</span>
      {name}
    </button>
  {/each}
  {#if app.projectId}
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
    {#if app.bridgeError}<p class="bridge-err">{app.bridgeError}</p>{/if}
    {#if app.bridgeStatus === 'error'}
      <details class="bridge-help" open>
        <summary>how to set up</summary>
        <ol>
          <li>On this machine, in your MakerLord checkout, run
            <code>pnpm bridge</code>
            (it reads <code>MAKERLORD_ACCESS_TOKEN</code> from the environment).</li>
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
</nav>

<style>
  /* ── the rail: phases carry their resistor colour band ── */
  .rail { display: flex; flex-direction: column; gap: 1px; min-width: 12.5rem; }
  .wordmark {
    font-weight: 800; font-size: 1.05rem; letter-spacing: -0.02em;
    margin: 0 0 0.9rem 0.25rem;
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
  .new-project { margin-top: 1rem; border-left-color: transparent; }

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
</style>
