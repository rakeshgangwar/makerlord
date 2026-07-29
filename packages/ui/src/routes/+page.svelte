<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { postureFor, stagePhase } from '$lib/postures.js';
  import { presentSeverity } from '$lib/severity.js';

  /** Agent prose is model output: render markdown, sanitised, always. */
  function md(text) {
    if (!browser) return text;
    return DOMPurify.sanitize(marked.parse(text, { async: false }));
  }

  // ── shell state ─────────────────────────────────────────────────────
  let stage = $state(1);
  const posture = $derived(postureFor(stage));

  const STAGE_NAMES = [
    'Idea', 'Feasibility', 'Requirements', 'Architecture', 'Simulate',
    'Prototype ★', 'Firmware', 'Debug', 'PCB', 'Mechanical',
    'Manufacturing', 'Fabricate', 'First article', 'Test', 'Compliance',
    'Document', 'Produce',
  ];

  // ── project + session (resumed from localStorage) ───────────────────
  let projectId = $state(browser ? localStorage.getItem('makerlord.projectId') : null);
  let sessionId = $state(browser ? localStorage.getItem('makerlord.sessionId') : null);
  let intentDraft = $state('');
  let promptDraft = $state('');
  let turnActive = $state(false);
  let lastError = $state('');

  /** @type {{role: string, text: string}[]} */
  let messages = $state([]);
  let streamingText = $state('');
  /** @type {{name: string, done: boolean, refused?: string}[]} */
  let toolActivity = $state([]);
  /** @type {{severity: string, ruleId: string, message: string, suggestedFix?: string}[]} */
  let findings = $state([]);

  /** @type {EventSource | null} */
  let eventSource = null;

  async function api(path, body) {
    const res = await fetch(`/app-api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }

  function openEvents() {
    if (!sessionId || eventSource) return;
    eventSource = new EventSource(`/app-api/sessions/${sessionId}/events`);
    eventSource.addEventListener('session', (e) => {
      consume(JSON.parse(e.data));
    });
  }

  /** The one SessionEvent consumer — findings only ever from engine data. */
  function consume(ev, replay = false) {
    if (ev.t === 'message.delta') {
      streamingText += ev.text;
    } else if (ev.t === 'tool.start') {
      toolActivity = [...toolActivity, { name: ev.name, done: false }];
    } else if (ev.t === 'tool.end') {
      const last = toolActivity.findLast((a) => a.name && !a.done);
      if (last) last.done = true;
      toolActivity = [...toolActivity];
      if (!ev.result.ok) {
        if (last) last.refused = ev.result.refused;
        findings = ev.result.findings.length ? ev.result.findings : findings;
      }
    } else if (ev.t === 'turn.end') {
      if (streamingText) messages = [...messages, { role: 'agent', text: streamingText }];
      streamingText = '';
      turnActive = false;
      if (!replay) refreshProjections();
    } else if (ev.t === 'session.error') {
      if (!replay) lastError = ev.message;
      turnActive = false;
    }
  }

  /** Rebuild the conversation from the persisted transcript. */
  async function replayTranscript() {
    if (!projectId) return;
    const r = await api(`projects/${projectId}/transcript`);
    if (r.status !== 200) return;
    for (const record of r.data.records ?? []) {
      if (record.kind === 'maker') {
        messages = [...messages, { role: 'maker', text: record.text }];
        toolActivity = [];
      } else if (record.kind === 'event') {
        consume(record.event, true);
      }
    }
  }

  async function ensureSession(intent) {
    if (!projectId) {
      const p = await api('projects', { intent });
      projectId = p.data.projectId;
      localStorage.setItem('makerlord.projectId', projectId);
    }
    if (!sessionId) {
      const s = await api('sessions', { projectId });
      sessionId = s.data.sessionId;
      localStorage.setItem('makerlord.sessionId', sessionId);
    }
    openEvents();
  }

  async function startProject() {
    if (!intentDraft.trim()) return;
    try {
      await ensureSession(intentDraft.trim());
      await sendPrompt(intentDraft.trim());
      intentDraft = '';
    } catch (e) {
      // A transient network failure must be visible and retryable, not an
      // unhandled rejection. State is resumable: retry picks up where it got to.
      lastError = `Could not start: ${e instanceof Error ? e.message : e}. Press Start again.`;
    }
  }

  async function sendPrompt(text) {
    if (!text.trim() || !projectId) return;
    messages = [...messages, { role: 'maker', text }];
    toolActivity = [];
    turnActive = true;
    lastError = '';
    try {
      // Sessions are in-memory server-side: a redeploy drops them. Resume by
      // minting a fresh one against the same project — the artefact persists.
      if (!sessionId) await ensureSession(text);
      let r = await api(`sessions/${sessionId}/prompt`, { text });
      if (r.status === 404) {
        sessionId = null;
        localStorage.removeItem('makerlord.sessionId');
        if (eventSource) { eventSource.close(); eventSource = null; }
        await ensureSession(text);
        r = await api(`sessions/${sessionId}/prompt`, { text });
      }
      if (r.status === 409) {
        await api(`sessions/${sessionId}/steer`, { text });
      }
    } catch (e) {
      turnActive = false;
      lastError = `Could not reach the agent: ${e instanceof Error ? e.message : e}. Try again.`;
    }
  }

  function newProject() {
    localStorage.removeItem('makerlord.projectId');
    localStorage.removeItem('makerlord.sessionId');
    location.reload();
  }

  // ── projections (Inspect) + build state (Bench) ─────────────────────
  let renderTick = $state(0);
  /** @type {{steps: any[], currentStep: number, gateOpen: boolean, measurements: any[]} | null} */
  let build = $state(null);

  async function refreshProjections() {
    renderTick += 1;
    if (projectId) {
      const r = await api(`projects/${projectId}/steps`);
      if (r.status === 200) build = r.data;
      await refreshProjectFile();
    }
  }

  async function runCheck(name) {
    if (!projectId) return;
    const r = await api(`projects/${projectId}/tool`, { name, input: {} });
    if (r.data.ok === false) findings = r.data.findings;
    else if (r.data.ok) findings = r.data.data.findings ?? [];
  }

  // ── the gate (D15: number first, prediction after) ──────────────────
  let measureName = $state('rail-to-rail resistance');
  let measureValue = $state('');
  let measureUnit = $state('Ω');
  let prediction = $state(null);

  async function recordMeasurement() {
    const value = Number(measureValue);
    if (!Number.isFinite(value) || !projectId) return;
    await api(`projects/${projectId}/tool`, {
      name: 'measure',
      input: { name: measureName, value, unit: measureUnit },
    });
    // Only AFTER the number is recorded does the prediction appear.
    const r = await api(`projects/${projectId}/tool`, { name: 'predict_dc', input: {} });
    prediction = r.data.ok ? r.data.data.prediction : null;
    measureValue = '';
    await refreshProjections();
  }

  async function openGate() {
    const r = await api(`projects/${projectId}/tool`, { name: 'gate_open', input: {} });
    if (r.data.ok === false) findings = r.data.findings.length ? r.data.findings : findings;
    await refreshProjections();
  }

  onMount(async () => {
    if (sessionId) openEvents();
    await replayTranscript();
    if (projectId) refreshProjections();
  });

  // ── the right panel: what's on the bench, and the parts library ─────
  let panelTab = $state('bench');
  /** @type {any} */
  let projectFile = $state(null);
  let libraryQuery = $state('');
  /** @type {{id: string, title: string, family: string}[]} */
  let libraryHits = $state([]);
  /** @type {any} */
  let libraryPart = $state(null);

  async function refreshProjectFile() {
    if (!projectId) return;
    const r = await api(`projects/${projectId}`);
    if (r.status === 200) projectFile = r.data.file;
  }

  async function searchLibrary() {
    if (!projectId || !libraryQuery.trim()) return;
    const r = await api(`projects/${projectId}/tool`, {
      name: 'parts_search', input: { query: libraryQuery.trim() },
    });
    libraryHits = r.data.ok ? r.data.data.hits : [];
    libraryPart = null;
  }

  async function openPart(id) {
    const r = await api(`projects/${projectId}/tool`, {
      name: 'parts_get', input: { id },
    });
    libraryPart = r.data.ok ? r.data.data : null;
  }

  const blockerCount = $derived(
    findings.filter((f) => f.severity === 'BLOCKER' || f.severity === 'REFUSE').length,
  );
</script>

<div class="shell" data-posture={posture}>
  <nav class="rail" aria-label="Stages">
    <div class="wordmark">Maker<span>Lord</span></div>
    {#each STAGE_NAMES as name, i}
      <button
        class="stage"
        class:active={stage === i + 1}
        data-phase={stagePhase(i + 1)}
        onclick={() => (stage = i + 1)}
      >
        <span class="stage-n">{String(i + 1).padStart(2, '0')}</span>
        {name}
      </button>
    {/each}
    {#if projectId}
      <button class="stage new-project" onclick={newProject}>+ new project</button>
    {/if}
  </nav>

  <section class="workspace" aria-label="Workspace">
    {#if posture === 'converse'}
      {#if messages.length === 0 && !projectId}
        <div class="converse-start">
          <p class="eyebrow">Idea → simulate → prototype → product</p>
          <h1>What do you<br />want to make?</h1>
          <p class="hint">
            “a soil moisture sensor for Home Assistant” · “a badge with
            blinking LEDs” · “a robot that follows a line”
          </p>
          <textarea rows="3" bind:value={intentDraft} name="intent"
            placeholder="Describe it in your own words…"
            onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), startProject())}
          ></textarea>
          <button class="primary" onclick={startProject} disabled={!intentDraft.trim()}>
            Start
          </button>
          {#if lastError}<p class="error">{lastError}</p>{/if}
        </div>
      {:else}
        <div class="conversation">
          {#each messages as m}
            <div class="msg {m.role}">
              <span class="who">{m.role}</span>
              {#if m.role === 'agent'}<div class="md">{@html md(m.text)}</div>{:else}{m.text}{/if}
            </div>
          {/each}
          {#if streamingText}
            <div class="msg agent streaming"><span class="who">agent</span><div class="md">{@html md(streamingText)}</div><span class="cursor"></span></div>
          {/if}
          {#if toolActivity.length > 0}
            <div class="tools">
              {#each toolActivity as t}
                <span class="tool" class:refused={t.refused} class:running={!t.done}>
                  {t.done ? (t.refused ? '⛔' : '✓') : '·'} {t.name}{t.refused ? ` ${t.refused}` : ''}
                </span>
              {/each}
            </div>
          {/if}
          {#if lastError}<div class="error">{lastError}</div>{/if}
          <form class="composer" onsubmit={(e) => { e.preventDefault(); sendPrompt(promptDraft); promptDraft = ''; }}>
            <input bind:value={promptDraft} name="prompt"
              placeholder={turnActive ? 'steer the agent mid-turn…' : 'reply…'} />
            <button class="primary" type="submit">{turnActive ? 'Steer' : 'Send'}</button>
          </form>
        </div>
      {/if}
    {:else if posture === 'inspect'}
      <div class="inspect">
        {#if projectId}
          <div class="canvas-row">
            {#each ['blocks', 'schematic', 'breadboard'] as kind}
              <figure>
                <figcaption>{kind}</figcaption>
                <img src={`/render/${projectId}/${kind}?t=${renderTick}`} alt={`${kind} projection`}
                  onerror={(e) => (e.target.closest('figure').dataset.empty = 'true')} />
                <p class="empty-note">arrives when the circuit exists</p>
              </figure>
            {/each}
          </div>
          <button class="secondary" onclick={() => runCheck(stage === 4 ? 'check_architecture' : 'check_circuit')}>
            Run checks
          </button>
        {:else}
          <p class="empty">No project on the bench — start one in stage 01.</p>
        {/if}
      </div>
    {:else if posture === 'bench'}
      <div class="bench">
        {#if build && build.steps.length > 0}
          {#each build.steps as step, i}
            <div class="step" class:current={i === build.currentStep} class:dimmed={i !== build.currentStep}>
              <span class="step-n">{String(i).padStart(2, '0')}</span>
              <div class="step-body">
                <span class="step-kind">{step.kind.replace(/_/g, ' ')}</span>
                <p>{step.instruction}</p>
                {#if step.kind === 'GATE' && i === build.currentStep}
                  <div class="gate">
                    <p class="gate-title">Preflight — enter what the meter reads.</p>
                    <div class="gate-entry">
                      <input inputmode="decimal" bind:value={measureValue} name="reading" placeholder="reading" />
                      <span class="unit">{measureUnit}</span>
                      <button class="primary" onclick={recordMeasurement} disabled={!measureValue}>Record</button>
                    </div>
                    {#if prediction}
                      <p class="predicted">
                        Predicted ~{prediction.totalCurrentMa?.toFixed(1)} mA
                        {prediction.railVoltage ? `on the ${prediction.railVoltage} V rail` : ''}
                      </p>
                      <button class="primary" onclick={openGate} disabled={build.gateOpen}>
                        {build.gateOpen ? 'Gate open ✓' : 'Open the gate'}
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {:else}
          <p class="empty">No build steps yet — they arrive when the circuit exists.</p>
        {/if}
      </div>
    {:else}
      <div class="decide"><p class="empty">A report, a number, one action — arrives with its stage.</p></div>
    {/if}
  </section>

  <aside class="artifacts" aria-label="Artifacts">
    <div class="panel-tabs" role="tablist">
      <button role="tab" aria-selected={panelTab === 'bench'} class:on={panelTab === 'bench'}
        onclick={() => (panelTab = 'bench')}>On the bench</button>
      <button role="tab" aria-selected={panelTab === 'library'} class:on={panelTab === 'library'}
        onclick={() => { panelTab = 'library'; }}>Library</button>
    </div>

    {#if panelTab === 'bench'}
      <p class="mono panel-id">project.json{projectId ? ` · ${projectId.slice(0, 6)}` : ''}</p>
      {#if projectFile}
        {@const p = projectFile.project}
        {#if p.requirements.length > 0}
          <h3>Requirements</h3>
          <ul class="panel-list">
            {#each p.requirements as r}
              <li>
                <span class="mono">{r.metric}</span> {r.comparator} {r.value} {r.unit}
                {#if r.provenance === 'assumed'}<span class="badge-assumed">assumed</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if p.architecture.blocks.length > 0}
          <h3>Blocks</h3>
          <ul class="panel-list">
            {#each p.architecture.blocks as b}
              <li><strong>{b.name}</strong> — <span class="mono">{b.sourcing.type === 'buy' ? b.sourcing.partId : b.sourcing.type}</span></li>
            {/each}
          </ul>
        {/if}
        {#if p.inventory.length > 0}
          <h3>Inventory</h3>
          <ul class="panel-list">
            {#each p.inventory as item}<li>{item.freeText ?? item.partId}{item.quantity ? ` ×${item.quantity}` : ''}</li>{/each}
          </ul>
        {/if}
        {#if p.requirements.length === 0 && p.architecture.blocks.length === 0 && p.inventory.length === 0}
          <p class="empty">Nothing settled yet — it fills in as you talk.</p>
        {/if}
      {:else}
        <p class="empty">No project on the bench.</p>
      {/if}
    {:else}
      <form class="lib-search" onsubmit={(e) => { e.preventDefault(); searchLibrary(); }}>
        <input bind:value={libraryQuery} name="library" placeholder="search parts…" />
      </form>
      {#if !projectId}
        <p class="empty">Start a project to browse the library.</p>
      {:else if libraryPart}
        <button class="lib-back" onclick={() => (libraryPart = null)}>← back</button>
        <h3>{libraryPart.definition.title}</h3>
        <p class="mono panel-id">{libraryPart.definition.family}</p>
        <ul class="panel-list">
          {#each libraryPart.definition.pins as pin}
            <li><span class="mono">{pin.name}</span> · {pin.role}</li>
          {/each}
        </ul>
        {#if libraryPart.profile}
          <h3>Safety profile</h3>
          <ul class="panel-list mono small">
            {#each Object.entries(libraryPart.profile) as [k, v]}
              {#if typeof v !== 'object'}<li>{k}: {v}</li>{/if}
            {/each}
          </ul>
        {:else}
          <p class="empty">No safety profile yet — not usable in circuits.</p>
        {/if}
      {:else if libraryHits.length > 0}
        <ul class="panel-list">
          {#each libraryHits as hit}
            <li><button class="lib-hit" onclick={() => openPart(hit.id)}>{hit.title}</button>
              <span class="mono small">{hit.family}</span></li>
          {/each}
        </ul>
      {:else}
        <p class="empty">Search the curated library — only parts here can be used.</p>
      {/if}
    {/if}
  </aside>
</div>

<!-- The finding strip is an instrument, not a notification tray. -->
<footer class="meter" aria-live="polite" aria-label="Findings">
  <div class="meter-readout">
    <span class="lamp" class:alert={blockerCount > 0} class:warn={blockerCount === 0 && findings.length > 0}></span>
    <span class="mono readout-text">
      {#if findings.length === 0}READY · no open findings{:else}{findings.length} finding{findings.length === 1 ? '' : 's'} · {blockerCount} blocking{/if}
    </span>
  </div>
  {#if findings.length > 0}
    <div class="cards">
      {#each findings as f}
        {@const p = presentSeverity(f.severity)}
        <article class="finding" style={`--sev: ${p.color}`}>
          <span class="sev">{p.icon} {p.label}</span>
          <span class="rule mono">{f.ruleId}</span>
          <p class="claim">{f.message}</p>
          {#if f.suggestedFix}<p class="fix">→ {f.suggestedFix}</p>{/if}
        </article>
      {/each}
    </div>
  {/if}
</footer>

<style>
  .shell { display: flex; flex: 1; gap: 1.5rem; padding: 1.25rem 1.5rem; }

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

  /* ── workspace ── */
  .workspace { flex: 1; min-width: 0; }
  .converse-start { max-width: 40rem; margin: 9vh auto 0; }
  .eyebrow {
    font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--copper); margin: 0 0 0.4rem;
  }
  h1 {
    font-size: clamp(2.2rem, 5vw, 3.4rem); font-weight: 800;
    letter-spacing: -0.03em; line-height: 1.02; margin: 0 0 0.8rem;
  }
  .hint { color: var(--ink-soft); margin: 0 0 1.2rem; }
  textarea, .composer input {
    width: 100%; font-size: 1.05rem; padding: 0.85rem; box-sizing: border-box;
    font-family: var(--font-body); border: 1.5px solid var(--line);
    border-radius: 8px; background: var(--panel);
  }
  textarea:focus, .composer input:focus { border-color: var(--mask); outline: none; }
  .primary {
    background: var(--mask); color: white; border: none;
    padding: 0.55rem 1.4rem; border-radius: 7px; cursor: pointer;
    font-weight: 600; font-size: 0.95rem; margin-top: 0.6rem;
  }
  .primary:hover { background: var(--mask-deep); }
  .primary:disabled { opacity: 0.4; cursor: default; }
  .secondary {
    background: var(--panel); color: var(--mask); border: 1.5px solid var(--mask);
    padding: 0.45rem 1.1rem; border-radius: 7px; cursor: pointer; font-weight: 600;
  }

  .conversation { display: flex; flex-direction: column; gap: 0.6rem; max-width: 46rem; }
  .msg {
    padding: 0.7rem 0.95rem; border-radius: 10px; white-space: pre-wrap;
    background: var(--panel); box-shadow: 0 1px 2px rgb(20 24 27 / 6%);
  }
  .msg.maker { background: #dcefe6; align-self: flex-end; border-radius: 10px 10px 2px 10px; }
  .msg.agent { border-radius: 10px 10px 10px 2px; }
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
  .tools { display: flex; flex-wrap: wrap; gap: 0.3rem 0.7rem; padding: 0.2rem 0.3rem; }
  .tool { font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-soft); }
  .tool.running { color: var(--copper); }
  .tool.refused { color: var(--sev-blocker); font-weight: 600; }
  .error { color: var(--sev-blocker); font-size: 0.9rem; }
  .composer { display: flex; gap: 0.5rem; margin-top: 0.9rem; }
  .composer .primary { margin-top: 0; }

  /* ── inspect ── */
  .canvas-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .canvas-row figure { margin: 0; background: var(--panel); border-radius: 8px; padding: 0.6rem; box-shadow: 0 1px 3px rgb(20 24 27 / 8%); }
  .canvas-row figcaption {
    font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--ink-soft); margin-bottom: 0.4rem;
  }
  .canvas-row img { max-width: 380px; display: block; min-height: 90px; }
  .canvas-row .empty-note { display: none; }
  .canvas-row figure[data-empty='true'] img { display: none; }
  .canvas-row figure[data-empty='true'] .empty-note {
    display: block; color: var(--ink-soft); font-size: 0.8rem; margin: 1.4rem 0.5rem;
  }

  /* ── bench: readable at arm's length ── */
  .bench { max-width: 44rem; }
  .step { display: flex; gap: 0.9rem; padding: 0.7rem 1rem; margin: 0.45rem 0; background: var(--panel); border-radius: 8px; }
  .step.current { font-size: 1.35rem; box-shadow: 0 2px 8px rgb(20 24 27 / 10%); border-left: 4px solid var(--mask); }
  .step.dimmed { opacity: 0.45; }
  .step-n { font-family: var(--font-mono); font-size: 0.8em; color: var(--ink-soft); padding-top: 0.2em; }
  .step-kind {
    font-family: var(--font-mono); font-size: 0.62em; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--copper);
  }
  .step-body p { margin: 0.15em 0 0; }
  .gate { border: 2px solid var(--mask); border-radius: 10px; padding: 1rem; margin-top: 0.7rem; background: #f2faf6; }
  .gate-title { font-weight: 600; margin: 0 0 0.6rem; }
  .gate-entry { display: flex; gap: 0.6rem; align-items: center; }
  .gate-entry input {
    font-family: var(--font-mono); font-size: 1.6rem; width: 8.5rem;
    padding: 0.45rem 0.6rem; border: 1.5px solid var(--line); border-radius: 8px;
  }
  .gate-entry .unit { font-family: var(--font-mono); color: var(--ink-soft); }
  .gate .primary { margin-top: 0.6rem; }
  .predicted { color: var(--mask); font-weight: 600; font-family: var(--font-mono); font-size: 0.95rem; }

  .empty { color: var(--ink-soft); }

  /* ── the right panel: bench state + library ── */
  .artifacts { min-width: 15rem; max-width: 17rem; }
  .panel-tabs { display: flex; gap: 0.25rem; margin-bottom: 0.7rem; }
  .panel-tabs button {
    font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.08em;
    text-transform: uppercase; border: none; background: transparent;
    color: var(--ink-soft); padding: 0.3rem 0.5rem; cursor: pointer;
    border-bottom: 2px solid transparent;
  }
  .panel-tabs button.on { color: var(--mask); border-bottom-color: var(--mask); }
  .artifacts h3 {
    font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--ink-soft); margin: 0.9rem 0 0.3rem;
  }
  .panel-list { list-style: none; padding: 0; margin: 0; font-size: 0.82rem; }
  .panel-list li { padding: 0.18rem 0; }
  .panel-id { font-size: 0.72rem; color: var(--ink-soft); margin: 0; }
  .badge-assumed {
    font-family: var(--font-mono); font-size: 0.62rem; margin-left: 0.3rem;
    background: #f3e8cf; color: var(--sev-warning); padding: 0 0.3rem; border-radius: 6px;
  }
  .lib-search input {
    width: 100%; box-sizing: border-box; padding: 0.45rem 0.6rem;
    border: 1.5px solid var(--line); border-radius: 7px; font-family: var(--font-body);
  }
  .lib-hit {
    border: none; background: transparent; color: var(--mask); cursor: pointer;
    padding: 0; font-size: 0.85rem; text-align: left; text-decoration: underline;
  }
  .lib-back { border: none; background: transparent; color: var(--ink-soft); cursor: pointer; padding: 0; }
  .small { font-size: 0.72rem; color: var(--ink-soft); }
  .mono { font-family: var(--font-mono); }

  /* markdown inside agent messages */
  .md :global(p) { margin: 0.3em 0; }
  .md :global(table) { border-collapse: collapse; margin: 0.4em 0; font-size: 0.9em; }
  .md :global(th), .md :global(td) { border: 1px solid var(--line); padding: 0.25em 0.55em; text-align: left; }
  .md :global(th) { font-family: var(--font-mono); font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.06em; }
  .md :global(code) { font-family: var(--font-mono); font-size: 0.88em; background: #eef1f0; padding: 0 0.25em; border-radius: 4px; }
  .md :global(pre) { background: #eef1f0; padding: 0.6em 0.8em; border-radius: 8px; overflow-x: auto; }
  .md :global(ul), .md :global(ol) { margin: 0.3em 0; padding-left: 1.3em; }
  .md :global(h1), .md :global(h2), .md :global(h3) { font-size: 1.05em; margin: 0.5em 0 0.2em; }

  /* ── the meter: findings as an instrument ── */
  .meter {
    background: var(--meter-face); color: #dfe5e2; padding: 0.55rem 1.5rem 0.7rem;
    border-top: 3px solid #171b1e;
  }
  .meter-readout { display: flex; align-items: center; gap: 0.6rem; }
  .lamp {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--meter-glow); box-shadow: 0 0 6px var(--meter-glow);
  }
  .lamp.warn { background: var(--sev-warning); box-shadow: 0 0 6px var(--sev-warning); }
  .lamp.alert {
    background: var(--sev-blocker); box-shadow: 0 0 8px var(--sev-blocker);
    animation: lamp-pulse 1.2s ease-in-out infinite;
  }
  @keyframes lamp-pulse { 50% { box-shadow: 0 0 14px var(--sev-blocker); } }
  .readout-text { font-size: 0.78rem; letter-spacing: 0.06em; }
  .cards { display: flex; flex-direction: column; gap: 0.45rem; margin-top: 0.55rem; }
  .finding {
    background: #2c3236; border-left: 4px solid var(--sev);
    border-radius: 6px; padding: 0.5rem 0.85rem;
  }
  .finding .sev { font-weight: 700; color: var(--sev); font-size: 0.85rem; filter: brightness(1.5); }
  .finding .rule { margin-left: 0.6rem; font-size: 0.75rem; color: #9aa4ab; }
  .finding .claim { margin: 0.25rem 0 0; font-size: 0.92rem; }
  .finding .fix { margin: 0.2rem 0 0; font-size: 0.85rem; color: #b9c3c0; }

  /* ── responsive: the strip never collapses ── */
  @media (max-width: 1100px) { .artifacts { display: none; } }
  @media (max-width: 700px) {
    .shell { flex-direction: column; }
    .rail { flex-direction: row; flex-wrap: wrap; min-width: 0; }
    .stage { border-left-width: 3px; }
  }
</style>
