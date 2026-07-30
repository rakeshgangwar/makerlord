<script lang="ts">
  import { page } from '$app/state';
  import { startRegistration } from '@simplewebauthn/browser';

  let code = $state(page.url.searchParams.get('code') ?? '');
  let handle = $state('');
  let error = $state('');
  let busy = $state(false);

  async function join(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const optsRes = await fetch('/auth/join/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), handle: handle.trim() }),
      });
      const opts = await optsRes.json();
      if (!optsRes.ok) throw new Error(opts.error ?? 'could not start registration');
      const response = await startRegistration({ optionsJSON: opts.options });
      const res = await fetch('/auth/join/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId: opts.challengeId, response }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'registration failed');
      location.href = '/';
    } catch (e2) {
      error = e2 instanceof Error ? e2.message : String(e2);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Join — MakerLord</title></svelte:head>

<main class="gate">
  <form class="card" onsubmit={join}>
    <h1 class="wordmark">Join Maker<span>Lord</span></h1>
    <p class="tag">an invite code and a passkey — no password, ever</p>
    <label>
      Invite code
      <input class="mono" bind:value={code} required placeholder="paste your code" />
    </label>
    <label>
      Handle
      <input bind:value={handle} required minlength="2" maxlength="32"
        pattern="[a-zA-Z0-9_\-]+" placeholder="how the bench greets you" />
    </label>
    <button class="primary" type="submit" disabled={busy}>
      {busy ? 'Waiting for your passkey…' : 'Create passkey & join'}
    </button>
    {#if error}<p class="error">{error}</p>{/if}
    <p class="small">Already a maker? <a href="/login">Sign in</a></p>
  </form>
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
    border-radius: var(--r-lg); padding: 2.2rem 2.6rem; width: 22rem; text-align: center;
    box-shadow: 0 2px 14px rgb(20 24 27 / 6%);
  }
  h1 { margin: 0 0 0.2rem; font-size: 1.4rem; }
  .tag { color: var(--ink-soft, #4c555c); font-size: var(--t-sm); margin: 0 0 1.3rem; }
  label {
    display: block; text-align: left; font-size: var(--t-sm);
    color: var(--ink-soft, #4c555c); margin-bottom: 0.9rem;
  }
  input {
    display: block; width: 100%; box-sizing: border-box; margin-top: 0.25rem;
    padding: 0.45rem 0.6rem; border: 1px solid var(--line, #d8dde1);
    border-radius: var(--r-md); font-size: var(--t-md);
  }
  button { width: 100%; padding: 0.6rem; border-radius: var(--r-md); font-size: var(--t-md); cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .small { margin-top: 1.1rem; }
  .small a { color: var(--mask); font-weight: 600; }
</style>
