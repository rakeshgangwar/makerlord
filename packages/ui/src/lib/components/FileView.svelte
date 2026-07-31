<script>
  import { app } from '$lib/app.svelte.js';
  import { md } from '$lib/md.js';
  import SvgViewer from '$lib/SvgViewer.svelte';

  /** Shiki, lazily: the highlighter loads the first time a code file
   *  opens, renders both themes, and the page's data-theme picks one. */
  const LANGS = {
    h: 'cpp', cpp: 'cpp', c: 'c', ino: 'cpp', js: 'javascript', mjs: 'javascript',
    ts: 'typescript', json: 'json', yaml: 'yaml', yml: 'yaml', cir: 'spice',
    jsonl: 'json', sh: 'bash', md: 'markdown',
  };
  let highlighted = $state('');
  let highlighter = null;

  async function highlight(path, content) {
    highlighted = '';
    const ext = path.split('.').pop();
    const lang = LANGS[ext];
    if (!lang || ext === 'md') return;
    const { createHighlighter } = await import('shiki');
    highlighter ??= await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [...new Set(Object.values(LANGS))].filter((l) => l !== 'spice'),
    });
    const useLang = lang === 'spice' ? 'text' : lang;
    highlighted = highlighter.codeToHtml(content, {
      lang: useLang,
      themes: { light: 'github-light', dark: 'github-dark' },
    });
  }

  $effect(() => {
    if (app.fileOpen) highlight(app.fileOpen.path, app.fileOpen.content);
  });

  /**
   * A file opens in the workbench, like an editor tab — not a modal.
   * The tree stays clickable, the agent stays at hand; ✕ (or Escape)
   * returns to the stage lens (2026-07-31 feedback).
   */
</script>

{#if app.fileOpen}
  <div class="file-view">
    <header class="file-head">
      <span class="mono">{app.fileOpen.path}</span>
      <button class="file-close mono" onclick={() => (app.fileOpen = null)}>✕ close</button>
    </header>
    <div class="file-body" class:is-svg={app.fileOpen.path.endsWith('.svg')}>
      {#if app.fileOpen.path.endsWith('.md')}
        <div class="md file-doc">{@html md(app.fileOpen.content)}</div>
      {:else if app.fileOpen.path.endsWith('.svg')}
        <SvgViewer content={app.fileOpen.content} alt={app.fileOpen.path} />
      {:else if highlighted}
        <div class="file-code">{@html highlighted}</div>
      {:else}
        <pre class="file-raw">{app.fileOpen.content}</pre>
      {/if}
    </div>
  </div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.fileOpen = null)} />

<style>
  .file-view {
    display: flex; flex-direction: column; height: 100%; min-height: 0;
    background: var(--panel); border-radius: var(--r-lg);
    box-shadow: var(--shadow-1); overflow: hidden;
  }
  .file-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--s2) var(--s4); border-bottom: 1px solid var(--line);
    font-size: var(--t-sm);
  }
  .file-close {
    border: 1px solid var(--line); background: transparent; cursor: pointer;
    font-size: var(--t-xs); padding: var(--s1) var(--s2);
    border-radius: var(--r-sm); color: var(--ink-soft);
  }
  .file-close:hover { color: var(--mask); border-color: var(--mask); }
  .file-body { flex: 1; overflow: auto; padding: var(--s4) var(--s5); }
  .file-body.is-svg { padding: 0; overflow: hidden; }
  .file-raw {
    font-family: var(--font-mono); font-size: var(--t-xs); line-height: 1.5;
    background: var(--code-bg); border: 1px solid var(--line);
    border-radius: var(--r-sm); padding: var(--s3); overflow: auto;
    white-space: pre-wrap; word-break: break-all; margin: 0;
  }
  .file-doc { font-size: var(--t-sm); max-width: 46rem; }
  .file-code :global(pre.shiki) {
    font-family: var(--font-mono); font-size: var(--t-xs); line-height: 1.6;
    border: 1px solid var(--line); border-radius: var(--r-sm);
    padding: var(--s3); overflow: auto; margin: 0;
  }
  :global(html[data-theme='dark']) .file-code :global(.shiki),
  :global(html[data-theme='dark']) .file-code :global(.shiki span) {
    color: var(--shiki-dark) !important;
    background-color: var(--shiki-dark-bg) !important;
  }
</style>
