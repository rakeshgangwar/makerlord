import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { deleteSession } from '@makerlord/auth';
import { SESSION_COOKIE } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
  const sid = cookies.get(SESSION_COOKIE);
  if (sid) deleteSession(sid);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return json({ ok: true });
};
