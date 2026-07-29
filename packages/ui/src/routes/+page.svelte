<script>
  import { onMount } from 'svelte';
  import { postureFor } from '$lib/postures.js';
  import { app, boot } from '$lib/app.svelte.js';
  import StageRail from '$lib/components/StageRail.svelte';
  import ConverseStart from '$lib/components/ConverseStart.svelte';
  import Conversation from '$lib/components/Conversation.svelte';
  import InspectView from '$lib/components/InspectView.svelte';
  import BenchView from '$lib/components/BenchView.svelte';
  import ChatDock from '$lib/components/ChatDock.svelte';
  import ArtifactsPanel from '$lib/components/ArtifactsPanel.svelte';
  import FileOverlay from '$lib/components/FileOverlay.svelte';
  import FindingStrip from '$lib/components/FindingStrip.svelte';

  const posture = $derived(postureFor(app.stage));

  onMount(boot);
</script>

<div class="shell" data-posture={posture}>
  <StageRail />

  <section class="workspace" aria-label="Workspace">
    {#if posture === 'converse'}
      {#if app.messages.length === 0 && !app.projectId}
        <ConverseStart />
      {:else}
        <Conversation />
      {/if}
    {:else if posture === 'inspect'}
      <InspectView />
    {:else if posture === 'bench'}
      <BenchView />
    {:else}
      <div class="decide"><p class="empty">A report, a number, one action — arrives with its stage.</p></div>
    {/if}

    {#if posture !== 'converse' && app.projectId}
      <ChatDock />
    {/if}
  </section>

  <ArtifactsPanel />
</div>

<FileOverlay />
<FindingStrip />

<style>
  .shell { display: flex; flex: 1; gap: 1.5rem; padding: 1.25rem 1.5rem; }
  .workspace { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .workspace > :global(:first-child) { flex: 1; }

  /* ── responsive: the strip never collapses ── */
  @media (max-width: 1100px) { .shell :global(.artifacts) { display: none; } }
  @media (max-width: 700px) {
    .shell { flex-direction: column; }
    .shell :global(.rail) { flex-direction: row; flex-wrap: wrap; min-width: 0; }
    .shell :global(.stage) { border-left-width: 3px; }
  }
</style>
