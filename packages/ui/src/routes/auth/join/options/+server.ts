import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { findUserByHandle, listInvites } from '@makerlord/auth';
import { putChallenge } from '$lib/server/auth';

/** Step 1 of /join: validate the invite + handle, issue WebAuthn options. */
export const POST: RequestHandler = async ({ request, url }) => {
  const { code, handle } = (await request.json()) as { code?: string; handle?: string };
  if (!code || !handle) return json({ error: 'invite code and handle are required' }, { status: 400 });
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(handle)) {
    return json({ error: 'handle: 2–32 letters, digits, - or _' }, { status: 400 });
  }
  if (findUserByHandle(handle)) return json({ error: 'that handle is taken' }, { status: 409 });
  const invite = listInvites().find((i) => i.code === code);
  if (!invite || invite.usedBy || invite.expiresAt < Date.now()) {
    return json({ error: 'invite code is invalid, used, or expired' }, { status: 403 });
  }

  const options = await generateRegistrationOptions({
    rpName: 'MakerLord',
    rpID: url.hostname,
    userName: handle,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  const challengeId = putChallenge({ challenge: options.challenge, handle, inviteCode: code });
  return json({ options, challengeId });
};
