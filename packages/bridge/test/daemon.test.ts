import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { startDaemon, type Daemon } from '../src/daemon.js';

const FAKE = resolve('packages/bridge/test/fake-agent.mjs');
const ORIGIN = 'https://makerlord.dev';

let daemon: Daemon;

beforeEach(async () => {
  daemon = await startDaemon({
    port: 0,
    origins: [ORIGIN],
    agentCommand: process.execPath,
    agentArgs: [FAKE],
    api: 'http://127.0.0.1:1',   // never reached — fake agent calls no tools
    token: 'test-token',
    mcpMain: resolve('packages/mcp/dist/main.js'),
    initTimeoutMs: 5000,
  });
});

afterEach(() => daemon.close());

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
    expect(text).toContain('echo: hello local brain');
    expect(events.at(-1)!.t).toBe('turn.end');
    ws.close();
  });
});
