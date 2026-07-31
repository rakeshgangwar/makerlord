import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionEvent } from '@makerlord/protocol';
import { bundle, initProjectFile } from '@makerlord/tools';
import { loadPack } from '../src/persona.js';
import { AiSdkSession, resolveModel } from '../src/aisdk.js';

/**
 * The BYOK loop against a fake OpenAI-compatible endpoint: one tool
 * round (the REAL registry executes) then a text round. No mock of our
 * own code — the fake is the wire, the engine is real.
 */

let server: Server;
let baseURL: string;
let dir: string;
let requests: unknown[] = [];

function sse(lines: unknown[]): string {
  return `${lines.map((l) => `data: ${JSON.stringify(l)}`).join('\n\n')}\n\ndata: [DONE]\n\n`;
}

const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
  id: 'cmpl-1', object: 'chat.completion.chunk', created: 1, model: 'fake',
  choices: [{ index: 0, delta, finish_reason: finish }],
});

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'makerlord-aisdk-'));
  requests = [];
  let round = 0;
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      round += 1;
      if (round === 1) {
        // A tool round — a bogus tool when the prompt asks for the
        // impossible (runTool throws), parts_search otherwise.
        const bogus = body.includes('impossible');
        res.end(sse([
          chunk({ role: 'assistant', tool_calls: [{
            index: 0, id: 'call_1', type: 'function',
            function: { name: bogus ? 'no_such_tool' : 'parts_search', arguments: '' },
          }] }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: '{"query":"led"}' } }] }),
          chunk({}, 'tool_calls'),
        ]));
      } else {
        res.end(sse([
          chunk({ role: 'assistant', content: 'Found LEDs in the library.' }),
          chunk({}, 'stop'),
        ]));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterEach(() => server.close());

describe('AiSdkSession — any provider, same engine, same gates', () => {
  it('streams text, executes registry tools for real, ends the turn', async () => {
    const toolSession = initProjectFile(join(dir, 'project.json'), 'a desk lamp');
    const session = new AiSdkSession({
      model: resolveModel({ provider: 'custom', model: 'fake', apiKey: 'k', baseURL }),
      toolSession,
      cwd: dir,
      pack: loadPack(dir),
      stage: 6,
      bundle: bundle(),
    });

    const events: SessionEvent[] = [];
    await session.send('find me an led', (e) => events.push(e));

    const types = events.map((e) => e.t);
    expect(types).toContain('tool.start');
    expect(types).toContain('tool.end');
    expect(types.at(-1)).toBe('turn.end');

    const start = events.find((e) => e.t === 'tool.start') as { name: string; input: unknown };
    expect(start.name).toBe('parts_search');
    const end = events.find((e) => e.t === 'tool.end') as { result: { ok: boolean } };
    expect(end.result.ok).toBe(true);   // the REAL registry answered

    const text = events
      .filter((e): e is { t: 'message.delta'; text: string } => e.t === 'message.delta')
      .map((e) => e.text).join('');
    expect(text).toContain('Found LEDs');

    // The second request carried the tool result back to the model.
    const second = requests[1] as { messages: { role: string }[]; tools: unknown[] };
    expect(second.messages.some((m) => m.role === 'tool')).toBe(true);
    expect(second.tools.length).toBeGreaterThan(40);   // the whole registry rides along
    // Provider-portable schemas: no \ anywhere (Moonshot 400s on them).
    expect(JSON.stringify(second.tools)).not.toContain(String.raw`"$ref"`);
    // Tuple schemas must arrive as object-form items, unstamped.
    expect(JSON.stringify(second.tools)).not.toMatch(/"items":\s*\[/);
    expect(JSON.stringify(second.tools)).not.toContain(String.raw`"$schema"`);
  });

  it('a session.error surfaces instead of a hang when the provider dies', async () => {
    server.close();
    const toolSession = initProjectFile(join(dir, 'project.json'), 'a lamp');
    const session = new AiSdkSession({
      model: resolveModel({ provider: 'custom', model: 'fake', apiKey: 'k', baseURL }),
      toolSession, cwd: dir, pack: loadPack(dir), stage: 6, bundle: bundle(),
    });
    const events: SessionEvent[] = [];
    await session.send('hello', (e) => events.push(e));
    expect(events.at(-1)?.t).toBe('session.error');
  }, 30_000);
});

describe('a throwing tool never wedges the session', () => {
  it('the error becomes a result; the next round and turn still run', async () => {
    // Round 1 calls a tool that does not exist (runTool throws);
    // round 2 must still receive a tool result and answer in text.
    const toolSession = initProjectFile(join(dir, 'project.json'), 'a lamp');
    const session = new AiSdkSession({
      model: resolveModel({ provider: 'custom', model: 'fake', apiKey: 'k', baseURL }),
      toolSession, cwd: dir, pack: loadPack(dir), stage: 6, bundle: bundle(),
    });
    requests.length = 0;
    // Monkey-patch the fake: first round calls a bogus tool.
    const events: SessionEvent[] = [];
    await session.send('do the impossible', (e) => events.push(e));
    const ends = events.filter((e) => e.t === 'tool.end');
    expect(ends.length).toBe(events.filter((e) => e.t === 'tool.start').length);
    expect(events.at(-1)?.t).toBe('turn.end');
    const second = requests[1] as { messages: { role: string }[] };
    expect(second.messages.some((m) => m.role === 'tool')).toBe(true);
  });
});
