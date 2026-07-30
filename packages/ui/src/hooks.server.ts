import { redirect, type Handle } from '@sveltejs/kit';
import { findUserById, getSession, touchSession } from '@makerlord/auth';
import { SESSION_COOKIE } from '$lib/server/auth';

/**
 * D53: every request is authenticated here or bounced. Pages redirect
 * to /login; the API proxies 401 as JSON. /join and /login (plus their
 * ceremony endpoints) are the only unauthenticated surface.
 */
const PUBLIC_PAGES = new Set(['/login', '/join']);

export const handle: Handle = async ({ event, resolve }) => {
  const sid = event.cookies.get(SESSION_COOKIE);
  const session = sid ? getSession(sid) : null;
  if (sid && session) {
    touchSession(sid);   // 30-day sliding
    event.locals.userId = session.userId;
    event.locals.handle = findUserById(session.userId)?.handle ?? null;
  } else {
    event.locals.userId = null;
    event.locals.handle = null;
  }

  const path = event.url.pathname;
  const isPublic = PUBLIC_PAGES.has(path) || path.startsWith('/auth/');
  if (!session && !isPublic) {
    if (path.startsWith('/app-api') || path.startsWith('/render')) {
      return new Response(JSON.stringify({ error: 'sign in required' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    redirect(303, '/login');
  }
  // A signed-in visit to /login or /join belongs at the bench.
  if (session && PUBLIC_PAGES.has(path)) redirect(303, '/');

  return resolve(event);
};
