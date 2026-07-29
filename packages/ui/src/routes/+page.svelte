<script>
  import { postureFor, layoutFor, stagePhase } from '$lib/postures.js';
  import { presentSeverity } from '$lib/severity.js';
  import { FindingSurface } from '$lib/findings.js';

  // The three-region frame (UI spec §2): stage rail, workspace, artifacts,
  // with the finding strip spanning the frame and the conversation reachable.
  let stage = $state(1);
  let width = $state(1280);

  const posture = $derived(postureFor(stage));
  const layout = $derived(layoutFor(posture, width));

  const findings = new FindingSurface();
  let cards = $state(findings.list());

  const STAGE_NAMES = [
    'Idea', 'Feasibility', 'Requirements', 'Architecture', 'Simulate',
    'Prototype ★', 'Firmware', 'Debug', 'PCB', 'Mechanical',
    'Manufacturing', 'Fabricate', 'First article', 'Test', 'Compliance',
    'Document', 'Produce',
  ];
</script>

<svelte:window bind:innerWidth={width} />

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
  </nav>

  <section class="workspace" aria-label="Workspace">
    {#if posture === 'converse'}
      <!-- A blank canvas is intimidating; a text box is not (spec §3). -->
      <div class="converse">
        <h1>What do you want to make?</h1>
        <p class="hint">
          e.g. “a soil moisture sensor for Home Assistant” · “a badge with
          blinking LEDs” · “a robot that follows a line”
        </p>
        <textarea rows="3" placeholder="Describe it in your own words…"></textarea>
      </div>
    {:else if posture === 'inspect'}
      <div class="canvas-placeholder">Canvas — zoom, pan, linked selection</div>
    {:else if posture === 'bench'}
      <div class="bench-placeholder">One step, huge type, hands busy</div>
    {:else}
      <div class="decide-placeholder">A report, a number, one action</div>
    {/if}
  </section>

  {#if layout.visible.includes('artifacts')}
    <aside class="artifacts" aria-label="Artifacts">
      <h2>Artifacts</h2>
      <ul><li>project.json</li></ul>
    </aside>
  {/if}
</div>

<!-- The finding strip: always visible, never agent-authored (spec §7). -->
<footer class="finding-strip" aria-live="polite" aria-label="Findings">
  {#if cards.length === 0}
    <span class="all-clear">No open findings.</span>
  {:else}
    {#each cards as card}
      {@const p = presentSeverity(card.finding.severity)}
      <article class="finding" style={`border-color: ${p.color}`}>
        <span class="sev">{p.icon} {p.label}</span>
        <span class="rule">{card.finding.ruleId}</span>
        <span class="badge">{card.provenance}</span>
        <p>{card.finding.message}</p>
        {#if card.finding.suggestedFix}
          <p class="fix">→ {card.finding.suggestedFix}</p>
        {/if}
      </article>
    {/each}
  {/if}
</footer>

<style>
  .shell {
    display: flex;
    flex: 1;
    gap: 1rem;
    padding: 1rem;
  }
  .rail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 11rem;
  }
  .stage {
    text-align: left;
    border: none;
    background: transparent;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .stage.active { background: #1d4ed8; color: white; }
  .workspace { flex: 1; }
  .converse h1 { font-size: 1.6rem; }
  .hint { color: #666; }
  textarea { width: 100%; font-size: 1.1rem; padding: 0.75rem; }
  .artifacts { min-width: 12rem; border-left: 1px solid #ddd; padding-left: 1rem; }
  .finding-strip {
    border-top: 2px solid #ddd;
    padding: 0.5rem 1rem;
    background: #fff;
  }
  .finding { border-left: 4px solid; padding: 0.25rem 0.75rem; margin: 0.25rem 0; }
  .sev { font-weight: 700; }
  .rule { font-family: monospace; margin-left: 0.5rem; }
  .badge { margin-left: 0.5rem; font-size: 0.75rem; background: #eee; padding: 0 0.4rem; border-radius: 8px; }
  .fix { color: #333; }
  .all-clear { color: #666; }
</style>
