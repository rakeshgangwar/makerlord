<script>
  import { app, startProject, openProject } from '$lib/app.svelte.js';

  let { projects = null } = $props();
  const list = $derived(projects ?? app.projectList);
</script>

<div class="converse-start">
  <p class="eyebrow">Idea → simulate → prototype → product</p>
  <h1>What do you<br />want to make?</h1>
  <p class="hint">
    “a soil moisture sensor for Home Assistant” · “a badge with
    blinking LEDs” · “a robot that follows a line”
  </p>
  <textarea rows="3" bind:value={app.intentDraft} name="intent"
    placeholder="Describe it in your own words…"
    onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), startProject())}
  ></textarea>
  <button class="primary" onclick={startProject} disabled={!app.intentDraft.trim()}>
    Start
  </button>
  {#if app.lastError}<p class="error">{app.lastError}</p>{/if}
  {#if list.length > 0}
    <div class="project-list">
      <h2 class="mono list-head">On the bench</h2>
      {#each list as p}
        <button class="project-row" onclick={() => openProject(p.projectId)}>
          <span class="project-intent">{p.intent}</span>
          <span class="mono project-meta">{p.projectId.slice(0, 6)} · {p.updatedAt.slice(0, 10)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .converse-start { max-width: 40rem; margin: 9vh auto 0; }
  .eyebrow {
    font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--copper); margin: 0 0 0.4rem;
  }
  h1 {
    font-size: clamp(2.2rem, 5vw, 3.4rem); font-weight: 800;
    letter-spacing: -0.03em; line-height: 1.02; margin: 0 0 0.8rem;
  }
  .hint { color: var(--ink-soft); margin: 0 0 1.2rem; }
  textarea {
    width: 100%; font-size: 1.05rem; padding: 0.85rem; box-sizing: border-box;
    font-family: var(--font-body); border: 1.5px solid var(--line);
    border-radius: 8px; background: var(--panel);
  }
  textarea:focus { border-color: var(--mask); outline: none; }
  .project-list { margin-top: 2.5rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .list-head {
    font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--ink-soft); margin: 0 0 0.3rem;
  }
  .project-row {
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 1rem; text-align: left; border: 1.5px solid var(--line);
    background: var(--panel); border-radius: 8px; padding: 0.6rem 0.9rem;
    cursor: pointer; font-size: 0.95rem;
  }
  .project-row:hover { border-color: var(--mask); }
  .project-intent { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-meta { font-size: 0.7rem; color: var(--ink-soft); flex-shrink: 0; }
</style>
