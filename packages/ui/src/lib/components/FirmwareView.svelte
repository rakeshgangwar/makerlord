<script>
  import { browser } from '$app/environment';
  import {
    api, app, fwCheck, fwCompileRun, fwGenerate, fwManifestGet, fwPinPlan,
  } from '$lib/app.svelte.js';
  import { flashPanelState } from '$lib/flash.js';
  import { flashEsp, hasPort, requestPort } from '$lib/flasher.js';
  import SerialMonitor from './SerialMonitor.svelte';

  const fw = $derived(app.projectFile?.project?.firmware ?? null);
  const behaviors = $derived(fw?.behaviors ?? []);
  const roles = $derived(fw?.roles ?? []);
  const buildOk = $derived(fw?.lastBuild?.ok === true);
  const protocol = $derived(app.fwPlan?.target?.flash?.protocol ?? 'esptool-js');
  const webSerial = browser && 'serial' in navigator;

  // The panel never renders a control the engine would refuse (D47/§14):
  // the same gate the engine enforces decides what the maker sees.
  const panel = $derived(flashPanelState({
    gateOpen: app.build?.gateOpen === true,
    buildOk,
    webSerial,
    protocol,
  }));

  /** @type {any} */
  let serialMonitor = $state(null);

  async function connectPort() {
    try {
      if (await requestPort()) app.flashError = '';
      else app.flashError = 'this browser has no WebSerial';
    } catch { /* the maker dismissed the picker */ }
  }

  async function flash() {
    // The engine speaks first: fw_manifest refuses while the gate is shut.
    const manifest = await fwManifestGet();
    if (!manifest) return;
    if (!hasPort() && !(await requestPort().catch(() => false))) return;
    await serialMonitor?.stopMonitor();
    app.flashState = 'flashing';
    app.flashPercent = 0;
    app.flashError = '';
    try {
      const file = await api(
        `projects/${app.projectId}/file?path=${encodeURIComponent(manifest.bin)}&encoding=base64`,
      );
      if (file.status !== 200) throw new Error('could not fetch the compiled bin');
      await flashEsp(file.data.content, manifest.flash.baud ?? 115200, (p) => {
        app.flashPercent = p.percent;
        app.flashChip = p.chip ?? '';
        if (p.phase === 'done') app.flashState = 'done';
      });
    } catch (e) {
      app.flashState = 'error';
      app.flashError = e instanceof Error ? e.message : String(e);
    }
  }

</script>

<div class="facet fw">
  <p class="facet-eyebrow mono">⑦ Firmware — code from the circuit, never past it</p>

  <div class="fw-grid">
    <section class="panel-block">
      <h3>Behaviors <span class="small">the device's vocabulary — ask the agent to add more</span></h3>
      {#if behaviors.length === 0}
        <p class="empty">None yet. Try: “sample the moisture sensor every minute and
          light the LED above 700.”</p>
      {:else}
        <ul class="beh-list">
          {#each behaviors as b}
            <li>
              <span class="mono beh-id">{b.id}</span>
              <span class="beh-kind">{b.kind}</span>
              <span class="mono small">
                {#if b.kind === 'sample'}{b.role} every {b.everyMs} ms{/if}
                {#if b.kind === 'threshold'}{b.drive} → {b.to} when {b.watch} {b.above !== undefined ? `> ${b.above}` : `< ${b.below}`}{/if}
                {#if b.kind === 'drive'}{b.role} → {b.to}{/if}
                {#if b.kind === 'serial_log'}log {b.watch}{/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel-block">
      <h3>Pin plan <span class="small">derived from the wiring — nobody edits pins (D46)</span></h3>
      {#if roles.length === 0}
        <p class="empty">No roles yet — wire a part to an MCU gpio pin, then derive.</p>
      {:else}
        <table class="plan-table">
          <thead><tr><th>role</th><th>serves</th><th>pin</th><th>mode</th></tr></thead>
          <tbody>
            {#each roles as r}
              <tr>
                <td class="mono role">{r.role}</td>
                <td class="mono">{r.ref}.{r.pin}</td>
                <td><span class="mono pin-locked" title="derived from the netlist — read-only">{r.mcuPin} 🔒</span></td>
                <td class="mono small">{r.mode}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      {#if app.fwPlan?.unbound?.length}
        <p class="unbound">⛔ {app.fwPlan.unbound.length} behavior(s) reference roles no
          wiring supports — see the findings strip.</p>
      {/if}
      <div class="row">
        <button class="secondary" onclick={fwPinPlan}>Derive pin plan</button>
        <button class="secondary" onclick={fwCheck}>Run cross-checks</button>
        <button class="secondary" onclick={fwGenerate}>Generate code</button>
        <button class="primary" onclick={fwCompileRun} disabled={app.fwCompiling || roles.length === 0}>
          {app.fwCompiling ? 'Compiling…' : 'Compile'}
        </button>
      </div>
    </section>
  </div>

  {#if app.fwCompile}
    <section class="panel-block">
      <h3>Compile
        <span class="mono verdict" class:ok={app.fwCompile.ok} class:bad={!app.fwCompile.ok}>
          {app.fwCompile.ok ? '✓ compiled — the API is real' : '✗ failed — the compiler is the arbiter'}
        </span>
      </h3>
      <pre class="compile-log">{app.fwCompile.log}</pre>
    </section>
  {/if}

  <section class="panel-block flash" data-flash-state={panel.state}>
    <h3>Flash <span class="small">WebSerial — nothing to install</span></h3>
    {#if panel.state === 'ready' || app.flashState !== 'idle'}
      <div class="row">
        <button class="secondary" onclick={connectPort}>
          {hasPort() ? 'Serial connected ✓' : 'Connect serial port'}
        </button>
        <button class="primary" onclick={flash} disabled={app.flashState === 'flashing'}>
          {app.flashState === 'flashing' ? `Flashing ${app.flashPercent}%…` : 'Flash the board'}
        </button>
      </div>
      {#if app.flashState === 'flashing' || app.flashState === 'done'}
        <div class="flash-bar"><div class="flash-fill" style={`width: ${app.flashPercent}%`}></div></div>
        <p class="mono small">{app.flashChip ? `chip: ${app.flashChip} · ` : ''}{app.flashState === 'done' ? 'flashed ✓ — the monitor shows what it says' : `${app.flashPercent}%`}</p>
      {/if}
      {#if app.flashState === 'error'}<p class="flash-err">{app.flashError}</p>{/if}
    {:else}
      <!-- No control the engine would refuse: the reason, in full, instead. -->
      <p class="flash-locked mono">🔒 {panel.reason}</p>
    {/if}
  </section>

  <SerialMonitor bind:this={serialMonitor} />
</div>

<style>
  .fw { display: flex; flex-direction: column; gap: 0.9rem; }
  .facet-eyebrow { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--copper-ink); margin: 0; }
  .fw-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 0.9rem; }
  @media (max-width: 900px) { .fw-grid { grid-template-columns: 1fr; } }
  .panel-block { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 0.8rem 1rem; }
  h3 { margin: 0 0 0.6rem; font-size: 0.95rem; }
  h3 .small { font-weight: 400; font-size: 0.72rem; color: var(--ink-soft); margin-left: 0.4rem; }
  .empty { color: var(--ink-soft); font-size: 0.85rem; }
  .beh-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .beh-id { font-weight: 600; font-size: 0.8rem; }
  .beh-kind { background: #eef1f0; border-radius: 4px; padding: 0 0.35rem; font-size: 0.72rem; margin: 0 0.4rem; }
  .plan-table { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
  .plan-table th { text-align: left; font-size: 0.68rem; color: var(--ink-soft); font-weight: 500; padding: 0.15rem 0.6rem 0.15rem 0; }
  .plan-table td { padding: 0.2rem 0.6rem 0.2rem 0; }
  .role { font-weight: 600; }
  .pin-locked { background: #eef1f0; border-radius: 4px; padding: 0.05rem 0.35rem; font-size: 0.78rem; cursor: not-allowed; }
  .unbound { color: #b3423a; font-size: 0.8rem; }
  .row { display: flex; gap: 0.5rem; margin-top: 0.6rem; flex-wrap: wrap; }
  .verdict.ok { color: #19794d; }
  .verdict.bad { color: #b3423a; }
  .compile-log { background: var(--meter-face); color: #dfe5e2; font-size: 0.72rem; padding: 0.6rem 0.8rem; border-radius: 8px; max-height: 32vh; overflow: auto; white-space: pre-wrap; }
  .flash-locked { color: var(--ink-soft); font-size: 0.8rem; }
  .flash-bar { height: 8px; background: #e4e8e6; border-radius: 4px; margin-top: 0.5rem; overflow: hidden; }
  .flash-fill { height: 100%; background: var(--mask); transition: width 0.2s; }
  .flash-err { color: #b3423a; font-size: 0.82rem; }
</style>
