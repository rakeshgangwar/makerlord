<script>
  let { children } = $props();
</script>

<main class="frame">
  {@render children()}
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #faf9f6;
    color: #1a1a1a;
  }
  .frame {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
</style>
