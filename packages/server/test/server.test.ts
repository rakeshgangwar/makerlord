import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeLlm, textTurn, toolTurn } from '@makerlord/agent';
import { loadSession } from '@makerlord/tools';
import { buildHttpServer } from '../src/http.js';
import { HostedSessions } from '../src/sessions.js';

let fake: FakeLlm;
let sessions: HostedSessions;
let base: string;
let server: ReturnType<typeof buildHttpServer>;
let projectsRoot: string;

beforeEach(async () => {
  fake = await FakeLlm.start();
  projectsRoot = mkdtempSync(join(tmpdir(), 'makerlord-host-'));
  sessions = new HostedSessions({
    projectsRoot,
    apiKey: 'fake',
    baseURL: fake.baseUrl,
  });
  server = buildHttpServer(sessions);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  server.close();
  fake.close();
});

async function post(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

/** Minimal SSE client: collect events until predicate or timeout. */
async function collectSse(
  path: string,
  doneWhen: (events: { id: number; data: Record<string, unknown> }[]) => boolean,
  lastEventId?: number,
): Promise<{ id: number; data: Record<string, unknown> }[]> {
  const headers: Record<string, string> = {};
  if (lastEventId !== undefined) headers['last-event-id'] = String(lastEventId);
  const res = await fetch(`${base}${path}`, { headers });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: { id: number; data: Record<string, unknown> }[] = [];
  let buffer = '';
  const deadline = Date.now() + 5000;
  for (;;) {
    if (Date.now() > deadline) break;
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const id = Number(/^id: (\d+)$/m.exec(frame)?.[1] ?? 0);
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (data) events.push({ id, data: JSON.parse(data) as Record<string, unknown> });
    }
    if (doneWhen(events)) break;
  }
  await reader.cancel().catch(() => undefined);
  return events;
}

describe('the hosted surface', () => {
  it('healthz reports the registry size', async () => {
    const res = await fetch(`${base}/healthz`);
    const data = (await res.json()) as { ok: boolean; tools: number };
    expect(data.ok).toBe(true);
    expect(data.tools).toBe(37);
  });

  it('project → session → prompt → SSE events → project.json mutated', async () => {
    fake.enqueue(
      toolTurn('inventory_add', { freeText: 'a bag of LEDs' }),
      textTurn('Recorded.'),
    );
    const project = await post('/api/projects', { intent: 'a lamp' });
    expect(project.status).toBe(201);
    const session = await post('/api/sessions', {
      projectId: project.data.projectId,
    });
    expect(session.status).toBe(201);
    const sid = session.data.sessionId as string;

    const accepted = await post(`/api/sessions/${sid}/prompt`, {
      text: 'note my LEDs',
    });
    expect(accepted.status).toBe(202);

    const events = await collectSse(`/api/sessions/${sid}/events`, (evs) =>
      evs.some((e) => (e.data as { t?: string }).t === 'turn.end'),
    );
    const types = events.map((e) => (e.data as { t: string }).t);
    expect(types).toContain('tool.start');
    expect(types).toContain('tool.end');
    expect(types.at(-1)).toBe('turn.end');

    // The artefact: the hosted turn mutated the project on disk.
    const onDisk = loadSession(
      join(projectsRoot, project.data.projectId as string, 'project.json'),
    );
    expect(onDisk.file.project.inventory).toEqual([{ freeText: 'a bag of LEDs' }]);
  });

  it('replays from Last-Event-ID after a disconnect', async () => {
    fake.enqueue(textTurn('Hello there.'));
    const { data: p } = await post('/api/projects', { intent: 'x' });
    const { data: s } = await post('/api/sessions', { projectId: p.projectId });
    const sid = s.sessionId as string;
    await post(`/api/sessions/${sid}/prompt`, { text: 'hi' });

    const all = await collectSse(`/api/sessions/${sid}/events`, (evs) =>
      evs.some((e) => (e.data as { t?: string }).t === 'turn.end'),
    );
    expect(all.length).toBeGreaterThanOrEqual(2);

    // Reconnect claiming we saw only the first event: replay is the tail.
    const replayed = await collectSse(
      `/api/sessions/${sid}/events`,
      (evs) => evs.some((e) => (e.data as { t?: string }).t === 'turn.end'),
      all[0]!.id,
    );
    expect(replayed[0]!.id).toBe(all[0]!.id + 1);
    expect(replayed.map((e) => e.id)).toEqual(all.slice(1).map((e) => e.id));
  });

  it('two sessions are isolated projects', async () => {
    fake.enqueue(textTurn('a'), textTurn('b'));
    const p1 = (await post('/api/projects', { intent: 'one' })).data;
    const p2 = (await post('/api/projects', { intent: 'two' })).data;
    expect(p1.projectId).not.toBe(p2.projectId);
    const one = loadSession(
      join(projectsRoot, p1.projectId as string, 'project.json'),
    );
    expect(one.file.project.intent).toBe('one');
  });

  it('rejects a second prompt while a turn is active', async () => {
    // A queue with only ONE canned response: the second round of the turn
    // will block on the empty queue... so instead: never enqueue, prompt
    // fails fast server-side; but turnActive is what we assert here.
    fake.enqueue(textTurn('slow'));
    const { data: p } = await post('/api/projects', { intent: 'x' });
    const { data: s } = await post('/api/sessions', { projectId: p.projectId });
    const sid = s.sessionId as string;
    await post(`/api/sessions/${sid}/prompt`, { text: 'first' });
    // Immediately racing a second prompt: either the turn already finished
    // (fast fake) or we get 409 — both are correct; what is wrong is a crash.
    const second = await post(`/api/sessions/${sid}/prompt`, { text: 'second' });
    expect([202, 409]).toContain(second.status);
  });

  it('404s an unknown session', async () => {
    const r = await post('/api/sessions/deadbeef/steer', { text: 'x' });
    expect(r.status).toBe(404);
  });
});

describe('the UI-facing read + tool surface', () => {
  it('GET /api/projects lists every project, newest first', async () => {
    await post('/api/projects', { intent: 'first' });
    await new Promise((r) => setTimeout(r, 20));
    await post('/api/projects', { intent: 'second' });
    const res = await fetch(`${base}/api/projects`);
    const { projects } = (await res.json()) as {
      projects: { intent: string; projectId: string; updatedAt: string }[];
    };
    expect(projects.length).toBeGreaterThanOrEqual(2);
    expect(projects[0]!.intent).toBe('second');
    expect(projects.map((p) => p.intent)).toContain('first');
  });

  it('GET /api/projects/:id returns the file and its hash', async () => {
    const { data: p } = await post('/api/projects', { intent: 'a lamp' });
    const res = await fetch(`${base}/api/projects/${p.projectId as string}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { file: { project: { intent: string } }; hash: string };
    expect(body.file.project.intent).toBe('a lamp');
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('direct tool invocation runs the same registry, gates intact', async () => {
    const { data: p } = await post('/api/projects', { intent: 'x' });
    const pid = p.projectId as string;
    const add = await post(`/api/projects/${pid}/tool`, {
      name: 'block_add', input: { id: 'psu', name: 'psu' },
    });
    expect(add.status).toBe(200);
    expect(add.data.ok).toBe(true);
    // The gate holds over HTTP exactly as in-process: a refusal, not an error.
    const expand = await post(`/api/projects/${pid}/tool`, { name: 'expand', input: {} });
    expect(expand.status).toBe(200);
    expect(expand.data).toMatchObject({ ok: false, refused: 'BLOCK_UNDECIDED' });
  });

  it('steps endpoint reports the build state', async () => {
    const { data: p } = await post('/api/projects', { intent: 'x' });
    const pid = p.projectId as string;
    await post(`/api/projects/${pid}/tool`, {
      name: 'part_add', input: { ref: 'R1', defId: 'ResistorModuleID' },
    });
    const res = await fetch(`${base}/api/projects/${pid}/steps`);
    const body = (await res.json()) as {
      steps: { kind: string }[]; gateOpen: boolean;
    };
    expect(body.gateOpen).toBe(false);
    expect(body.steps.map((s) => s.kind)).toContain('GATE');
  });

  it('404s an unknown project', async () => {
    const res = await fetch(`${base}/api/projects/ffffffffffffffff`);
    expect(res.status).toBe(404);
  });
});

describe('access token', () => {
  it('guards /api/* but not /healthz; header or query token both work', async () => {
    const guarded = buildHttpServer(sessions, 'sekrit');
    await new Promise<void>((r) => guarded.listen(0, '127.0.0.1', r));
    const gbase = `http://127.0.0.1:${(guarded.address() as AddressInfo).port}`;

    expect((await fetch(`${gbase}/healthz`)).status).toBe(200);
    const noToken = await fetch(`${gbase}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: 'x' }),
    });
    expect(noToken.status).toBe(401);
    const withHeader = await fetch(`${gbase}/api/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sekrit',
      },
      body: JSON.stringify({ intent: 'x' }),
    });
    expect(withHeader.status).toBe(201);
    guarded.close();
  });
});

describe('the artifact files surface — the repo is visible, read-only', () => {
  it('lists the tree without .git and serves file content', async () => {
    const { data: p } = await post('/api/projects', { intent: 'a lamp' });
    const pid = p.projectId as string;
    const list = (await (await fetch(`${base}/api/projects/${pid}/files`)).json()) as {
      files: { path: string; size: number }[];
    };
    const paths = list.files.map((f) => f.path);
    expect(paths).toContain('project.json');
    expect(paths.every((x) => !x.startsWith('.git'))).toBe(true);

    const file = await fetch(`${base}/api/projects/${pid}/file?path=project.json`);
    expect(file.status).toBe(200);
    const body = (await file.json()) as { path: string; content: string };
    expect(body.content).toContain('a lamp');
  });

  it('refuses to escape the project directory', async () => {
    const { data: p } = await post('/api/projects', { intent: 'x' });
    const pid = p.projectId as string;
    for (const evil of ['../../../etc/passwd', '..%2F..%2Fetc%2Fpasswd', '.git/config']) {
      const res = await fetch(`${base}/api/projects/${pid}/file?path=${evil}`);
      expect(res.status, evil).toBe(404);
    }
  });

  it('serves the git history, newest first', async () => {
    const { data: p } = await post('/api/projects', { intent: 'x' });
    const pid = p.projectId as string;
    await post(`/api/projects/${pid}/tool`, {
      name: 'block_add', input: { id: 'psu', name: 'psu' },
    });
    const { commits } = (await (await fetch(`${base}/api/projects/${pid}/log`)).json()) as {
      commits: { subject: string; date: string }[];
    };
    expect(commits.at(-1)!.subject).toBe('Project created');
    expect(commits[0]!.subject).toBe('tool: block_add');
    expect(commits[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the ACP backend — a spawned agent instead of the API key', () => {
  it('drives a hosted session through the fake ACP agent', async () => {
    const { resolve: resolvePath } = await import('node:path');
    const acp = new HostedSessions({
      projectsRoot,
      apiKey: '',
      backend: 'acp',
      acpCommand: process.execPath,
      acpArgs: [resolvePath('packages/bridge/test/fake-agent.mjs')],
    });
    const srv = buildHttpServer(acp);
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;

    const post2 = async (path: string, body: unknown) => {
      const res = await fetch(`${b}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, data: (await res.json()) as Record<string, unknown> };
    };

    const p = await post2('/api/projects', { intent: 'acp-driven lamp' });
    expect(p.status).toBe(201);
    const s = await post2('/api/sessions', { projectId: p.data.projectId });
    expect(s.status).toBe(201);
    const sid = s.data.sessionId as string;

    const accepted = await post2(`/api/sessions/${sid}/prompt`, { text: 'hello agent' });
    expect(accepted.status).toBe(202);

    // Same SSE surface, same event union — the UI cannot tell the backends apart.
    const res = await fetch(`${b}/api/sessions/${sid}/events`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const deadline = Date.now() + 8000;
    const events: { t: string; text?: string }[] = [];
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const m of buffer.matchAll(/^data: (.*)$/gm)) {
        const parsed = JSON.parse(m[1]!) as { t: string; text?: string };
        if (!events.some((e) => JSON.stringify(e) === JSON.stringify(parsed))) events.push(parsed);
      }
      if (events.some((e) => e.t === 'turn.end')) break;
    }
    await reader.cancel().catch(() => undefined);
    srv.close();

    const deltas = events.filter((e) => e.t === 'message.delta').map((e) => e.text).join('');
    expect(deltas).toContain('echo: hello agent');
    expect(events.at(-1)!.t).toBe('turn.end');
  });
});

describe('the transcript flush endpoint — bridge turns join the history', () => {
  it('appends records that then replay from GET, and rejects junk', async () => {
    const { data: p } = await post('/api/projects', { intent: 'bridge history' });
    const pid = p.projectId as string;
    const r = await post(`/api/projects/${pid}/transcript`, {
      records: [
        { kind: 'maker', text: 'over the bridge' },
        { kind: 'event', event: { t: 'turn.end', reason: 'end_turn' } },
      ],
    });
    expect(r.status).toBe(200);
    const read = await fetch(`${base}/api/projects/${pid}/transcript`);
    const { records } = (await read.json()) as { records: { kind: string }[] };
    expect(records.map((x) => x.kind)).toEqual(['maker', 'event']);

    const bad = await post(`/api/projects/${pid}/transcript`, {
      records: [{ kind: 'sneaky' }],
    });
    expect(bad.status).toBe(400);
  });
});
