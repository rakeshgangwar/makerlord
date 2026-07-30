import { randomBytes } from 'node:crypto';

/**
 * Server-side auth plumbing shared by the ceremony endpoints and hooks
 * (D53: the UI server is the sole authenticator). The session cookie
 * maps to @makerlord/auth's session store; WebAuthn challenges live
 * here in memory — they are 5-minute, single-use, and a restart merely
 * asks the user to click the button again.
 */
export const SESSION_COOKIE = 'ml_session';

export interface PendingChallenge {
  challenge: string;
  handle?: string;
  inviteCode?: string;
  expiresAt: number;
}

const pending = new Map<string, PendingChallenge>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function putChallenge(data: Omit<PendingChallenge, 'expiresAt'>, now = Date.now()): string {
  for (const [id, c] of pending) if (c.expiresAt < now) pending.delete(id);
  const id = randomBytes(16).toString('hex');
  pending.set(id, { ...data, expiresAt: now + CHALLENGE_TTL_MS });
  return id;
}

/** Single-use: a challenge that verifies (or fails) never verifies again. */
export function takeChallenge(id: string, now = Date.now()): PendingChallenge | null {
  const c = pending.get(id);
  pending.delete(id);
  if (!c || c.expiresAt < now) return null;
  return c;
}

export function sessionCookieOpts(secure: boolean): {
  path: string; httpOnly: boolean; secure: boolean; sameSite: 'lax'; maxAge: number;
} {
  return { path: '/', httpOnly: true, secure, sameSite: 'lax', maxAge: 30 * 24 * 3600 };
}
