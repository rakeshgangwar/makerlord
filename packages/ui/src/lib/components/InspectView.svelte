<script>
  import { app, runCheck, runSimulation } from '$lib/app.svelte.js';
  import SvgViewer from '$lib/SvgViewer.svelte';

  /** An empty breadboard is honest, not broken: placement is a ⑥ act. */
  const nothingPlaced = $derived(
    !!app.projectFile?.project?.circuit &&
    !app.projectFile.project.circuit.parts.some((p) => p.placement),
  );
</script>

<div class="inspect">
  {#if app.projectId}
    <div class="canvas-row">
      {#each ['blocks', 'schematic', 'breadboard'] as kind}
        <figure>
          <figcaption>{kind} <span class="fig-hint">scroll to zoom · drag to pan</span></figcaption>
          <SvgViewer url={`/render/${app.projectId}/${kind}?t=${app.renderTick}`} alt={`${kind} projection`}
            emptyNote={kind === 'breadboard' && nothingPlaced
              ? 'parts are placed at ⑥ Prototype — ask the agent to place them'
              : 'arrives when the circuit exists'} />
          {#if kind === 'breadboard' && nothingPlaced}
            <p class="placed-note">circuit built, nothing placed yet — the board fills at ⑥ Prototype</p>
          {/if}
        </figure>
      {/each}
    </div>
    <div class="inspect-actions">
      <button class="secondary" onclick={() => runCheck(app.stage === 4 ? 'check_architecture' : 'check_circuit')}>
        Run checks
      </button>
      {#if app.stage === 5}
        <button class="primary sim-btn" onclick={runSimulation} disabled={app.simRunning}>
          {app.simRunning ? 'Solving…' : 'Run .op simulation'}
        </button>
      {/if}
    </div>
    {#if app.stage === 5 && app.simResult}
      <div class="sim-result">
        <p class="mono sim-head">
          {app.simResult.converged ? `SOLVED · rung: ${app.simResult.rung}` : 'DID NOT CONVERGE'}
          · provenance: <span class="badge-assumed">{app.simResult.provenance}</span>
        </p>
        {#if app.simResult.converged}
          <table class="sim-table">
            <thead><tr><th>node</th><th>V</th></tr></thead>
            <tbody>
              {#each Object.entries(app.simResult.nodeVoltages) as [node, v]}
                <tr><td class="mono">{node}</td><td class="mono">{v.toFixed(3)}</td></tr>
              {/each}
            </tbody>
          </table>
          {#if Object.keys(app.simResult.deviceDissipationW).length > 0}
            <table class="sim-table">
              <thead><tr><th>device</th><th>W</th></tr></thead>
              <tbody>
                {#each Object.entries(app.simResult.deviceDissipationW) as [ref, w]}
                  <tr><td class="mono">{ref}</td><td class="mono">{w.toFixed(3)}</td></tr>
                {/each}
              </tbody>
            </table>
          {/if}
        {/if}
        <details><summary class="mono">circuit.cir — check our work</summary>
          <pre class="cir">{app.simResult.cir}</pre>
        </details>
      </div>
    {/if}
  {:else}
    <p class="empty">No project on the bench — start one in stage 01.</p>
  {/if}
</div>

<style>
  .canvas-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .canvas-row figure {
    margin: 0; background: var(--panel); border-radius: 8px; padding: 0.6rem;
    box-shadow: 0 1px 3px rgb(20 24 27 / 8%); width: 380px;
  }
  .canvas-row figcaption {
    font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--ink-soft); margin-bottom: 0.4rem;
  }
  .canvas-row figure :global(.viewer) { height: 240px; }
  .fig-hint { text-transform: none; letter-spacing: 0; opacity: 0.6; float: right; }
  .placed-note { color: var(--ink-soft); font-size: 0.74rem; margin: 0.4rem 0 0; }

  .inspect-actions { display: flex; gap: 0.6rem; align-items: center; }
  .sim-btn { margin-top: 0; }
  .sim-result { background: var(--panel); border-radius: 8px; padding: 0.8rem 1rem; margin-top: 0.9rem; max-width: 40rem; }
  .sim-head { font-size: 0.78rem; letter-spacing: 0.05em; color: var(--ink-soft); }
  .sim-table { border-collapse: collapse; margin: 0.5rem 1.5rem 0.5rem 0; display: inline-table; }
  .sim-table th, .sim-table td { border: 1px solid var(--line); padding: 0.2rem 0.6rem; font-size: 0.8rem; text-align: left; }
  .sim-table th { font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); }
  .cir { background: #eef1f0; padding: 0.6rem 0.8rem; border-radius: 8px; font-size: 0.75rem; overflow-x: auto; }
</style>
