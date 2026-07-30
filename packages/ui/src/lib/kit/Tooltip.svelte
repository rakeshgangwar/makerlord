<script>
  import { Tooltip } from 'bits-ui';

  let { text, children } = $props();
</script>

<Tooltip.Provider delayDuration={250}>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <span {...props} class="k-tip-trigger">{@render children()}</span>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content class="k-tooltip" sideOffset={6}>{text}</Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>

<style>
  .k-tip-trigger { display: inline-flex; }
</style>
