<script>
  import { app, recordMeasurement, openGate, advanceStep } from '$lib/app.svelte.js';
  import SvgViewer from '$lib/SvgViewer.svelte';

  let { build = null } = $props();
  const b = $derived(build ?? app.build);

  const current = $derived(b?.steps?.[b.currentStep] ?? null);

  /** The current step's holes + part, for the linked-view highlight (spec §9:
   *  "each step highlights affected holes in both views simultaneously"). */
  const stepHoles = $derived(current?.holes ?? []);
  const stepPart = $derived.by(() => {
    const m = current?.instruction?.match(/Place (\S+) /);
    return m ? [m[1]] : [];
  });

  const blockerCount = $derived(
    app.findings.filter((f) => f.severity === 'BLOCKER' || f.severity === 'REFUSE').length,
  );

  /** Gate checklist state, from the engine's own record. */
  const measured = $derived.by(() => {
    const names = (b?.measurements ?? []).map((m) => m.name.toLowerCase());
    return {
      continuity: names.some((n) => /resistance|continuity/.test(n)),
      supply: names.some((n) => /supply|voltage/.test(n)),
    };
  });

  /** Polarity lines come from the steps themselves — the engine wrote them. */
  const polarityNotes = $derived(
    (b?.steps ?? [])
      .filter((s) => /polarised|polarized/.test(s.instruction))
      .map((s) => s.instruction.match(/Place (\S+) /)?.[1])
      .filter(Boolean),
  );

  let continuityDraft = $state('');
  let supplyDraft = $state('');

  async function recordContinuity() {
    await recordMeasurement('rail-to-rail resistance', continuityDraft, 'Ω');
    continuityDraft = '';
  }
  async function recordSupply() {
    await recordMeasurement('supply voltage (before connection)', supplyDraft, 'V');
    supplyDraft = '';
  }
</script>

<div class="bench-row">
<div class="bench">
  {#if b && b.steps.length > 0}
    {#each b.steps as step, i}
      <div class="step" class:current={i === b.currentStep} class:dimmed={i !== b.currentStep}>
        <span class="step-n">{String(i).padStart(2, '0')}</span>
        <div class="step-body">
          <span class="step-kind">{step.kind.replace(/_/g, ' ')}</span>
          <p>{step.instruction}</p>

          {#if step.kind === 'GATE' && i === b.currentStep}
            <div class="gate">
              <p class="gate-title">The gate — numbers, not nods.</p>

              <div class="check" class:done={blockerCount === 0}>
                <span class="check-mark">{blockerCount === 0 ? '✓' : '✗'}</span>
                <span>{blockerCount === 0
                  ? 'No blockers standing'
                  : `${blockerCount} blocker${blockerCount === 1 ? '' : 's'} standing — the gate stays shut`}</span>
              </div>

              <div class="check" class:done={measured.continuity}>
                <span class="check-mark">{measured.continuity ? '✓' : '·'}</span>
                {#if measured.continuity}
                  <span>Rail-to-rail continuity recorded</span>
                {:else}
                  <div class="check-entry">
                    <span>Rail-to-rail resistance — power off, probes across the rails:</span>
                    <div class="gate-entry">
                      <input inputmode="decimal" bind:value={continuityDraft} name="continuity" placeholder="reading" />
                      <span class="unit">Ω</span>
                      <button class="primary" onclick={recordContinuity} disabled={!continuityDraft}>Record</button>
                    </div>
                  </div>
                {/if}
              </div>

              <div class="check" class:done={measured.supply}>
                <span class="check-mark">{measured.supply ? '✓' : '·'}</span>
                {#if measured.supply}
                  <span>Supply voltage measured before connection</span>
                {:else}
                  <div class="check-entry">
                    <span>Supply voltage — measured at the battery, BEFORE connecting:</span>
                    <div class="gate-entry">
                      <input inputmode="decimal" bind:value={supplyDraft} name="supplyv" placeholder="reading" />
                      <span class="unit">V</span>
                      <button class="primary" onclick={recordSupply} disabled={!supplyDraft}>Record</button>
                    </div>
                  </div>
                {/if}
              </div>

              {#if polarityNotes.length > 0}
                <div class="check">
                  <span class="check-mark">👁</span>
                  <span>Polarised parts — re-check orientation on the board:
                    <span class="mono">{polarityNotes.join(', ')}</span></span>
                </div>
              {/if}

              {#if app.prediction}
                <p class="predicted">
                  Predicted ~{app.prediction.totalCurrentMa?.toFixed(1)} mA
                  {app.prediction.railVoltage ? `on the ${app.prediction.railVoltage} V rail` : ''}
                  — compare against what you read.
                </p>
              {/if}
              <button class="primary" onclick={openGate}
                disabled={b.gateOpen || !(measured.continuity && measured.supply)}>
                {b.gateOpen ? 'Gate open ✓' : 'Open the gate'}
              </button>
            </div>
          {/if}

          {#if i === b.currentStep && step.kind !== 'GATE'}
            <button class="primary step-done" onclick={() => advanceStep(i + 1)}
              disabled={i + 1 >= b.steps.length}>
              ✓ Done — next step
            </button>
          {/if}
          {#if i === b.currentStep && step.kind === 'GATE' && b.gateOpen}
            <button class="primary step-done" onclick={() => advanceStep(i + 1)}>
              ✓ Gate open — continue
            </button>
          {/if}
        </div>
      </div>
    {/each}
    {#if b.currentStep > 0}
      <button class="step-back" onclick={() => advanceStep(b.currentStep - 1)}>← back a step</button>
    {/if}
  {:else}
    <p class="empty">No build steps yet — they arrive when the circuit exists.</p>
  {/if}
</div>

{#if app.projectId}
  <div class="views">
    <figure class="board">
      <figcaption class="mono">the board <span class="fig-hint">step holes glow copper</span></figcaption>
      <SvgViewer url={`/render/${app.projectId}/breadboard?t=${app.renderTick}`}
        alt="breadboard" emptyNote="fills in as parts are placed"
        highlightHoles={stepHoles} highlightParts={stepPart} />
    </figure>
    <figure class="board schematic-mini">
      <figcaption class="mono">schematic</figcaption>
      <SvgViewer url={`/render/${app.projectId}/schematic?t=${app.renderTick}`}
        alt="schematic" emptyNote="arrives with the circuit"
        highlightParts={stepPart} />
    </figure>
  </div>
{/if}
</div>

<style>
  /* ── bench: steps left, both views at your side — like the real bench ── */
  .bench-row { display: flex; gap: 1.4rem; align-items: flex-start; flex-wrap: wrap; }
  .bench { flex: 1; max-width: 44rem; min-width: 22rem; }
  .views { width: 26rem; max-width: 100%; position: sticky; top: 0; display: flex; flex-direction: column; gap: 0.8rem; }
  .board {
    margin: 0; background: var(--panel); border-radius: 10px; padding: 0.7rem;
    box-shadow: 0 1px 3px rgb(20 24 27 / 8%);
  }
  .board figcaption {
    font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--ink-soft); margin-bottom: 0.4rem;
  }
  .board :global(.viewer) { height: 280px; }
  .schematic-mini :global(.viewer) { height: 170px; }
  .fig-hint { text-transform: none; letter-spacing: 0; opacity: 0.6; float: right; }

  .step { display: flex; gap: 0.9rem; padding: 0.7rem 1rem; margin: 0.45rem 0; background: var(--panel); border-radius: 8px; }
  .step.current { font-size: 1.35rem; box-shadow: 0 2px 8px rgb(20 24 27 / 10%); border-left: 4px solid var(--mask); }
  .step.dimmed { opacity: 0.45; }
  .step-n { font-family: var(--font-mono); font-size: 0.8em; color: var(--ink-soft); padding-top: 0.2em; }
  .step-kind {
    font-family: var(--font-mono); font-size: 0.62em; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--copper);
  }
  .step-body { flex: 1; }
  .step-body p { margin: 0.15em 0 0; }
  .step-done { font-size: 0.72em; }
  .step-back {
    border: none; background: transparent; color: var(--ink-soft);
    cursor: pointer; font-size: 0.8rem; padding: 0.4rem 0.2rem;
  }

  .gate { border: 2px solid var(--mask); border-radius: 10px; padding: 1rem; margin-top: 0.7rem; background: #f2faf6; font-size: 0.75em; }
  .gate-title { font-weight: 600; margin: 0 0 0.6rem; font-size: 1.1em; }
  .check { display: flex; gap: 0.6rem; align-items: baseline; padding: 0.3rem 0; }
  .check.done { color: var(--mask); }
  .check-mark { font-family: var(--font-mono); width: 1.1em; }
  .check-entry { flex: 1; }
  .gate-entry { display: flex; gap: 0.6rem; align-items: center; margin-top: 0.35rem; }
  .gate-entry input {
    font-family: var(--font-mono); font-size: 1.5rem; width: 8rem;
    padding: 0.4rem 0.6rem; border: 1.5px solid var(--line); border-radius: 8px;
  }
  .gate-entry .unit { font-family: var(--font-mono); color: var(--ink-soft); }
  .gate .primary { margin-top: 0.6rem; }
  .predicted { color: var(--mask); font-weight: 600; font-family: var(--font-mono); font-size: 0.95em; margin: 0.5rem 0 0; }
</style>
