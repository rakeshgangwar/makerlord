<script>
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import { postureFor, STAGE_PURPOSE } from '$lib/postures.js';
  import { adoptUrlParams, app, boot, refreshProjections } from '$lib/app.svelte.js';
  import StageRail from '$lib/components/StageRail.svelte';
  import ConverseStart from '$lib/components/ConverseStart.svelte';
  import FeasibilityView from '$lib/components/FeasibilityView.svelte';
  import RequirementsView from '$lib/components/RequirementsView.svelte';
  import ArchitectureView from '$lib/components/ArchitectureView.svelte';
  import InspectView from '$lib/components/InspectView.svelte';
  import SimulateView from '$lib/components/SimulateView.svelte';
  import FirmwareView from '$lib/components/FirmwareView.svelte';
  import DebugView from '$lib/components/DebugView.svelte';
  import BenchView from '$lib/components/BenchView.svelte';
  import AgentPanel from '$lib/components/AgentPanel.svelte';
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
      return app.projectId ? 'overview' : 'start';
    }
    if (app.stage === 5) return 'simulate';
    if (app.stage === 7) return 'firmware';
    if (app.stage === 8) return 'debug';
    return posture;
  });

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
  // loaded, retry — ONCE per lens entry, and untracked: refreshProjections
  // mutates reactive state (renderTick), and a tracked call would make this
  // effect subscribe to the very counter it bumps. That exact loop starved
  // Chrome at 3,900 requests before the 2026-07-30 audit caught it.
  let retriedBuild = false;
  $effect(() => {
    const needsBuild = (lens === 'bench' || lens === 'simulate') && app.projectId;
    if (needsBuild && !untrack(() => app.build) && !retriedBuild) {
      retriedBuild = true;
      untrack(() => refreshProjections());
    }
    if (!needsBuild) retriedBuild = false;
  });
</script>

<svelte:head>
  <title>{app.projectFile?.project?.intent
    ? `${app.projectFile.project.intent} · stage ${app.stage} — MakerLord`
    : 'MakerLord'}</title>
</svelte:head>

<div class="shell" data-posture={posture}>
  <StageRail />

  <section id="workspace" class="workspace" aria-label="Workspace">
    <h1 class="sr-only">
      {app.projectFile?.project?.intent ?? 'MakerLord'} — stage {app.stage}
    </h1>
    <div class="lens">
      {#if lens === 'start'}
        <ConverseStart />
      {:else if lens === 'overview'}
        <div class="overview">
          <p class="facet-eyebrow mono">① Idea — where it all starts</p>
          <h2 class="intent">{app.projectFile?.project?.intent ?? '…'}</h2>
          <p class="empty">{STAGE_PURPOSE[1]} The agent column on the right is
            where the talking happens — the tree on the left fills in as
            decisions settle.</p>
        </div>
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
        <div class="decide">
          <p class="empty">{STAGE_PURPOSE[app.stage] ?? 'A report, a number, one action — arrives with its stage.'}</p>
        </div>
      {/if}
    </div>

  </section>

  {#if app.projectId}
    <AgentPanel />
  {/if}
</div>

<FileOverlay />
<FindingStrip />

<style>
  .shell { display: flex; flex: 1; gap: 1.5rem; padding: 1.25rem 1.5rem; min-height: 0; }
  .shell :global(.rail) { overflow: hidden; }
  /* Capped and centered: at 1920 the content column must not hug the
     rail with half the mat empty (2026-07-30 audit). */
  .workspace {
    flex: 1 1 auto; min-width: 0; max-width: 96rem; margin-inline: auto;
    width: 100%; display: flex; flex-direction: column; min-height: 0;
  }
  .lens { flex: 1; overflow-y: auto; min-height: 0; padding-bottom: 0.5rem; }
  .overview { max-width: 40rem; }
  .overview .intent { font-size: var(--t-xl); margin: var(--s2) 0 var(--s3); }
  .facet-eyebrow {
    font-size: var(--t-xs); letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--copper-ink); margin: 0;
  }

  /* ── responsive: the strip never collapses; on phones the agent column
     docks under the workspace ── */
  @media (max-width: 1100px) {
    .shell { flex-wrap: wrap; }
    .shell :global(.agent) { order: 3; }
  }
  @media (max-width: 700px) {
    .shell { flex-direction: column; padding: 0.6rem 0.8rem; gap: 0.8rem; }
    .shell :global(.rail) { min-width: 0; overflow: visible; }
  }
</style>
