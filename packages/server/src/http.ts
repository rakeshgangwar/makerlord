import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ALL_TOOLS } from '@makerlord/tools';
import type { HostedSessions } from './sessions.js';

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8');
    });
    req.on('end', () => {
      try {
        resolvePromise(body.length ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * The hosted HTTP surface. SSE delivers the same SessionEvent union the
 * bridge does — the UI has one consumer; reconnection replays from
 * Last-Event-ID (UI spec §10).
 *
 * The deployment fronts the maker's own API key, so /api/* requires the
 * access token even while the instance is single-user. /healthz does not.
 */
export function buildHttpServer(
  sessions: HostedSessions,
  accessToken?: string,
): Server {
  return createServer((req, res) => {
    void route(sessions, req, res, accessToken).catch((e: Error) => {
      if (!res.headersSent) json(res, 500, { error: e.message });
      else res.end();
    });
  });
}

async function route(
  sessions: HostedSessions,
  req: IncomingMessage,
  res: ServerResponse,
  accessToken?: string,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/healthz') {
    json(res, 200, { ok: true, tools: ALL_TOOLS.length, sessions: sessions.count() });
    return;
  }

  if (path.startsWith('/api/') && accessToken !== undefined) {
    const supplied =
      req.headers.authorization?.replace(/^Bearer /, '') ??
      url.searchParams.get('token') ??   // EventSource cannot set headers
      '';
    if (supplied !== accessToken) {
      json(res, 401, { error: 'missing or wrong access token' });
      return;
    }
  }

  if (req.method === 'POST' && path === '/api/projects') {
    const { intent } = await readBody(req);
    if (typeof intent !== 'string' || intent.trim().length === 0) {
      json(res, 400, { error: 'intent is required' });
      return;
    }
    json(res, 201, sessions.createProject(intent));
    return;
  }

  if (req.method === 'POST' && path === '/api/sessions') {
    const { projectId } = await readBody(req);
    if (typeof projectId !== 'string') {
      json(res, 400, { error: 'projectId is required' });
      return;
    }
    try {
      json(res, 201, sessions.createSession(projectId));
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  const promptMatch = /^\/api\/sessions\/([0-9a-f]+)\/prompt$/.exec(path);
  if (req.method === 'POST' && promptMatch) {
    const sessionId = promptMatch[1]!;
    const { text } = await readBody(req);
    if (typeof text !== 'string' || text.length === 0) {
      json(res, 400, { error: 'text is required' });
      return;
    }
    try {
      if (sessions.isTurnActive(sessionId)) {
        json(res, 409, { error: 'a turn is already active — use steer' });
        return;
      }
      // Fire the turn; events arrive over SSE. Respond immediately.
      void sessions.prompt(sessionId, text).catch(() => undefined);
      json(res, 202, { accepted: true });
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  const steerMatch = /^\/api\/sessions\/([0-9a-f]+)\/steer$/.exec(path);
  if (req.method === 'POST' && steerMatch) {
    const { text } = await readBody(req);
    if (typeof text !== 'string' || text.length === 0) {
      json(res, 400, { error: 'text is required' });
      return;
    }
    try {
      sessions.steer(steerMatch[1]!, text);
      json(res, 202, { accepted: true });
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  const eventsMatch = /^\/api\/sessions\/([0-9a-f]+)\/events$/.exec(path);
  if (req.method === 'GET' && eventsMatch) {
    const sessionId = eventsMatch[1]!;
    const lastEventId = Number(
      req.headers['last-event-id'] ?? url.searchParams.get('lastEventId') ?? 0,
    );
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    try {
      const unsubscribe = sessions.subscribe(sessionId, lastEventId, (e) => {
        res.write(`id: ${e.id}\nevent: session\ndata: ${JSON.stringify(e.event)}\n\n`);
      });
      req.on('close', unsubscribe);
    } catch {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'no such session' })}\n\n`);
      res.end();
    }
    return;
  }

  json(res, 404, { error: `no route for ${req.method} ${path}` });
}
