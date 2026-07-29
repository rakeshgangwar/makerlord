<script>
  import { app, sendPrompt } from '$lib/app.svelte.js';

  /** @type {{idle?: string}} */
  let { idle = 'reply…' } = $props();
</script>

<form class="composer" onsubmit={(e) => { e.preventDefault(); sendPrompt(app.promptDraft); app.promptDraft = ''; }}>
  <input bind:value={app.promptDraft} name="prompt"
    placeholder={app.turnActive ? 'steer the agent mid-turn…' : idle} />
  <button class="primary" type="submit">{app.turnActive ? 'Steer' : 'Send'}</button>
</form>

<style>
  .composer { display: flex; gap: 0.5rem; margin-top: 0.9rem; }
  .composer input {
    width: 100%; font-size: 1.05rem; padding: 0.85rem; box-sizing: border-box;
    font-family: var(--font-body); border: 1.5px solid var(--line);
    border-radius: 8px; background: var(--panel);
  }
  .composer input:focus { border-color: var(--mask); outline: none; }
  .composer .primary { margin-top: 0; }
</style>
