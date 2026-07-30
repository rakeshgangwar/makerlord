<script>
  import { app } from '$lib/app.svelte.js';
  import { presentSeverity } from '$lib/severity.js';

  /** Optional prop with store fallback: the app passes nothing; a design
   *  tool or test passes findings directly. */
  let { findings = null } = $props();
  const list = $derived(findings ?? app.findings);
  const blockerCount = $derived(
    list.filter((f) => f.severity === 'BLOCKER' || f.severity === 'REFUSE').length,
  );
</script>

<!-- The finding strip is an instrument, not a notification tray. -->
<footer class="meter" aria-live="polite" aria-label="Findings">
  <div class="meter-readout">
    <span class="lamp" class:alert={blockerCount > 0} class:warn={blockerCount === 0 && list.length > 0}></span>
    <span class="mono readout-text">
      {#if list.length === 0}READY · no open findings{:else}{list.length} finding{list.length === 1 ? '' : 's'} · {blockerCount} blocking{/if}
    </span>
  </div>
  {#if list.length > 0}
    <div class="cards">
      {#each list as f}
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
  .readout-text { font-size: var(--t-sm); letter-spacing: 0.06em; }
  .cards { display: flex; flex-direction: column; gap: 0.45rem; margin-top: 0.55rem; max-height: 28vh; overflow-y: auto; }
  .finding {
    background: #2c3236; border-left: 4px solid var(--sev);
    border-radius: var(--r-md); padding: 0.5rem 0.85rem;
  }
  .finding .sev { font-weight: 700; color: var(--sev); font-size: var(--t-sm); filter: brightness(1.5); }
  .finding .rule { margin-left: 0.6rem; font-size: var(--t-sm); color: #9aa4ab; }
  .finding .claim { margin: 0.25rem 0 0; font-size: var(--t-md); }
  .finding .fix { margin: 0.2rem 0 0; font-size: var(--t-sm); color: #b9c3c0; }
</style>
