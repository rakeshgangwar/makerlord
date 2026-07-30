<script>
  import { browser } from '$app/environment';
  import DOMPurify from 'dompurify';
  import { app, api, refreshProjections } from '$lib/app.svelte.js';

  /**
   * The virtual bench (stage ⑤): the schematic comes alive with data the
   * SOLVER produced — current marching along nets, LEDs glowing to their
   * drive, a meter you probe by clicking, a supply knob that re-solves as
   * you drag. Presentation animates; it never invents a number (D3).
   */

  let svgHost = $state(null);
  let running = $state(false);
  let rungShown = $state(-1);
  /** @type {any} */
  let result = $state(null);
  /** @type {{kind: 'net'|'part', name: string} | null} */
  let probe = $state(null);
  let knobVolts = $state(9);
  let knobActive = $state(false);
  let svgLoaded = $state(false);

  const RUNGS = ['op', 'gmin', 'source-stepping'];

  async function loadSchematic() {
    if (!app.projectId || !svgHost) return;
    try {
      const res = await fetch(`/render/${app.projectId}/schematic?t=${app.renderTick}`);
      if (!res.ok) { svgLoaded = false; return; }
      svgHost.innerHTML = DOMPurify.sanitize(await res.text(), {
        USE_PROFILES: { svg: true, svgFilters: true },
      });
      svgLoaded = true;
      wireProbes();
      if (result) paint();
    } catch { svgLoaded = false; }
  }

  function wireProbes() {
    for (const el of svgHost?.querySelectorAll('[data-net]') ?? []) {
      el.style.cursor = 'crosshair';
      el.addEventListener('click', () => (probe = { kind: 'net', name: el.dataset.net }));
    }
    for (const el of svgHost?.querySelectorAll('[data-part]') ?? []) {
      el.style.cursor = 'crosshair';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        probe = { kind: 'part', name: el.dataset.part };
      });
    }
  }

  /** Current → dash animation duration: faster = more current. */
  function flowDuration(ma) {
    if (!ma || ma <= 0.01) return 0;
    return Math.max(0.25, 2.4 - Math.log10(ma + 1) * 1.4);
  }

  /** Paint solver truth onto the drawing: flows, glows, badges. */
  function paint() {
    if (!svgHost || !result) return;
    const netMa = new Map();
    const circuit = app.projectFile?.project?.circuit;
    for (const net of circuit?.intent ?? []) {
      let best = 0;
      for (const m of net.members) {
        best = Math.max(best, result.branchCurrentsMa?.[m.ref] ?? 0);
      }
      netMa.set(net.name, best);
    }
    for (const el of svgHost.querySelectorAll('[data-net]')) {
      const ma = netMa.get(el.dataset.net) ?? 0;
      const dur = flowDuration(ma);
      if (dur > 0) {
        el.setAttribute('stroke-dasharray', '7 5');
        el.style.animation = `ml-flow ${dur}s linear infinite`;
      } else {
        el.removeAttribute('stroke-dasharray');
        el.style.animation = '';
      }
    }
    for (const el of svgHost.querySelectorAll('[data-part]')) {
      const ref = el.dataset.part;
      const meta = result.elementMeta?.[ref];
      const ma = result.branchCurrentsMa?.[ref];
      if (meta?.kind === 'diode' && meta.maxCurrentMa && ma > 0.01) {
        const intensity = Math.min(1, ma / meta.maxCurrentMa);
        el.style.filter = `drop-shadow(0 0 ${3 + intensity * 9}px rgba(214, 40, 40, ${0.35 + intensity * 0.6}))`;
      } else {
        el.style.filter = '';
      }
    }
  }

  async function run(fromKnob = false) {
    if (!app.projectId || running) return;
    running = true;
    if (!fromKnob) { rungShown = 0; result = null; }
    try {
      const input = fromKnob
        ? { name: 'bench', analyses: ['op'], sandbox: true, volts: knobVolts }
        : { name: 'bench', analyses: ['op'] };
      const r = await api(`projects/${app.projectId}/tool`, {
        name: 'sim_run', input,
      });
      if (r.data.ok) {
        const data = r.data.data;
        if (!fromKnob) {
          // The convergence theater: light the TRUE rung sequence, then land.
          const target = Math.max(0, RUNGS.indexOf(data.rung));
          for (let i = 0; i <= target; i += 1) {
            rungShown = i;
            await new Promise((res) => setTimeout(res, 420));
          }
        }
        result = data;
        if (data.findings?.length) app.findings = data.findings;
        paint();
      } else {
        app.lastError = r.data.error ?? 'simulation failed';
      }
    } finally {
      running = false;
      rungShown = -1;
    }
  }

  /** The what-if knob: a SANDBOX solve — play never touches the record. */
  let knobTimer = null;
  function knobChange() {
    knobActive = true;
    clearTimeout(knobTimer);
    knobTimer = setTimeout(() => run(true), 350);
  }

  // Sim state lives at file.sim; the SUPPLY is the dc stimulus with the
  // highest volts (a ground tie is also dc, at 0V).
  const dcStimulus = $derived.by(() => {
    const dcs = (app.projectFile?.sim?.stimuli ?? []).filter((s) => s.kind === 'dc');
    return dcs.sort((a, b) => (b.params?.volts ?? 0) - (a.params?.volts ?? 0))[0] ?? null;
  });

  const probeReading = $derived.by(() => {
    if (!probe || !result) return null;
    if (probe.kind === 'net') {
      const v = result.netVoltages?.[probe.name];
      return v === undefined ? null : { title: probe.name, lines: [`${v.toFixed(3)} V`] };
    }
    const ma = result.branchCurrentsMa?.[probe.name];
    const meta = result.elementMeta?.[probe.name];
    const w = result.deviceDissipationW?.[probe.name];
    if (ma === undefined && w === undefined) return null;
    const lines = [];
    const bars = [];
    if (ma !== undefined) lines.push(`${ma.toFixed(2)} mA`);
    if (w !== undefined) lines.push(`${(w * 1000).toFixed(1)} mW`);
    if (ma !== undefined && meta?.maxCurrentMa) {
      bars.push({ label: `of ${meta.maxCurrentMa}mA cap`, pct: Math.min(100, (ma / meta.maxCurrentMa) * 100) });
    }
    if (w !== undefined && meta?.powerRatingW) {
      bars.push({ label: `of ${meta.powerRatingW * 1000}mW rating`, pct: Math.min(100, (w / meta.powerRatingW) * 100) });
    }
    return { title: probe.name, lines, bars };
  });

  $effect(() => {
    void app.renderTick;
    if (browser && svgHost) loadSchematic();
  });
</script>

<div class="bench-sim">
  <p class="facet-eyebrow mono">⑤ Simulate — the virtual bench</p>

  {#if app.projectId}
    <div class="sim-grid">
      <figure class="sim-canvas">
        <figcaption class="mono">
          schematic — click a wire or part to probe it
          <span class="fig-hint">scroll page to see results</span>
        </figcaption>
        <div class="svg-host" bind:this={svgHost}></div>
        {#if !svgLoaded}
          <p class="empty">The schematic arrives when the circuit exists.</p>
        {/if}
      </figure>

      <aside class="bench-panel">
        <button class="primary run-btn" onclick={() => run()} disabled={running || !dcStimulus}>
          {running ? 'Solving…' : '⚡ Run the bench'}
        </button>
        {#if !dcStimulus}
          <p class="small">No supply stimulus yet — ask the agent to set one
            (a dc stimulus on the supply net).</p>
        {/if}

        {#if rungShown >= 0}
          <div class="rungs mono" aria-live="polite">
            {#each RUNGS as rung, i}
              <span class="rung" class:lit={i <= rungShown}>{rung}</span>
            {/each}
          </div>
        {/if}

        {#if dcStimulus}
          <div class="knob">
            <label class="mono" for="knob">supply · {knobVolts.toFixed(1)} V</label>
            <input id="knob" type="range" min="5" max="12" step="0.5"
              bind:value={knobVolts} oninput={knobChange} />
            {#if knobActive}<p class="small">sandbox — re-solving as you turn; nothing is recorded</p>{/if}
          </div>
        {/if}

        <div class="meter-face" class:live={!!probeReading}>
          {#if probeReading}
            <p class="mono meter-title">{probeReading.title}</p>
            {#each probeReading.lines as line}
              <p class="mono meter-reading">{line}</p>
            {/each}
            {#each probeReading.bars ?? [] as bar}
              <div class="bar">
                <div class="bar-fill" class:hot={bar.pct > 85} style={`width:${bar.pct}%`}></div>
              </div>
              <p class="mono bar-label">{bar.pct.toFixed(0)}% {bar.label}</p>
            {/each}
          {:else if result}
            <p class="mono meter-idle">probe: click a wire or part</p>
          {:else}
            <p class="mono meter-idle">— run to energise —</p>
          {/if}
        </div>

        {#if result}
          <p class="mono verdict-line">
            {result.converged ? `SOLVED · ${result.rung}` : 'NO CONVERGENCE'}
            · <span class="badge-assumed">{result.provenance}</span>
          </p>
          <details class="cir-details">
            <summary class="mono">circuit.cir — check our work</summary>
            <pre class="cir">{result.cir}</pre>
          </details>
        {/if}
      </aside>
    </div>
  {:else}
    <p class="empty">No project on the bench — start one in stage 01.</p>
  {/if}
</div>

<style>
  .facet-eyebrow {
    font-size: var(--t-xs); letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--copper-ink); margin: 0 0 0.7rem;
  }
  .sim-grid { display: flex; gap: 1.2rem; align-items: flex-start; flex-wrap: wrap; }
  .sim-canvas {
    flex: 1; min-width: 24rem; margin: 0; background: var(--panel);
    border-radius: var(--r-lg); padding: 0.7rem; box-shadow: 0 1px 3px rgb(20 24 27 / 8%);
  }
  .sim-canvas figcaption {
    font-family: var(--font-mono); font-size: var(--t-xs); letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--ink-soft); margin-bottom: 0.4rem;
  }
  .fig-hint { text-transform: none; letter-spacing: 0; opacity: 0.6; float: right; }
  .svg-host :global(svg) { width: 100%; height: auto; }
  @keyframes -global-ml-flow { to { stroke-dashoffset: -12; } }

  .bench-panel { width: 17rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .run-btn { margin-top: 0; font-size: 1.02rem; }
  .rungs { display: flex; gap: 0.4rem; }
  .rung {
    font-size: var(--t-xs); padding: 0.15rem 0.5rem; border-radius: var(--r-md);
    background: #eef1f0; color: var(--ink-soft); opacity: 0.5;
    transition: all 0.3s;
  }
  .rung.lit { background: #dcefe6; color: var(--mask); opacity: 1; }

  .knob label { font-size: var(--t-xs); color: var(--ink-soft); display: block; margin-bottom: 0.2rem; }
  .knob input { width: 100%; accent-color: var(--mask); }

  .meter-face {
    background: var(--meter-face); border-radius: var(--r-lg); padding: 0.8rem 1rem;
    color: var(--meter-glow); min-height: 4.4rem;
    border-top: 3px solid #171b1e;
  }
  .meter-title { font-size: var(--t-xs); color: #9aa4ab; margin: 0 0 0.2rem; word-break: break-all; }
  .meter-reading { font-size: 1.5rem; margin: 0; letter-spacing: 0.02em; }
  .meter-idle { font-size: var(--t-sm); color: #9aa4ab; margin: 0.6rem 0; }
  .bar { background: #171b1e; border-radius: var(--r-sm); height: 8px; margin-top: 0.5rem; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--meter-glow); transition: width 0.3s; }
  .bar-fill.hot { background: var(--sev-warning); }
  .bar-label { font-size: 0.62rem; color: #9aa4ab; margin: 0.15rem 0 0; }

  .verdict-line { font-size: var(--t-xs); color: var(--ink-soft); }
  .cir-details summary { font-size: var(--t-xs); cursor: pointer; color: var(--ink-soft); }
  .cir { background: #eef1f0; padding: 0.6rem 0.8rem; border-radius: var(--r-md); font-size: var(--t-xs); overflow-x: auto; max-height: 30vh; }
</style>
