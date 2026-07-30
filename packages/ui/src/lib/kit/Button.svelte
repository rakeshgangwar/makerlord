<script>
  /**
   * The one button. Variants map to intent, sizes to the scale —
   * no component invents its own padding again.
   */
  let {
    variant = 'secondary',   // 'primary' | 'secondary' | 'ghost' | 'danger'
    size = 'md',             // 'sm' | 'md'
    type = 'button',
    disabled = false,
    onclick = undefined,
    title = undefined,
    children,
    ...rest
  } = $props();
</script>

<button {type} {disabled} {onclick} {title} class="k-btn {variant} {size}" {...rest}>
  {@render children()}
</button>

<style>
  .k-btn {
    font-family: var(--font-body); font-weight: 600; cursor: pointer;
    border-radius: var(--r-md); border: 1.5px solid transparent;
    display: inline-flex; align-items: center; gap: var(--s2);
    transition: background 120ms, color 120ms, border-color 120ms;
  }
  .k-btn:disabled { opacity: 0.45; cursor: default; }
  .md { font-size: var(--t-md); padding: var(--s2) var(--s4); }
  .sm { font-size: var(--t-sm); padding: var(--s1) var(--s3); }

  .primary { background: var(--mask); color: white; }
  .primary:hover:not(:disabled) { background: var(--mask-deep); }
  .secondary { background: var(--panel); color: var(--mask); border-color: var(--mask); }
  .secondary:hover:not(:disabled) { background: var(--ok-bg); }
  .ghost { background: transparent; color: var(--ink-soft); }
  .ghost:hover:not(:disabled) { background: var(--hover-bg); color: var(--ink); }
  .danger { background: transparent; color: var(--sev-blocker); border-color: var(--sev-blocker); }
  .danger:hover:not(:disabled) { background: var(--danger-bg); }
</style>
