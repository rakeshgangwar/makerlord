<script>
  import { browser } from '$app/environment';
  import { app } from '$lib/app.svelte.js';
  import { hasPort, openMonitor, requestPort } from '$lib/flasher.js';

  /** Shared by ⑦ and ⑧ — one port, one broker, one honesty rule:
   *  device output is unverified; only SELFTEST/LOG get structure.
   *  onLine lets a lens consume structured lines (⑧ feeds debug_observe). */
  let { onLine = null } = $props();

  const webSerial = browser && 'serial' in navigator;

  /** @type {{stop: () => Promise<void>} | null} */
  let monitor = $state(null);

  export async function stopMonitor() {
    if (monitor) {
      await monitor.stop();
      monitor = null;
      app.serialOpen = false;
    }
  }

  async function toggleMonitor() {
    if (monitor) { await stopMonitor(); return; }
    if (!hasPort() && !(await requestPort().catch(() => false))) return;
    const m = openMonitor(115200, (line) => {
      app.serialLines = [...app.serialLines.slice(-199), line];
      if (onLine) onLine(line);
    });
    if (m) { monitor = m; app.serialOpen = true; }
  }
</script>

<section class="panel-block">
  <h3>Serial monitor
    <span class="small">[device output — unverified] — a print claiming “all good” proves nothing</span>
  </h3>
  <div class="row">
    <button class="secondary" onclick={toggleMonitor} disabled={!webSerial}>
      {app.serialOpen ? 'Stop monitor' : 'Open monitor'}
    </button>
  </div>
  {#if app.serialLines.length > 0}
    <div class="serial-log mono">
      {#each app.serialLines as line}
        {#if line.kind === 'selftest'}
          <p class="ser-selftest" class:fail={!line.ok}>SELFTEST {line.role} ({line.mode ?? ''}) {line.ok ? 'ok ✓' : 'FAIL ✗'}</p>
        {:else if line.kind === 'log'}
          <p class="ser-log">{line.behavior} = {line.value}</p>
        {:else}
          <p class="ser-raw">{line.text}</p>
        {/if}
      {/each}
    </div>
  {/if}
</section>

<style>
  .panel-block { background: var(--panel); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 0.8rem 1rem; }
  h3 { margin: 0 0 0.6rem; font-size: var(--t-md); }
  h3 .small { font-weight: 400; font-size: var(--t-xs); color: var(--ink-soft); margin-left: 0.4rem; }
  .row { display: flex; gap: 0.5rem; }
  .serial-log { background: var(--meter-face); border-radius: var(--r-md); padding: 0.5rem 0.8rem; margin-top: 0.6rem; max-height: 30vh; overflow-y: auto; font-size: var(--t-md); }
  .serial-log p { margin: 0.1rem 0; }
  .ser-selftest { color: #19c37d; font-weight: 600; }
  .ser-selftest.fail { color: #ff6b61; }
  .ser-log { color: #8ecbff; }
  .ser-raw { color: #b9c3c0; }
</style>
