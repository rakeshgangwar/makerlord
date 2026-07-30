import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { putChallenge } from '$lib/server/auth';

/** Step 1 of /login: usernameless — the discoverable credential names the user. */
export const POST: RequestHandler = async ({ url }) => {
  const options = await generateAuthenticationOptions({
    rpID: url.hostname,
    userVerification: 'preferred',
  });
  const challengeId = putChallenge({ challenge: options.challenge });
  return json({ options, challengeId });
};
