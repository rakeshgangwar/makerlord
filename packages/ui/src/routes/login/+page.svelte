<script lang="ts">
  import { startAuthentication } from '@simplewebauthn/browser';

  let error = $state('');
  let busy = $state(false);

  async function signIn(): Promise<void> {
    busy = true;
    error = '';
    try {
      const opts = await (await fetch('/auth/login/options', { method: 'POST' })).json();
      const response = await startAuthentication({ optionsJSON: opts.options });
      const res = await fetch('/auth/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId: opts.challengeId, response }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'sign-in failed');
      location.href = '/';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Sign in — MakerLord</title></svelte:head>

<main class="gate">
  <div class="card">
    <h1 class="wordmark">Maker<span>Lord</span></h1>
    <p class="tag">idea → simulate → prototype → product</p>
    <button class="primary" onclick={signIn} disabled={busy}>
      {busy ? 'Waiting for your passkey…' : 'Sign in with passkey'}
    </button>
    {#if error}<p class="error">{error}</p>{/if}
    <p class="small">New here? Joining needs an invite — open the link that came with your code.</p>
  </div>
  <footer class="meter mono" aria-hidden="true">
    <span class="lamp"></span> READY · the bench is waiting
  </footer>
</main>

<style>
  .gate { min-height: 100vh; display: grid; place-items: center; position: relative; }
  .wordmark span { color: var(--mask); }
  .meter {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: var(--meter-face, #23282c); color: #9aa5a0;
    font-size: var(--t-sm); padding: 0.55rem 1.1rem; letter-spacing: 0.04em;
    display: flex; align-items: center; gap: 0.5rem;
  }
  .lamp {
    width: 9px; height: 9px; border-radius: 50%;
    background: var(--meter-glow, #9ae6c3); box-shadow: 0 0 6px var(--meter-glow, #9ae6c3);
    display: inline-block;
  }
  .card {
    background: var(--panel, white); border: 1px solid var(--line, #d8dde1);
    border-radius: var(--r-lg); padding: 2.2rem 2.6rem; max-width: 22rem; text-align: center;
    box-shadow: 0 2px 14px rgb(20 24 27 / 6%);
  }
  h1 { margin: 0 0 0.2rem; font-size: 1.5rem; }
  .tag { color: var(--ink-soft, #4c555c); font-size: var(--t-sm); margin: 0 0 1.4rem; }
  button { width: 100%; padding: 0.6rem; border-radius: var(--r-md); font-size: var(--t-md); cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .small { margin-top: 1.2rem; }
</style>
