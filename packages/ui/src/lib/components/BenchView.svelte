<script>
  import { app, recordMeasurement, openGate } from '$lib/app.svelte.js';
</script>

<div class="bench">
  {#if app.build && app.build.steps.length > 0}
    {#each app.build.steps as step, i}
      <div class="step" class:current={i === app.build.currentStep} class:dimmed={i !== app.build.currentStep}>
        <span class="step-n">{String(i).padStart(2, '0')}</span>
        <div class="step-body">
          <span class="step-kind">{step.kind.replace(/_/g, ' ')}</span>
          <p>{step.instruction}</p>
          {#if step.kind === 'GATE' && i === app.build.currentStep}
            <div class="gate">
              <p class="gate-title">Preflight — enter what the meter reads.</p>
              <div class="gate-entry">
                <input inputmode="decimal" bind:value={app.measureValue} name="reading" placeholder="reading" />
                <span class="unit">{app.measureUnit}</span>
                <button class="primary" onclick={recordMeasurement} disabled={!app.measureValue}>Record</button>
              </div>
              {#if app.prediction}
                <p class="predicted">
                  Predicted ~{app.prediction.totalCurrentMa?.toFixed(1)} mA
                  {app.prediction.railVoltage ? `on the ${app.prediction.railVoltage} V rail` : ''}
                </p>
                <button class="primary" onclick={openGate} disabled={app.build.gateOpen}>
                  {app.build.gateOpen ? 'Gate open ✓' : 'Open the gate'}
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

<style>
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
</style>
