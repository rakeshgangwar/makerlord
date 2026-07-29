<script>
  import { browser } from '$app/environment';
  import { postureFor, stagePhase } from '$lib/postures.js';
  import { presentSeverity } from '$lib/severity.js';

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
  function consume(ev) {
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
      refreshProjections();
    } else if (ev.t === 'session.error') {
      lastError = ev.message;
      turnActive = false;
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
    await ensureSession(intentDraft.trim());
    await sendPrompt(intentDraft.trim());
    intentDraft = '';
  }

  async function sendPrompt(text) {
    if (!text.trim() || !sessionId) return;
    messages = [...messages, { role: 'maker', text }];
    toolActivity = [];
    turnActive = true;
    lastError = '';
    const r = await api(`sessions/${sessionId}/prompt`, { text });
    if (r.status === 409) {
      await api(`sessions/${sessionId}/steer`, { text });
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

  $effect(() => {
    if (browser && sessionId) openEvents();
    if (browser && projectId) refreshProjections();
  });
</script>

<div class="shell" data-posture={posture}>
  <nav class="rail" aria-label="Stages">
    {#each STAGE_NAMES as name, i}
      <button
        class="stage"
        class:active={stage === i + 1}
        data-phase={stagePhase(i + 1)}
        onclick={() => (stage = i + 1)}
      >
        {i + 1}. {name}
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
          <h1>What do you want to make?</h1>
          <p class="hint">
            e.g. “a soil moisture sensor for Home Assistant” · “a badge with
            blinking LEDs” · “a robot that follows a line”
          </p>
          <textarea rows="3" bind:value={intentDraft}
            placeholder="Describe it in your own words…"
            onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), startProject())}
          ></textarea>
          <button class="primary" onclick={startProject} disabled={!intentDraft.trim()}>
            Start
          </button>
        </div>
      {:else}
        <div class="conversation">
          {#each messages as m}
            <div class="msg {m.role}"><span class="who">{m.role}</span>{m.text}</div>
          {/each}
          {#if streamingText}
            <div class="msg agent streaming"><span class="who">agent</span>{streamingText}</div>
          {/if}
          {#each toolActivity as t}
            <div class="tool" class:refused={t.refused}>
              {t.done ? (t.refused ? '⛔' : '✓') : '…'} {t.name}{t.refused ? ` — ${t.refused}` : ''}
            </div>
          {/each}
          {#if lastError}<div class="error">{lastError}</div>{/if}
          <form class="composer" onsubmit={(e) => { e.preventDefault(); sendPrompt(promptDraft); promptDraft = ''; }}>
            <input bind:value={promptDraft}
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
                  onerror={(e) => (e.target.style.opacity = 0.2)} />
              </figure>
            {/each}
          </div>
          <button onclick={() => runCheck(stage === 4 ? 'check_architecture' : 'check_circuit')}>
            Run checks
          </button>
        {:else}
          <p>No project yet — start one in stage ①.</p>
        {/if}
      </div>
    {:else if posture === 'bench'}
      <div class="bench">
        {#if build && build.steps.length > 0}
          {#each build.steps as step, i}
            <div class="step" class:current={i === build.currentStep} class:dimmed={i !== build.currentStep}>
              <span class="step-n">{i}</span>
              <span class="step-kind">{step.kind}</span>
              <p>{step.instruction}</p>
              {#if step.kind === 'GATE' && i === build.currentStep}
                <div class="gate">
                  <p class="gate-title">⏚ The measurement gate — enter what the meter reads.</p>
                  <div class="gate-entry">
                    <input inputmode="decimal" bind:value={measureValue} placeholder="reading" />
                    <span>{measureUnit}</span>
                    <button onclick={recordMeasurement} disabled={!measureValue}>Record</button>
                  </div>
                  {#if prediction}
                    <p class="predicted">
                      Predicted: ~{prediction.totalCurrentMa?.toFixed(1)} mA
                      {prediction.railVoltage ? `on the ${prediction.railVoltage} V rail` : ''}
                    </p>
                    <button class="primary" onclick={openGate} disabled={build.gateOpen}>
                      {build.gateOpen ? 'Gate open ✓' : 'Open the gate'}
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <p>No build steps yet — the circuit arrives at stage ④→expand or via the agent.</p>
        {/if}
      </div>
    {:else}
      <div class="decide"><p>A report, a number, one action — arrives with its stage.</p></div>
    {/if}
  </section>

  <aside class="artifacts" aria-label="Artifacts">
    <h2>Artifacts</h2>
    <ul>
      <li>project.json {projectId ? `(${projectId.slice(0, 6)}…)` : ''}</li>
    </ul>
  </aside>
</div>

<footer class="finding-strip" aria-live="polite" aria-label="Findings">
  {#if findings.length === 0}
    <span class="all-clear">No open findings.</span>
  {:else}
    {#each findings as f}
      {@const p = presentSeverity(f.severity)}
      <article class="finding" style={`border-color: ${p.color}`}>
        <span class="sev">{p.icon} {p.label}</span>
        <span class="rule">{f.ruleId}</span>
        <p>{f.message}</p>
        {#if f.suggestedFix}<p class="fix">→ {f.suggestedFix}</p>{/if}
      </article>
    {/each}
  {/if}
</footer>

<style>
  .shell { display: flex; flex: 1; gap: 1rem; padding: 1rem; }
  .rail { display: flex; flex-direction: column; gap: 2px; min-width: 11rem; }
  .stage {
    text-align: left; border: none; background: transparent;
    padding: 0.3rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem;
  }
  .stage.active { background: #1d4ed8; color: white; }
  .new-project { margin-top: 1rem; color: #666; }
  .workspace { flex: 1; min-width: 0; }
  .converse-start h1 { font-size: 1.6rem; }
  .hint { color: #666; }
  textarea, .composer input { width: 100%; font-size: 1.05rem; padding: 0.7rem; box-sizing: border-box; }
  .primary { background: #1d4ed8; color: white; border: none; padding: 0.5rem 1.2rem; border-radius: 6px; cursor: pointer; margin-top: 0.5rem; }
  .primary:disabled { opacity: 0.4; }
  .conversation { display: flex; flex-direction: column; gap: 0.5rem; max-width: 46rem; }
  .msg { padding: 0.6rem 0.8rem; border-radius: 8px; white-space: pre-wrap; }
  .msg.maker { background: #e8eefc; align-self: flex-end; }
  .msg.agent { background: #f2f2ef; }
  .msg .who { display: block; font-size: 0.7rem; color: #888; text-transform: uppercase; }
  .streaming { opacity: 0.85; }
  .tool { font-family: monospace; font-size: 0.85rem; color: #555; }
  .tool.refused { color: #b91c1c; }
  .error { color: #b91c1c; }
  .composer { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
  .composer .primary { margin-top: 0; }
  .canvas-row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .canvas-row figure { margin: 0; }
  .canvas-row img { max-width: 380px; border: 1px solid #ddd; background: white; }
  .bench .step { padding: 0.6rem 1rem; border-left: 3px solid #ddd; margin: 0.4rem 0; }
  .bench .step.current { border-color: #1d4ed8; font-size: 1.25rem; }
  .bench .step.dimmed { opacity: 0.45; }
  .step-n { font-weight: 700; margin-right: 0.5rem; }
  .step-kind { font-family: monospace; font-size: 0.75rem; color: #666; }
  .gate { border: 2px solid #1d4ed8; border-radius: 8px; padding: 0.8rem; margin-top: 0.5rem; }
  .gate-entry { display: flex; gap: 0.5rem; align-items: center; }
  .gate-entry input { font-size: 1.4rem; width: 9rem; padding: 0.4rem; }
  .predicted { color: #1d4ed8; font-weight: 600; }
  .artifacts { min-width: 11rem; border-left: 1px solid #ddd; padding-left: 1rem; }
  .finding-strip { border-top: 2px solid #ddd; padding: 0.5rem 1rem; background: #fff; }
  .finding { border-left: 4px solid; padding: 0.25rem 0.75rem; margin: 0.25rem 0; }
  .sev { font-weight: 700; }
  .rule { font-family: monospace; margin-left: 0.5rem; }
  .fix { color: #333; }
  .all-clear { color: #666; }
</style>
