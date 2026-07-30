import { Buffer } from 'node:buffer';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  burnInvite, createSession, createUser, findUserByHandle, storeCredential,
} from '@makerlord/auth';
import { SESSION_COOKIE, sessionCookieOpts, takeChallenge } from '$lib/server/auth';

/** Step 2 of /join: verify attestation, create the user, burn the invite. */
export const POST: RequestHandler = async ({ request, url, cookies }) => {
  const { challengeId, response } = (await request.json()) as {
    challengeId?: string; response?: RegistrationResponseJSON;
  };
  if (!challengeId || !response) return json({ error: 'challengeId and response are required' }, { status: 400 });
  const pending = takeChallenge(challengeId);
  if (!pending?.handle || !pending.inviteCode) {
    return json({ error: 'challenge expired — try again' }, { status: 403 });
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: url.origin,
    expectedRPID: url.hostname,
  });
  if (!verification.verified || !verification.registrationInfo) {
    return json({ error: 'passkey verification failed' }, { status: 403 });
  }

  // The handle could have been raced between options and verify.
  if (findUserByHandle(pending.handle)) return json({ error: 'that handle is taken' }, { status: 409 });
  const user = createUser(pending.handle);
  const { credential } = verification.registrationInfo;
  storeCredential(user.id, {
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    signCount: credential.counter,
    transports: credential.transports ?? [],
  });
  if (!burnInvite(pending.inviteCode, user.id)) {
    return json({ error: 'invite code is invalid, used, or expired' }, { status: 403 });
  }
  const sid = createSession(user.id);
  cookies.set(SESSION_COOKIE, sid, sessionCookieOpts(url.protocol === 'https:'));
  return json({ ok: true, handle: user.handle });
};
