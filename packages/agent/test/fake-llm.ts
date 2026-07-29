import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Buzz's fake_llm posture: a REAL HTTP server on an ephemeral port returning
 * queued canned Messages-API responses. The SDK client is pointed at it via
 * baseURL — the wire is real, only the brain is canned.
 */
export interface CannedResponse {
  content: unknown[];
  stop_reason: string;
}

export class FakeLlm {
  private server: Server;
  private queue: CannedResponse[] = [];
  /** Every request body the agent sent, for prompt/caching assertions. */
  readonly requests: Record<string, unknown>[] = [];

  private constructor(server: Server) {
    this.server = server;
  }

  static async start(): Promise<FakeLlm> {
    let fake: FakeLlm;
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => {
        body += c.toString('utf8');
      });
      req.on('end', () => {
        fake.requests.push(JSON.parse(body) as Record<string, unknown>);
        const next = fake.queue.shift();
        res.setHeader('content-type', 'application/json');
        if (!next) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: { message: 'fake-llm: queue empty' } }));
          return;
        }
        res.end(
          JSON.stringify({
            id: `msg_${fake.requests.length}`,
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5',
            content: next.content,
            stop_reason: next.stop_reason,
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        );
      });
    });
    fake = new FakeLlm(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return fake;
  }

  get baseUrl(): string {
    const addr = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${addr.port}`;
  }

  enqueue(...responses: CannedResponse[]): void {
    this.queue.push(...responses);
  }

  close(): void {
    this.server.close();
  }
}

export function textTurn(text: string): CannedResponse {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
}

export function toolTurn(
  name: string,
  input: unknown,
  id = `tu_${name}`,
): CannedResponse {
  return {
    content: [{ type: 'tool_use', id, name, input }],
    stop_reason: 'tool_use',
  };
}

export function classifierRefusal(): CannedResponse {
  return { content: [], stop_reason: 'refusal' };
}
