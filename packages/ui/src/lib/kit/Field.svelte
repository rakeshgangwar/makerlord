<script>
  /** Label + control, one rhythm. The control comes in as a snippet so
   *  bind:value stays at the call site. */
  let { label, hint = '', children } = $props();
</script>

<label class="k-field">
  <span class="k-field-label">{label}</span>
  {@render children()}
  {#if hint}<span class="k-field-hint">{hint}</span>{/if}
</label>

<style>
  .k-field { display: block; text-align: left; margin-bottom: var(--s3); }
  .k-field-label {
    display: block; font-size: var(--t-sm); color: var(--ink-soft);
    margin-bottom: var(--s1);
  }
  .k-field-hint { display: block; font-size: var(--t-xs); color: var(--ink-soft); margin-top: var(--s1); }
  .k-field :global(input), .k-field :global(select), .k-field :global(textarea) {
    display: block; width: 100%; box-sizing: border-box;
    padding: var(--s2) var(--s3); border: 1.5px solid var(--line);
    border-radius: var(--r-md); font-size: var(--t-md); font-family: var(--font-body);
    background: var(--panel);
  }
  .k-field :global(input:focus-visible), .k-field :global(textarea:focus-visible) {
    outline: 2px solid var(--mask); outline-offset: 0;
    border-color: var(--mask);
  }
</style>
