import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { mintToken } from '@makerlord/auth';

/**
 * Mint a per-user bridge token (auth spec §4). /auth/* is outside the
 * hooks gate, so this route checks the session itself — and the clear
 * token appears exactly once, in this response.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.userId) return json({ error: 'sign in required' }, { status: 401 });
  const { label } = (await request.json().catch(() => ({}))) as { label?: string };
  const token = mintToken(locals.userId, label ?? 'bridge');
  return json({ token });
};
