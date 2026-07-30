<script>
  /**
   * Colour + word together, always (the severity discipline). Tones
   * cover part tiers and statuses; free text rides on `label`.
   */
  let { tone = 'muted', label, title = undefined } = $props();
</script>

<span class="k-chip {tone}" {title}>{label}</span>

<style>
  .k-chip {
    font-family: var(--font-mono); font-size: 0.6rem; border-radius: var(--r-sm);
    padding: 0.05rem var(--s2); text-transform: uppercase; letter-spacing: 0.04em;
    border: 1px solid transparent; white-space: nowrap;
  }
  .verified { background: #e7f3ed; color: var(--mask-deep); border-color: #bcd9cc; }
  .sourced { background: #fdf3e3; color: #8a5e14; border-color: #e8cfa0; }
  .geometry { background: #eef1f0; color: var(--ink-soft); border-color: var(--line); }
  .ok { background: #e7f3ed; color: var(--mask-deep); border-color: #bcd9cc; }
  .warn { background: #f3e8cf; color: #7c5000; border-color: #e2cf9e; }
  .danger { background: #fdeae7; color: var(--sev-blocker); border-color: #f0b9b1; }
  .muted { background: var(--mat); color: var(--ink-soft); border-color: var(--line); }
</style>
