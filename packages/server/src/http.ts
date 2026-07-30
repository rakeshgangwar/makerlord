import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import { resolveToken } from '@makerlord/auth';
import { buildSequence } from '@makerlord/circuit';
import {
  ALL_TOOLS, circuitRuleContext, loadSession, runTool,
} from '@makerlord/tools';
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

  // ── identity (D53): every /api request maps to a user id or dies.
  // Two credentials, one resolution: a per-user token (the bridge's
  // path, mlt_…), or the internal service token PLUS the user header
  // the UI server stamps after authenticating the cookie. The service
  // token alone never authorizes a project route.
  let userId: string | null = null;
  if (path.startsWith('/api/')) {
    const supplied =
      req.headers.authorization?.replace(/^Bearer /, '') ??
      url.searchParams.get('token') ??   // EventSource cannot set headers
      '';
    if (supplied.startsWith('mlt_')) {
      userId = resolveToken(supplied);
    } else if (accessToken !== undefined && supplied === accessToken) {
      const header = req.headers['x-makerlord-user'];
      userId = typeof header === 'string' && /^u_[a-f0-9]+$/.test(header)
        ? header : null;
    } else if (accessToken === undefined) {
      // Test/dev mode (no service token configured): the header IS the
      // user, defaulting to a fixed dev identity.
      const header = req.headers['x-makerlord-user'];
      userId = typeof header === 'string' && /^u_[a-f0-9]+$/.test(header)
        ? header : 'u_de00000000000000';
    }
    if (userId === null) {
      json(res, 401, { error: 'sign in required' });
      return;
    }
  }
  const user = userId as string;   // non-null on every /api route below

  if (req.method === 'GET' && path === '/api/projects') {
    json(res, 200, { projects: sessions.listProjects(user) });
    return;
  }

  if (req.method === 'POST' && path === '/api/projects') {
    const { intent } = await readBody(req);
    if (typeof intent !== 'string' || intent.trim().length === 0) {
      json(res, 400, { error: 'intent is required' });
      return;
    }
    json(res, 201, sessions.createProject(user, intent));
    return;
  }

  // The upload half of the curation pipeline (spec §3.5): a datasheet
  // PDF lands content-hashed; the ref is citable in profile_propose.
  if (req.method === 'POST' && path === '/api/datasheets') {
    const { contentBase64 } = await readBody(req);
    if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
      json(res, 400, { error: 'contentBase64 is required' });
      return;
    }
    if (contentBase64.length > 20 * 1024 * 1024) {
      json(res, 413, { error: 'datasheet too large — 15 MB max' });
      return;
    }
    const bytes = Buffer.from(contentBase64, 'base64');
    if (!bytes.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
      json(res, 400, { error: 'not a PDF — the store takes datasheet PDFs only' });
      return;
    }
    const { saveDatasheet } = await import('@makerlord/parts');
    json(res, 201, saveDatasheet(bytes));
    return;
  }

  if (req.method === 'POST' && path === '/api/sessions') {
    const { projectId } = await readBody(req);
    if (typeof projectId !== 'string') {
      json(res, 400, { error: 'projectId is required' });
      return;
    }
    try {
      json(res, 201, await sessions.createSession(user, projectId));
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  // Read the project file — the UI renders projections of this (D2).
  const projectMatch = /^\/api\/projects\/([0-9a-f]+)$/.exec(path);
  if (req.method === 'GET' && projectMatch) {
    try {
      const session = loadSession(sessions.projectPath(user, projectMatch[1]!));
      json(res, 200, { file: session.file, hash: session.hash });
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  // The artifact files — the maker's repo made visible in the UI (D34).
  const filesMatch = /^\/api\/projects\/([0-9a-f]+)\/files$/.exec(path);
  if (req.method === 'GET' && filesMatch) {
    try {
      json(res, 200, { files: sessions.listFiles(user, filesMatch[1]!) });
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  const fileMatch = /^\/api\/projects\/([0-9a-f]+)\/file$/.exec(path);
  if (req.method === 'GET' && fileMatch) {
    const relPath = url.searchParams.get('path') ?? '';
    const encoding = url.searchParams.get('encoding') === 'base64' ? 'base64' : 'utf8';
    try {
      json(res, 200, {
        path: relPath,
        encoding,
        content: sessions.readFile(user, fileMatch[1]!, relPath, encoding),
      });
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  const logMatch = /^\/api\/projects\/([0-9a-f]+)\/log$/.exec(path);
  if (req.method === 'GET' && logMatch) {
    try {
      json(res, 200, { commits: sessions.gitLog(user, logMatch[1]!) });
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  // The conversation, persisted with the project.
  const transcriptMatch = /^\/api\/projects\/([0-9a-f]+)\/transcript$/.exec(path);
  if (req.method === 'GET' && transcriptMatch) {
    try {
      json(res, 200, { records: sessions.readTranscript(user, transcriptMatch[1]!) });
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  // Bridge-driven turns flush their records here (same shape the hosted
  // path appends), so reloads replay one continuous history.
  if (req.method === 'POST' && transcriptMatch) {
    const { records } = await readBody(req);
    if (!Array.isArray(records)) {
      json(res, 400, { error: 'records array is required' });
      return;
    }
    try {
      sessions.appendTranscriptRecords(user, transcriptMatch[1]!, records);
      json(res, 200, { appended: records.length });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  // Build steps + gate state for the Bench posture.
  const stepsMatch = /^\/api\/projects\/([0-9a-f]+)\/steps$/.exec(path);
  if (req.method === 'GET' && stepsMatch) {
    try {
      const session = loadSession(sessions.projectPath(user, stepsMatch[1]!));
      const steps = session.file.project.circuit
        ? buildSequence(circuitRuleContext(session))
        : [];
      json(res, 200, {
        steps,
        currentStep: session.file.build.currentStep,
        gateOpen: session.file.build.gateOpen,
        measurements: session.file.build.measurements,
      });
    } catch (e) {
      json(res, 404, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  // Direct tool invocation — the UI is a client of the tool surface (UI
  // spec §7: the strip is populated by the UI's own check_* calls). Same
  // registry, same gates; a refusal here is a normal 200 ToolResult.
  const toolMatch = /^\/api\/projects\/([0-9a-f]+)\/tool$/.exec(path);
  if (req.method === 'POST' && toolMatch) {
    const { name, input } = await readBody(req);
    if (typeof name !== 'string') {
      json(res, 400, { error: 'name is required' });
      return;
    }
    try {
      const projectPath = sessions.projectPath(user, toolMatch[1]!);
      const session = loadSession(projectPath);
      const result = await runTool(name, input ?? {}, {
        session,
        cwd: dirname(projectPath),
      });
      if (result.ok) {
        await sessions.projectArtifacts(dirname(projectPath), `tool: ${name}`);
      }
      json(res, 200, result);
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
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
