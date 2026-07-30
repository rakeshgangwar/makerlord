#!/usr/bin/env node
/**
 * Live-API verification for the two deferred-work §A residues: are the
 * web-research server-tool type strings real, and is the compaction beta
 * header accepted? Reads ANTHROPIC_API_KEY from the environment and never
 * prints it. Each probe reports the API's own verdict verbatim — this
 * script pins claims, it does not guess.
 *
 *   set -a && . /opt/makerlord/.env && set +a && node scripts/verify-live-api.mjs
 *
 * Cost: a few requests at max_tokens 16.
 */
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error('verify-live-api: ANTHROPIC_API_KEY is not set');
  process.exit(1);
}
const MODEL = process.env.MAKERLORD_MODEL ?? 'claude-opus-5';

async function probe(name, { tools = undefined, betas = undefined } = {}) {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': KEY,
    'anthropic-version': '2023-06-01',
  };
  if (betas) headers['anthropic-beta'] = betas.join(',');
  const body = {
    model: MODEL,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Say ok.' }],
  };
  if (tools) body.tools = tools;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`✓ ${name}: accepted (HTTP ${res.status})`);
    return true;
  }
  let detail = text;
  try { detail = JSON.parse(text).error?.message ?? text; } catch { /* raw */ }
  console.log(`✗ ${name}: HTTP ${res.status} — ${detail}`);
  return false;
}

console.log(`model: ${MODEL}\n`);

// The exact tool defs the loop sends (keep in lockstep with loop.ts).
// Verified 2026-07-30: both 20260209 types accepted, no beta header.
await probe('both web tools as the loop sends them (20260209, no beta)', {
  tools: [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
  ],
});
await probe('compaction beta header compact-2026-01-12', {
  betas: ['compact-2026-01-12'],
});
