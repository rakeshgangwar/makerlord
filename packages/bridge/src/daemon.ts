import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { SessionEvent } from '@makerlord/protocol';
import { AcpAgent } from './acp.js';
import { digestTranscript } from './digest.js';
import { PairingStore } from './pairing.js';

export interface DaemonOptions {
  port?: number;
  /** Origins allowed to connect — spec §7 origin pinning. */
  origins: string[];
  /** The ACP agent to spawn per connection (the maker's own brain). */
  agentCommand: string;
  agentArgs?: string[];
  /** Human name shown in the app ("Claude Code", "Gemini CLI"). */
  agentLabel?: string;
  /** The hosted engine the agent's tools execute against. */
  api: string;
  token: string;
  /** Path to maker-mcp's entry (run in remote mode via env). */
  mcpMain: string;
  /** Extra args before env config — the bundled binary passes ['mcp']. */
  mcpArgs?: string[];
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
      process.stdout.write(`bridge: rejected connection from origin ${origin ?? '(none)'}\n`);
      ws.close(4003, 'origin not allowed');
      return;
    }
    process.stdout.write(`bridge: browser connected (${origin})\n`);

    let authed = false;
    let agent: AcpAgent | undefined;
    let acpSessionId: string | undefined;
    let projectId: string | undefined;
    let turnActive = false;
    let contextPreamble = '';

    /** Flush a completed turn into the hosted transcript so a reload
     *  replays one continuous history. Best-effort: a flush failure must
     *  never break the turn the maker just watched succeed. */
    const flushTranscript = async (records: unknown[]): Promise<void> => {
      if (!projectId) return;
      try {
        await fetch(`${opts.api}/api/projects/${projectId}/transcript`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${opts.token}`,
          },
          body: JSON.stringify({ records }),
        });
      } catch {
        // offline or engine unreachable — the turn itself already happened
      }
    };

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
          process.stdout.write(token
            ? 'bridge: paired ✓\n'
            : `bridge: pairing failed — wrong or spent code "${frame.code}"\n`);
          if (token) send(ws, { t: 'paired', token });
          else send(ws, { t: 'error', message: 'wrong or spent pairing code' });
          return;
        }

        if (frame.t === 'auth') {
          authed = pairing.verifyToken(origin, frame.token);
          send(ws, authed
            ? { t: 'ready', agent: opts.agentLabel ?? opts.agentCommand }
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
            args: [opts.mcpMain, ...(opts.mcpArgs ?? [])],
            env: {
              MAKERLORD_REMOTE_API: opts.api,
              MAKERLORD_REMOTE_TOKEN: opts.token,
              MAKERLORD_REMOTE_PROJECT: frame.projectId,
            },
          }]);
          projectId = frame.projectId;
          // A fresh local agent knows nothing of the conversation so far —
          // hand it the hosted transcript as a first-prompt preamble.
          try {
            const res = await fetch(
              `${opts.api}/api/projects/${projectId}/transcript`,
              { headers: { authorization: `Bearer ${opts.token}` } },
            );
            if (res.ok) {
              const { records } = (await res.json()) as { records: unknown[] };
              contextPreamble = digestTranscript(records);
            }
          } catch {
            // no history is a degraded session, not a failed one
          }
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
          // The preamble rides the first prompt only; the flush records the
          // maker's actual words, never the injected history.
          const wired = contextPreamble
            ? `${contextPreamble}\n${frame.text}`
            : frame.text;
          contextPreamble = '';
          const records: unknown[] = [{ kind: 'maker', text: frame.text }];
          try {
            await agent.prompt(acpSessionId, wired, (event: SessionEvent) => {
              records.push({ kind: 'event', event });
              send(ws, { t: 'event', event });
            });
          } finally {
            turnActive = false;
            await flushTranscript(records);
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
