import { Buffer } from 'node:buffer';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { allCredentials, createSession, findUserById, updateSignCount } from '@makerlord/auth';
import { SESSION_COOKIE, sessionCookieOpts, takeChallenge } from '$lib/server/auth';

/** Step 2 of /login: verify the assertion + signCount, set the cookie. */
export const POST: RequestHandler = async ({ request, url, cookies }) => {
  const { challengeId, response } = (await request.json()) as {
    challengeId?: string; response?: AuthenticationResponseJSON;
  };
  if (!challengeId || !response) return json({ error: 'challengeId and response are required' }, { status: 400 });
  const pending = takeChallenge(challengeId);
  if (!pending) return json({ error: 'challenge expired — try again' }, { status: 403 });

  const stored = allCredentials().find((c) => c.credentialId === response.id);
  if (!stored) return json({ error: 'unknown passkey' }, { status: 403 });

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: url.origin,
    expectedRPID: url.hostname,
    credential: {
      id: stored.credentialId,
      publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')),
      counter: stored.signCount,
      transports: stored.transports as AuthenticatorTransportFuture[],
    },
  });
  if (!verification.verified) return json({ error: 'passkey verification failed' }, { status: 403 });

  updateSignCount(stored.credentialId, verification.authenticationInfo.newCounter);
  const sid = createSession(stored.userId);
  cookies.set(SESSION_COOKIE, sid, sessionCookieOpts(url.protocol === 'https:'));
  return json({ ok: true, handle: findUserById(stored.userId)?.handle ?? '' });
};
