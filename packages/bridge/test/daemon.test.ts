import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { startDaemon, type Daemon } from '../src/daemon.js';

const FAKE = resolve('packages/bridge/test/fake-agent.mjs');
const ORIGIN = 'https://makerlord.dev';

let daemon: Daemon;
let engine: Server;
/** What the stub hosted engine received. */
let flushed: { url: string; auth: string; body: { records: { kind: string }[] } }[];

beforeEach(async () => {
  flushed = [];
  engine = createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ records: [
        { kind: 'maker', text: 'earlier hosted question' },
        { kind: 'event', event: { t: 'message.delta', text: 'earlier hosted answer' } },
        { kind: 'event', event: { t: 'turn.end', reason: 'end_turn' } },
      ] }));
      return;
    }
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      flushed.push({
        url: req.url ?? '',
        auth: req.headers.authorization ?? '',
        body: JSON.parse(data || '{}'),
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"appended":0}');
    });
  });
  await new Promise<void>((r) => engine.listen(0, '127.0.0.1', r));
  daemon = await startDaemon({
    port: 0,
    origins: [ORIGIN],
    agentCommand: process.execPath,
    agentArgs: [FAKE],
    api: `http://127.0.0.1:${(engine.address() as AddressInfo).port}`,
    token: 'test-token',
    mcpMain: resolve('packages/mcp/dist/main.js'),
    initTimeoutMs: 5000,
  });
});

afterEach(() => {
  daemon.close();
  engine.close();
});

function connect(origin?: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${daemon.port}`, {
    headers: origin ? { origin } : {},
  });
}

function frames(ws: WebSocket): { next: (t: string) => Promise<Record<string, unknown>> } {
  const queue: Record<string, unknown>[] = [];
  const waiters: ((f: Record<string, unknown>) => void)[] = [];
  ws.on('message', (raw: Buffer) => {
    const f = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    const w = waiters.shift();
    if (w) w(f);
    else queue.push(f);
  });
  return {
    next: (label: string) =>
      new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`timed out waiting for ${label}`)), 8000);
        const deliver = (f: Record<string, unknown>): void => {
          clearTimeout(timer);
          res(f);
        };
        const queued = queue.shift();
        if (queued) deliver(queued);
        else waiters.push(deliver);
      }),
  };
}

describe('SAFETY: the daemon is origin-pinned and paired', () => {
  it('closes a connection from an unlisted origin before any frame', async () => {
    const ws = connect('https://evil.example');
    const code = await new Promise<number>((res) => ws.on('close', res));
    expect(code).toBe(4003);
  });

  it('the pairing code redeems exactly once', async () => {
    const ws = connect(ORIGIN);
    await new Promise((r) => ws.on('open', r));
    const f = frames(ws);
    ws.send(JSON.stringify({ t: 'pair', code: daemon.pairingCode }));
    const paired = await f.next('paired');
    expect(paired.t).toBe('paired');
    ws.send(JSON.stringify({ t: 'pair', code: daemon.pairingCode }));
    expect((await f.next('second pair')).t).toBe('error');
    ws.close();
  });

  it('an unauthenticated prompt is refused', async () => {
    const ws = connect(ORIGIN);
    await new Promise((r) => ws.on('open', r));
    const f = frames(ws);
    ws.send(JSON.stringify({ t: 'prompt', text: 'hi' }));
    const err = await f.next('error');
    expect(err).toMatchObject({ t: 'error', message: 'authenticate first' });
    ws.close();
  });
});

describe('the paired path: local brain, hosted authority', () => {
  it('pair → auth → session → prompt streams the SessionEvent union', async () => {
    const ws = connect(ORIGIN);
    await new Promise((r) => ws.on('open', r));
    const f = frames(ws);

    ws.send(JSON.stringify({ t: 'pair', code: daemon.pairingCode }));
    const { token } = (await f.next('paired')) as { token: string };
    ws.send(JSON.stringify({ t: 'auth', token }));
    expect((await f.next('ready')).t).toBe('ready');

    ws.send(JSON.stringify({ t: 'session.new', projectId: 'abc123' }));
    expect((await f.next('session.ready')).t).toBe('session.ready');

    ws.send(JSON.stringify({ t: 'prompt', text: 'hello local brain' }));
    const events: { t: string; text?: string }[] = [];
    for (;;) {
      const frame = (await f.next('event')) as { t: string; event: { t: string; text?: string } };
      expect(frame.t).toBe('event');
      events.push(frame.event);
      if (frame.event.t === 'turn.end' || frame.event.t === 'session.error') break;
    }
    const text = events.filter((e) => e.t === 'message.delta').map((e) => e.text).join('');
    // The fake agent echoes its prompt: the digest of the HOSTED history
    // rode in front of the maker's first message of this bridge session.
    expect(text).toContain('earlier hosted question');
    expect(text).toContain('echo:');
    expect(text).toContain('hello local brain');
    expect(events.at(-1)!.t).toBe('turn.end');

    // The turn was flushed into the HOSTED transcript: one continuous
    // history whichever brain drove — a reload replays this turn.
    await new Promise((r) => setTimeout(r, 300));
    const flush = flushed.find((f) => f.url === '/api/projects/abc123/transcript');
    expect(flush).toBeDefined();
    expect(flush!.auth).toBe('Bearer test-token');
    const kinds = flush!.body.records.map((r) => r.kind);
    expect(kinds[0]).toBe('maker');
    // The flush records the maker's words, never the injected history.
    expect((flush!.body.records[0] as { text?: string }).text).toBe('hello local brain');
    expect(kinds.filter((k) => k === 'event').length).toBeGreaterThanOrEqual(2);
    ws.close();
  });
});
