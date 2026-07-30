<script>
  /**
   * The one card anatomy: mono eyebrow header, optional right-aligned
   * hint, body. Every white surface on the bench is one of these.
   */
  let { title = '', hint = '', children, ...rest } = $props();
</script>

<section class="k-panel" {...rest}>
  {#if title}
    <header class="k-panel-head">
      <span class="k-panel-title mono">{title}</span>
      {#if hint}<span class="k-panel-hint mono">{hint}</span>{/if}
    </header>
  {/if}
  {@render children()}
</section>

<style>
  .k-panel {
    background: var(--panel); border-radius: var(--r-lg);
    padding: var(--s3) var(--s4); box-shadow: var(--shadow-1);
  }
  .k-panel-head {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: var(--s2); gap: var(--s3);
  }
  .k-panel-title {
    font-size: var(--t-xs); letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--ink-soft);
  }
  .k-panel-hint { font-size: var(--t-xs); color: var(--ink-soft); opacity: 0.7; }
</style>
