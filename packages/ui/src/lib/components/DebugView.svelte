<script>
  import {
    app, debugClose, debugObserveSelftest, debugObserveVoltage, debugStart,
  } from '$lib/app.svelte.js';
  import SerialMonitor from './SerialMonitor.svelte';

  const session = $derived(app.projectFile?.project?.debug ?? null);
  const live = $derived(session?.candidates.filter((c) => c.status === 'live') ?? []);
  const dead = $derived(session?.candidates.filter((c) => c.status === 'contradicted') ?? []);
  const obsById = $derived(new Map((session?.observations ?? []).map((o) => [o.id, o])));

  /** Plain language for a fault — the maker reads faults, not JSON. */
  function faultLabel(fault) {
    switch (fault.kind) {
      case 'no_fault': return 'nothing is wrong (the circuit is fine)';
      case 'open_joint': return `a connection at ${fault.net} is not actually made`;
      case 'bridge': return `${fault.netA} and ${fault.netB} are touching`;
      case 'reversed_part': return `${fault.ref} is in backwards`;
      case 'wrong_value': return `${fault.ref} is a ×${fault.factor} wrong value`;
      case 'dead_rail': return 'the supply rail is dead';
      default: return fault.kind;
    }
  }

  function obsLabel(id) {
    const o = obsById.get(id);
    if (!o) return id;
    if (o.kind === 'voltage') return `${o.value} ${o.unit} at ${o.net}`;
    if (o.kind === 'selftest') return `SELFTEST ${o.role} ${o.ok ? 'ok' : 'fail'}`;
    return `${o.behavior} = ${o.value}`;
  }

  function onSerialLine(line) {
    // Structured SELFTEST feeds the search; raw prints never do (§6).
    if (line.kind === 'selftest' && session?.status === 'open') {
      debugObserveSelftest(line.role, line.ok);
    }
  }
</script>

<div class="facet dbg">
  <p class="facet-eyebrow mono">⑧ Debug — one measurement at a time</p>

  {#if !session}
    <section class="panel-block">
      <h3>What misbehaves?</h3>
      <div class="row symptom">
        <select bind:value={app.debugSymptomKind} name="symptomkind" aria-label="symptom kind">
          <option value="element_dead">a part does nothing</option>
          <option value="wrong_reading">a reading is wrong</option>
          <option value="no_serial">no serial output</option>
          <option value="board_dead">the whole board is dead</option>
        </select>
        <input bind:value={app.debugSymptomRef} name="symptomref"
          placeholder="part ref (e.g. LED1)" aria-label="part reference" />
        <button class="primary" onclick={debugStart} disabled={app.debugStarting}>
          {app.debugStarting ? 'Computing signatures…' : 'Start the search'}
        </button>
      </div>
      <p class="small hint">The engine enumerates the faults that could cause it,
        predicts what each looks like on a meter, and proposes ONE measurement.</p>
    </section>
  {:else}
    {#if session.status === 'open' && session.proposed}
      <section class="panel-block proposal">
        <p class="prop-eyebrow mono">measure now — then the hypotheses show their numbers</p>
        <p class="prop-net">Voltage at <strong class="mono">{session.proposed.net}</strong></p>
        <p class="prop-why">{session.proposed.why}</p>
        <form class="row" onsubmit={(e) => {
          e.preventDefault();
          debugObserveVoltage(session.proposed.net, app.debugReading);
        }}>
          <input class="reading mono" bind:value={app.debugReading} name="reading"
            inputmode="decimal" placeholder="0.00" aria-label="measured volts" />
          <span class="mono unit">V</span>
          <button class="primary" type="submit" disabled={!app.debugReading.trim()}>Record</button>
        </form>
      </section>
    {:else if session.status === 'open'}
      <section class="panel-block verdict-block tie">
        <h3>An honest tie</h3>
        <p>No meter reading separates the remaining candidates — they predict the
          same voltages everywhere. Compare behaviour (brightness, current) or
          re-check the survivors by hand.</p>
      </section>
    {:else}
      <section class="panel-block verdict-block" data-verdict={session.status}>
        <h3>{session.status === 'localized' ? '⛳ Fault localized' : '✅ Circuit exonerated'}</h3>
        {#if session.status === 'localized'}
          <p class="verdict-fault">{faultLabel(live[0]?.fault ?? { kind: 'no_fault' })}</p>
        {:else}
          <p>Every fault hypothesis was contradicted by your readings — the
            symptom lives elsewhere (expectation, firmware behavior, the part itself).</p>
        {/if}
      </section>
    {/if}

    <section class="panel-block">
      <h3>Hypotheses
        <span class="small">candidates die only by contradiction with a reading — nothing else removes them</span>
      </h3>
      <ul class="tree">
        {#each live as c}
          <li class="cand live"><span class="lamp">●</span> {faultLabel(c.fault)}</li>
        {/each}
        {#each dead as c}
          <li class="cand dead">
            <s>{faultLabel(c.fault)}</s>
            <span class="mono killer">— contradicted by {obsLabel(c.contradictedBy)}</span>
          </li>
        {/each}
      </ul>
      {#if session.observations.length > 0}
        <p class="mono small obs-count">{session.observations.length} observation{session.observations.length === 1 ? '' : 's'} recorded</p>
      {/if}
      <div class="row">
        <button class="secondary" onclick={debugClose}>Close the session</button>
      </div>
    </section>

    <SerialMonitor onLine={onSerialLine} />
  {/if}
</div>

<style>
  .dbg { display: flex; flex-direction: column; gap: 0.9rem; }
  .facet-eyebrow { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--copper); margin: 0; }
  .panel-block { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 0.8rem 1rem; }
  h3 { margin: 0 0 0.6rem; font-size: 0.95rem; }
  h3 .small { font-weight: 400; font-size: 0.72rem; color: var(--ink-soft); margin-left: 0.4rem; }
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .symptom select, .symptom input { font-size: 0.9rem; padding: 0.5rem 0.6rem; border: 1.5px solid var(--line); border-radius: 6px; background: var(--panel); }
  .hint { color: var(--ink-soft); margin: 0.6rem 0 0; }

  /* The proposal is the bench's headline: huge type, hands busy. */
  .proposal { border: 2px solid var(--mask); background: #f2faf6; }
  .prop-eyebrow { font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mask); margin: 0; }
  .prop-net { font-size: clamp(1.6rem, 3.5vw, 2.4rem); font-weight: 800; margin: 0.3rem 0; letter-spacing: -0.02em; }
  .prop-why { color: var(--ink-soft); margin: 0 0 0.7rem; }
  .reading { width: 8rem; font-size: 1.6rem; padding: 0.4rem 0.7rem; border: 2px solid var(--mask); border-radius: 8px; text-align: right; }
  .unit { font-size: 1.2rem; color: var(--ink-soft); }

  .tree { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .cand { font-size: 0.95rem; }
  .cand.live .lamp { color: #19794d; margin-right: 0.35rem; }
  .cand.dead { color: var(--ink-soft); }
  .killer { font-size: 0.72rem; margin-left: 0.4rem; }
  .obs-count { color: var(--ink-soft); margin: 0.6rem 0 0.2rem; }

  .verdict-block[data-verdict='localized'] { border: 2px solid var(--sev-blocker); }
  .verdict-block[data-verdict='exonerated'] { border: 2px solid #19794d; }
  .verdict-block.tie { border: 2px dashed var(--line); }
  .verdict-fault { font-size: 1.25rem; font-weight: 700; }
</style>
