<script>
  import { app } from '$lib/app.svelte.js';
  import MessageList from './MessageList.svelte';
  import ToolTrail from './ToolTrail.svelte';
  import Composer from './Composer.svelte';

  let { messages = null, streaming = null } = $props();
</script>

<div class="conversation">
  <MessageList list={messages ?? app.messages} streaming={streaming ?? app.streamingText} cursor />
  <ToolTrail />
  {#if app.lastError}<div class="error">{app.lastError}</div>{/if}
  <Composer />
</div>

<style>
  .conversation { display: flex; flex-direction: column; gap: 0.6rem; max-width: 46rem; }
</style>
