import { expect, test } from '@playwright/test';
import { signIn, testSession } from './helpers.js';

/**
 * The admission story (auth spec §8), against the real ceremonies with
 * Chromium's virtual authenticator. WebAuthn refuses IP rpIDs, so the
 * ceremony tests talk to localhost — same server, registrable hostname.
 */
const LOCAL = 'http://localhost:4173';

test('unauthenticated pages bounce to /login; proxies 401', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  const res = await page.request.get('/app-api/projects');
  expect(res.status()).toBe(401);
});

test('join with an invite mints a passkey; logout + usernameless login round-trip', async ({ page }) => {
  const { createInvite } = await import('../../auth/dist/index.js');
  const code = createInvite('e2e join');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal',
      hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true,
    },
  });

  // Join: the invite link pre-fills the code; the passkey does the rest.
  await page.goto(`${LOCAL}/join?code=${code}`);
  await page.getByLabel('Handle').fill('cdp-maker');
  await page.getByRole('button', { name: /create passkey/i }).click();
  await page.waitForURL(`${LOCAL}/`);
  await expect(page.getByTitle(/cdp-maker/)).toBeVisible();

  // A burned invite refuses a second join.
  await page.request.post(`${LOCAL}/auth/join/options`, {
    data: { code, handle: 'second-try' },
  }).then((r) => expect(r.status()).toBe(403));

  // Logout, then usernameless login via the discoverable credential.
  await page.goto(`${LOCAL}/settings`);
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL(`${LOCAL}/login`);
  await page.getByRole('button', { name: /sign in with passkey/i }).click();
  await page.waitForURL(`${LOCAL}/`);
  await expect(page.getByTitle(/cdp-maker/)).toBeVisible();
});

test('the ownership property: another maker sees none of the seeded projects', async ({ page, browser }) => {
  // The seeded maker sees both projects…
  await signIn(page);
  await page.goto('/');
  const mine = await (await page.request.get('/app-api/projects')).json();
  expect(mine.projects.length).toBeGreaterThanOrEqual(2);

  // …a fresh user, fresh session, sees an empty bench (404-not-403: the
  // listing simply has nothing in it).
  const { createUser, createSession } = await import('../../auth/dist/index.js');
  const stranger = createUser('stranger');
  const sid = createSession(stranger.id);
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  await ctx.addCookies([{ name: 'ml_session', value: sid, url: 'http://127.0.0.1:4173' }]);
  const other = await ctx.newPage();
  const theirs = await (await other.request.get('/app-api/projects')).json();
  expect(theirs.projects).toHaveLength(0);
  const seeded = testSession();
  expect(stranger.id).not.toBe(seeded.userId);
  await ctx.close();
});
