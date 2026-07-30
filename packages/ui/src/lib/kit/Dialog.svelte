<script>
  import { Dialog } from 'bits-ui';

  /** Skinned bits-ui dialog: focus trap, escape, overlay — solved
   *  problems stay solved. `open` is bindable. */
  let { open = $bindable(false), title, children } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="k-overlay" />
    <Dialog.Content class="k-dialog">
      <Dialog.Title class="k-dialog-title">{title}</Dialog.Title>
      {@render children()}
      <Dialog.Close class="k-dialog-x" aria-label="Close">✕</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
