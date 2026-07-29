import type { ChildProcess } from 'node:child_process';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: unknown;
}

/**
 * Newline-delimited JSON-RPC 2.0 over a child's stdio. If the published ACP
 * framing drifts, this file and normalize.ts absorb it (spec §4 ⚠️).
 */
export class RpcConnection {
  private nextId = 1;
  private pending = new Map<number | string, Pending>();
  private buffer = '';
  private notificationHandlers = new Map<string, (params: unknown) => void>();
  private requestHandlers = new Map<
    string,
    (params: unknown) => Promise<unknown> | unknown
  >();
  private closed = false;
  onclose?: (reason: string) => void;

  constructor(private child: ChildProcess) {
    child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk));
    child.on('exit', () => {
      this.closed = true;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('rpc: agent process exited'));
      }
      this.pending.clear();
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    for (;;) {
      const nl = this.buffer.indexOf('\n');
      if (nl < 0) return;
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line.length === 0) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // not JSON — an agent printing junk to stdout
      }
      this.dispatch(msg);
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    const id = msg.id as number | string | undefined;
    if (id !== undefined && ('result' in msg || 'error' in msg)) {
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      clearTimeout(p.timer);
      if ('error' in msg && msg.error) {
        const err = msg.error as { message?: string };
        p.reject(new Error(err.message ?? 'rpc: agent returned an error'));
      } else {
        p.resolve(msg.result);
      }
      return;
    }
    const method = msg.method as string | undefined;
    if (method === undefined) return;
    if (id !== undefined) {
      const handler = this.requestHandlers.get(method);
      if (!handler) {
        this.send({ jsonrpc: '2.0', id, error: { code: -32601, message: `no handler for ${method}` } });
        return;
      }
      Promise.resolve(handler(msg.params))
        .then((result) => this.send({ jsonrpc: '2.0', id, result }))
        .catch((e: Error) =>
          this.send({ jsonrpc: '2.0', id, error: { code: -32000, message: e.message } }),
        );
      return;
    }
    this.notificationHandlers.get(method)?.(msg.params);
  }

  private send(msg: unknown): void {
    if (this.closed) return;
    const line = `${JSON.stringify(msg)}\n`;
    const ws = this.child.stdin;
    if (!ws || !ws.writable) {
      this.closed = true;
      this.onclose?.('agent stopped reading stdin');
      return;
    }
    ws.write(line, (err) => {
      if (err) {
        this.closed = true;
        this.onclose?.('write to agent failed');
      }
    });
  }

  request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`rpc: ${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  onNotification(method: string, handler: (params: unknown) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  onRequest(
    method: string,
    handler: (params: unknown) => Promise<unknown> | unknown,
  ): void {
    this.requestHandlers.set(method, handler);
  }
}
