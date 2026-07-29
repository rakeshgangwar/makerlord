import { env } from '$env/dynamic/private';
import type { RequestHandler } from '@sveltejs/kit';

/**
 * Server-side proxy to the MakerLord API. The bearer token lives in the UI
 * server's environment and never reaches the browser; the browser is behind
 * nginx basic auth. SSE streams straight through.
 */
const API = (): string => env.MAKERLORD_API_URL ?? 'http://127.0.0.1:8787';

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (env.MAKERLORD_ACCESS_TOKEN) {
    h.authorization = `Bearer ${env.MAKERLORD_ACCESS_TOKEN}`;
  }
  return h;
}

export const GET: RequestHandler = async ({ params, request, url }) => {
  const upstream = await fetch(
    `${API()}/api/${params.path}${url.search}`,
    { headers: headers({ 'last-event-id': request.headers.get('last-event-id') ?? '0' }) },
  );
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-cache',
    },
  });
};

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.text();
  const upstream = await fetch(`${API()}/api/${params.path}`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body,
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
};
