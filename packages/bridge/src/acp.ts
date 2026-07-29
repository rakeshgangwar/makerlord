import { spawn, type ChildProcess } from 'node:child_process';
import type { SessionEvent } from '@makerlord/protocol';
import { normalizeStopReason, normalizeUpdate, type AcpUpdate } from './normalize.js';
import { RpcConnection } from './rpc.js';

const STDERR_RING_BYTES = 4096;
const KILL_GRACE_MS = 5000;

export interface AcpAgentOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** 10 s per spec §4.1; configurable so tests do not wait that long. */
  initTimeoutMs?: number;
  promptTimeoutMs?: number;
  killGraceMs?: number;
}

export type AcpStartResult =
  | { ok: true; agent: AcpAgent }
  | { ok: false; reason: 'NO_MCP_CAPABILITY' | 'INIT_TIMEOUT' | 'SPAWN_FAILED'; message: string };

export interface McpServerSpec {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** Does the initialize result advertise MCP server support, however spelt? */
export function supportsMcpServers(initResult: unknown): boolean {
  const caps = (initResult as { agentCapabilities?: Record<string, unknown> })
    ?.agentCapabilities;
  if (!caps) return false;
  if (caps.mcpCapabilities !== undefined) return true;
  if (caps.mcp !== undefined) return true;
  if (caps.mcpServers === true) return true;
  return false;
}

export class AcpAgent {
  private constructor(
    private child: ChildProcess,
    private rpc: RpcConnection,
    private opts: Required<Pick<AcpAgentOptions, 'promptTimeoutMs' | 'killGraceMs'>>,
    public readonly initResult: unknown,
  ) {}

  private stderrRing = '';
  private emit: (event: SessionEvent) => void = () => {};
  private turnActive = false;
  onPermissionAsk?: (
    askId: string,
    title: string,
    options: { id: string; label: string; kind: string }[],
  ) => Promise<string>;

  static async start(options: AcpAgentOptions): Promise<AcpStartResult> {
    let child: ChildProcess;
    try {
      child = spawn(options.command, options.args ?? [], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      return {
        ok: false, reason: 'SPAWN_FAILED',
        message: e instanceof Error ? e.message : String(e),
      };
    }

    const spawnFailed = new Promise<AcpStartResult>((resolve) => {
      child.on('error', (e) =>
        resolve({ ok: false, reason: 'SPAWN_FAILED', message: e.message }),
      );
    });

    const rpc = new RpcConnection(child);
    const agent = new AcpAgent(
      child,
      rpc,
      {
        promptTimeoutMs: options.promptTimeoutMs ?? 10 * 60 * 1000,
        killGraceMs: options.killGraceMs ?? KILL_GRACE_MS,
      },
      undefined,
    );
    agent.wireChild();

    const initTimeout = options.initTimeoutMs ?? 10_000;
    const init = rpc
      .request(
        'initialize',
        {
          protocolVersion: 1,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
        },
        initTimeout,
      )
      .then((result): AcpStartResult => {
        if (!supportsMcpServers(result)) {
          agent.kill();
          return {
            ok: false,
            reason: 'NO_MCP_CAPABILITY',
            message:
              'this agent cannot accept MCP servers at session creation, so it ' +
              'cannot see or mutate the project — it would only produce prose ' +
              'about a circuit it cannot inspect. Use the hosted agent instead.',
          };
        }
        (agent as { initResult: unknown }).initResult = result;
        return { ok: true, agent };
      })
      .catch((e: Error): AcpStartResult => {
        agent.kill();
        return {
          ok: false,
          reason: 'INIT_TIMEOUT',
          message: `agent did not complete initialize: ${e.message}`,
        };
      });

    return Promise.race([init, spawnFailed]);
  }

  private wireChild(): void {
    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrRing = (this.stderrRing + chunk.toString('utf8')).slice(
        -STDERR_RING_BYTES,
      );
    });
    this.child.on('exit', (code) => {
      if (this.turnActive) {
        this.turnActive = false;
        this.emit({
          t: 'session.error',
          message: `agent exited mid-turn with code ${code ?? 'unknown'}`,
          detail: this.stderrRing,
        });
      }
    });
    this.rpc.onclose = (reason) => {
      this.emit({ t: 'session.error', message: reason, detail: this.stderrRing });
      this.kill();
    };
    this.rpc.onNotification('session/update', (params) => {
      const update = (params as { update?: AcpUpdate })?.update;
      if (!update) return;
      const event = normalizeUpdate(update);
      if (event) this.emit(event);
    });
    this.rpc.onRequest('session/request_permission', async (params) => {
      const p = params as {
        options?: { optionId?: string; id?: string; name?: string; label?: string; kind?: string }[];
        toolCall?: { title?: string };
      };
      const options = (p.options ?? []).map((o) => ({
        id: o.optionId ?? o.id ?? '',
        label: o.name ?? o.label ?? '',
        kind: o.kind ?? 'allow_once',
      }));
      const askId = `ask-${Date.now()}`;
      this.emit({
        t: 'permission.ask',
        askId,
        title: p.toolCall?.title ?? 'permission requested',
        options: options as never,
      });
      // The bridge auto-approves NOTHING: without a human answer, reject.
      const chosen = this.onPermissionAsk
        ? await this.onPermissionAsk(askId, p.toolCall?.title ?? '', options)
        : options.find((o) => o.kind.startsWith('reject'))?.id ?? 'reject';
      return { outcome: { outcome: 'selected', optionId: chosen } };
    });
  }

  get stderrTail(): string {
    return this.stderrRing;
  }

  async newSession(cwd: string, mcpServers: McpServerSpec[]): Promise<string> {
    const result = (await this.rpc.request(
      'session/new',
      { cwd, mcpServers },
      30_000,
    )) as { sessionId: string };
    return result.sessionId;
  }

  /** One prompt per user turn; events stream to the callback until turn.end. */
  async prompt(
    sessionId: string,
    text: string,
    onEvent: (event: SessionEvent) => void,
  ): Promise<void> {
    this.emit = onEvent;
    this.turnActive = true;
    try {
      const result = (await this.rpc.request(
        'session/prompt',
        { sessionId, prompt: [{ type: 'text', text }] },
        this.opts.promptTimeoutMs,
      )) as { stopReason?: string };
      if (this.turnActive) {
        this.turnActive = false;
        onEvent({
          t: 'turn.end',
          reason: normalizeStopReason(result.stopReason ?? 'end_turn'),
        });
      }
    } catch (e) {
      if (this.turnActive) {
        this.turnActive = false;
        onEvent({
          t: 'session.error',
          message: e instanceof Error ? e.message : String(e),
          detail: this.stderrRing,
        });
      }
    }
  }

  /** The turn is over the moment the user cancels — not when the agent acks. */
  cancel(sessionId: string): void {
    if (this.turnActive) {
      this.turnActive = false;
      this.emit({ t: 'turn.end', reason: 'cancelled' });
    }
    this.rpc.notify('session/cancel', { sessionId });
  }

  /** SIGTERM, then SIGKILL after the grace period. No orphans. */
  kill(): void {
    if (this.child.exitCode !== null || this.child.killed) return;
    this.child.kill('SIGTERM');
    const timer = setTimeout(() => {
      if (this.child.exitCode === null) this.child.kill('SIGKILL');
    }, this.opts.killGraceMs);
    timer.unref();
    this.child.on('exit', () => clearTimeout(timer));
  }
}
