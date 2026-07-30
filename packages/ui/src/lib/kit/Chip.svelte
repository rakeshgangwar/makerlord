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
  .verified { background: var(--ok-bg); color: var(--ok-ink); border-color: color-mix(in srgb, var(--ok-ink) 35%, transparent); }
  .sourced { background: var(--warn-bg); color: var(--warn-ink); border-color: color-mix(in srgb, var(--warn-ink) 35%, transparent); }
  .geometry { background: var(--code-bg); color: var(--ink-soft); border-color: var(--line); }
  .ok { background: var(--ok-bg); color: var(--ok-ink); border-color: color-mix(in srgb, var(--ok-ink) 35%, transparent); }
  .warn { background: var(--warn-bg); color: var(--warn-ink); border-color: color-mix(in srgb, var(--warn-ink) 35%, transparent); }
  .danger { background: var(--danger-bg); color: var(--sev-blocker); border-color: color-mix(in srgb, var(--danger-ink) 35%, transparent); }
  .muted { background: var(--mat); color: var(--ink-soft); border-color: var(--line); }
</style>
