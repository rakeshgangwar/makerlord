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
    <h1>MakerLord</h1>
    <p class="tag">idea → simulate → prototype → product</p>
    <button class="primary" onclick={signIn} disabled={busy}>
      {busy ? 'Waiting for your passkey…' : 'Sign in with passkey'}
    </button>
    {#if error}<p class="error">{error}</p>{/if}
    <p class="small">New here? Joining needs an invite — open the link that came with your code.</p>
  </div>
</main>

<style>
  .gate { min-height: 100vh; display: grid; place-items: center; }
  .card {
    background: var(--panel, white); border: 1px solid var(--line, #d8dde1);
    border-radius: 10px; padding: 2.2rem 2.6rem; max-width: 22rem; text-align: center;
    box-shadow: 0 2px 14px rgb(20 24 27 / 6%);
  }
  h1 { margin: 0 0 0.2rem; font-size: 1.5rem; }
  .tag { color: var(--ink-soft, #4c555c); font-size: 0.8rem; margin: 0 0 1.4rem; }
  button { width: 100%; padding: 0.6rem; border-radius: 8px; font-size: 0.95rem; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .small { margin-top: 1.2rem; }
</style>
