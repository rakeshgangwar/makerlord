<script>
  import { STAGE_PURPOSE } from '$lib/postures.js';
  import { app } from '$lib/app.svelte.js';
  import MessageList from './MessageList.svelte';
  import ToolTrail from './ToolTrail.svelte';
  import Composer from './Composer.svelte';

  let { messages = null, streaming = null } = $props();
  const shown = $derived(messages ?? app.messages);
</script>

<div class="conversation">
  {#if shown.length === 0 && !(streaming ?? app.streamingText)}
    <div class="stage-empty">
      <p class="facet-eyebrow mono">{'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰'[app.stage - 1]} stage {app.stage}</p>
      <p class="empty">{STAGE_PURPOSE[app.stage]}</p>
    </div>
  {/if}
  <MessageList list={shown} streaming={streaming ?? app.streamingText} cursor />
  <ToolTrail />
  {#if app.lastError}<div class="error">{app.lastError}</div>{/if}
  <Composer />
</div>

<style>
  .conversation { display: flex; flex-direction: column; gap: 0.6rem; max-width: 46rem; }
  .stage-empty { padding: 0.4rem 0.2rem; }
  .facet-eyebrow {
    font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--copper); margin: 0;
  }
  .stage-empty .facet-eyebrow { margin-bottom: 0.2rem; }
</style>
