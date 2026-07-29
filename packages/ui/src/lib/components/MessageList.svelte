<script>
  import { md } from '$lib/md.js';

  /** @type {{list: {role: string, text: string}[], streaming?: string, cursor?: boolean}} */
  let { list, streaming = '', cursor = false } = $props();
</script>

{#each list as m}
  <div class="msg {m.role}">
    <span class="who">{m.role}</span>
    {#if m.role === 'agent'}<div class="md">{@html md(m.text)}</div>{:else}{m.text}{/if}
  </div>
{/each}
{#if streaming}
  <div class="msg agent streaming">
    <span class="who">agent</span>
    <div class="md">{@html md(streaming)}</div>
    {#if cursor}<span class="cursor"></span>{/if}
  </div>
{/if}

<style>
  .msg {
    padding: 0.7rem 0.95rem; border-radius: 10px; white-space: pre-wrap;
    background: var(--panel); box-shadow: 0 1px 2px rgb(20 24 27 / 6%);
  }
  .msg.maker { background: #dcefe6; align-self: flex-end; border-radius: 10px 10px 2px 10px; }
  .msg.agent { border-radius: 10px 10px 10px 2px; }
  .msg .who {
    display: block; font-family: var(--font-mono); font-size: 0.62rem;
    letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft);
    margin-bottom: 0.2rem;
  }
  .cursor {
    display: inline-block; width: 0.5em; height: 1em; margin-left: 2px;
    background: var(--mask); vertical-align: text-bottom;
    animation: blink 1s steps(2) infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }
</style>
