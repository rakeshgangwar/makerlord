import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { SessionEvent } from '@makerlord/protocol';
import { AcpAgent } from './acp.js';
import { PairingStore } from './pairing.js';

export interface DaemonOptions {
  port?: number;
  /** Origins allowed to connect — spec §7 origin pinning. */
  origins: string[];
  /** The ACP agent to spawn per connection (the maker's own brain). */
  agentCommand: string;
  agentArgs?: string[];
  /** The hosted engine the agent's tools execute against. */
  api: string;
  token: string;
  /** Path to maker-mcp's entry (run in remote mode via env). */
  mcpMain: string;
  initTimeoutMs?: number;
}

export interface Daemon {
  port: number;
  pairingCode: string;
  close(): void;
}

type Frame =
  | { t: 'pair'; code: string }
  | { t: 'auth'; token: string }
  | { t: 'session.new'; projectId: string }
  | { t: 'prompt'; text: string };

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

/**
 * The bridge daemon: localhost-only WebSocket, origin-pinned, paired once
 * (spec §7). Each authenticated connection may spawn ONE ACP agent whose
 * tools execute on the HOSTED engine through maker-mcp's remote mode — the
 * brain is local, the authority never leaves the server. The event frames
 * carry the same SessionEvent union the hosted SSE does: one UI consumer.
 */
export function startDaemon(opts: DaemonOptions): Promise<Daemon> {
  const pairing = new PairingStore(opts.origins);
  const code = pairing.issuePairingCode();
  const wss = new WebSocketServer({ host: '127.0.0.1', port: opts.port ?? 8790 });

  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    if (!pairing.verifyOrigin(origin)) {
      ws.close(4003, 'origin not allowed');
      return;
    }

    let authed = false;
    let agent: AcpAgent | undefined;
    let acpSessionId: string | undefined;
    let turnActive = false;

    ws.on('message', (raw: Buffer) => {
      void (async () => {
        let frame: Frame;
        try {
          frame = JSON.parse(raw.toString('utf8')) as Frame;
        } catch {
          send(ws, { t: 'error', message: 'not JSON' });
          return;
        }

        if (frame.t === 'pair') {
          const token = pairing.redeem(origin!, frame.code);
          if (token) send(ws, { t: 'paired', token });
          else send(ws, { t: 'error', message: 'wrong or spent pairing code' });
          return;
        }

        if (frame.t === 'auth') {
          authed = pairing.verifyToken(origin, frame.token);
          send(ws, authed
            ? { t: 'ready', agent: opts.agentCommand }
            : { t: 'error', message: 'bad token — re-pair (restart the bridge for a fresh code)' });
          return;
        }

        if (!authed) {
          send(ws, { t: 'error', message: 'authenticate first' });
          return;
        }

        if (frame.t === 'session.new') {
          if (!/^[0-9a-f]+$/.test(frame.projectId)) {
            send(ws, { t: 'error', message: 'bad project id' });
            return;
          }
          const startOpts: Parameters<typeof AcpAgent.start>[0] = {
            command: opts.agentCommand,
            args: opts.agentArgs ?? [],
            cwd: mkdtempSync(join(tmpdir(), 'makerlord-bridge-')),
            stripEnv: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'],
          };
          if (opts.initTimeoutMs !== undefined) startOpts.initTimeoutMs = opts.initTimeoutMs;
          const started = await AcpAgent.start(startOpts);
          if (!started.ok) {
            send(ws, { t: 'error', message: `${started.reason}: ${started.message}` });
            return;
          }
          agent = started.agent;
          // Local permission asks auto-allow for the same reason the hosted
          // ACP path does: the gates are server-side; an allowed tool still
          // refuses while a BLOCKER is live (cross-brain assertion).
          agent.onPermissionAsk = (_id, _title, options) =>
            Promise.resolve(
              (options.find((o) => o.kind === 'allow_always') ??
                options.find((o) => o.kind.startsWith('allow')) ??
                options[0])?.id ?? '',
            );
          acpSessionId = await agent.newSession(startOpts.cwd!, [{
            name: 'makerlord',
            command: process.execPath,
            args: [opts.mcpMain],
            env: {
              MAKERLORD_REMOTE_API: opts.api,
              MAKERLORD_REMOTE_TOKEN: opts.token,
              MAKERLORD_REMOTE_PROJECT: frame.projectId,
            },
          }]);
          send(ws, { t: 'session.ready' });
          return;
        }

        if (frame.t === 'prompt') {
          if (!agent || !acpSessionId) {
            send(ws, { t: 'error', message: 'no session — send session.new first' });
            return;
          }
          if (turnActive) {
            send(ws, { t: 'error', message: 'a turn is already active' });
            return;
          }
          turnActive = true;
          try {
            await agent.prompt(acpSessionId, frame.text, (event: SessionEvent) => {
              send(ws, { t: 'event', event });
            });
          } finally {
            turnActive = false;
          }
        }
      })().catch((e: Error) => send(ws, { t: 'error', message: e.message }));
    });

    ws.on('close', () => {
      agent?.kill();
    });
  });

  return new Promise((resolvePromise, reject) => {
    wss.on('error', reject);
    wss.on('listening', () =>
      resolvePromise({
        port: (wss.address() as { port: number }).port,
        pairingCode: code,
        close: () => wss.close(),
      }),
    );
  });
}
