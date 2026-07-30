<script>
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { postureFor } from '$lib/postures.js';
  import { adoptUrlParams, app, boot, refreshProjections } from '$lib/app.svelte.js';
  import StageRail from '$lib/components/StageRail.svelte';
  import ConverseStart from '$lib/components/ConverseStart.svelte';
  import Conversation from '$lib/components/Conversation.svelte';
  import FeasibilityView from '$lib/components/FeasibilityView.svelte';
  import RequirementsView from '$lib/components/RequirementsView.svelte';
  import ArchitectureView from '$lib/components/ArchitectureView.svelte';
  import InspectView from '$lib/components/InspectView.svelte';
  import SimulateView from '$lib/components/SimulateView.svelte';
  import FirmwareView from '$lib/components/FirmwareView.svelte';
  import DebugView from '$lib/components/DebugView.svelte';
  import BenchView from '$lib/components/BenchView.svelte';
  import ChatDock from '$lib/components/ChatDock.svelte';
  import ArtifactsPanel from '$lib/components/ArtifactsPanel.svelte';
  import FileOverlay from '$lib/components/FileOverlay.svelte';
  import FindingStrip from '$lib/components/FindingStrip.svelte';

  const posture = $derived(postureFor(app.stage));

  // The conversation is the constant; the workspace lens changes per stage.
  // Stage ① keeps the full conversation as its surface; ②③④ foreground
  // their facet (verdict, requirements table, blocks) with the chat docked.
  const lens = $derived.by(() => {
    if (posture === 'converse') {
      if (app.stage === 2) return 'feasibility';
      if (app.stage === 3) return 'requirements';
      if (app.stage === 4) return 'architecture';
      return app.messages.length === 0 && !app.projectId ? 'start' : 'conversation';
    }
    if (app.stage === 5) return 'simulate';
    if (app.stage === 7) return 'firmware';
    if (app.stage === 8) return 'debug';
    return posture;
  });

  const dockVisible = $derived(
    app.projectId && lens !== 'start' && lens !== 'conversation',
  );

  onMount(() => {
    // URL first: ?p= and ?stage= win over localStorage — refresh keeps
    // your page, and links deep-link.
    adoptUrlParams(page.url);
    boot();
  });

  // Back/forward walk the stages: the URL is the source of truth.
  $effect(() => {
    const s = Number(page.url.searchParams.get('stage'));
    if (Number.isFinite(s) && s >= 1 && s <= 17 && s !== app.stage) {
      app.stage = s;
      app.stagePinned = true;
    }
  });

  // A deploy restarts the API mid-boot sometimes; a failed first fetch must
  // not leave the bench empty. When a lens needs build state and none is
  // loaded, retry.
  $effect(() => {
    if ((lens === 'bench' || lens === 'simulate') && app.projectId && !app.build) {
      refreshProjections();
    }
  });
</script>

<div class="shell" data-posture={posture}>
  <StageRail />

  <section class="workspace" aria-label="Workspace">
    <div class="lens">
      {#if lens === 'start'}
        <ConverseStart />
      {:else if lens === 'conversation'}
        <Conversation />
      {:else if lens === 'feasibility'}
        <FeasibilityView />
      {:else if lens === 'requirements'}
        <RequirementsView />
      {:else if lens === 'architecture'}
        <ArchitectureView />
      {:else if lens === 'simulate'}
        <SimulateView />
      {:else if lens === 'firmware'}
        <FirmwareView />
      {:else if lens === 'debug'}
        <DebugView />
      {:else if lens === 'inspect'}
        <InspectView />
      {:else if lens === 'bench'}
        <BenchView />
      {:else}
        <div class="decide"><p class="empty">A report, a number, one action — arrives with its stage.</p></div>
      {/if}
    </div>

    {#if dockVisible}
      <ChatDock />
    {/if}
  </section>

  <ArtifactsPanel />
</div>

<FileOverlay />
<FindingStrip />

<style>
  .shell { display: flex; flex: 1; gap: 1.5rem; padding: 1.25rem 1.5rem; min-height: 0; }
  .shell :global(.rail) { overflow-y: auto; }
  .shell :global(.artifacts) { overflow-y: auto; }
  .workspace { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
  /* The lens scrolls; the dock keeps one fixed home below it. */
  .lens { flex: 1; overflow-y: auto; min-height: 0; padding-bottom: 0.5rem; }
  .workspace :global(.dock) { position: static; margin-top: 0.6rem; }

  /* ── responsive: the strip never collapses ── */
  @media (max-width: 1100px) { .shell :global(.artifacts) { display: none; } }
  @media (max-width: 700px) {
    .shell { flex-direction: column; }
    .shell :global(.rail) { flex-direction: row; flex-wrap: wrap; min-width: 0; }
    .shell :global(.stage) { border-left-width: 3px; }
  }
</style>
