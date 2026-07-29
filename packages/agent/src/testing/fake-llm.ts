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
        const parsed = JSON.parse(body) as Record<string, unknown>;
        fake.requests.push(parsed);
        const next = fake.queue.shift();
        if (!next) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: { message: 'fake-llm: queue empty' } }));
          return;
        }
        if (parsed.stream === true) {
          serveSse(res, fake.requests.length, next);
          return;
        }
        res.setHeader('content-type', 'application/json');
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

/** Real Anthropic SSE framing, so the streaming path is tested on the wire. */
function serveSse(
  res: import('node:http').ServerResponse,
  n: number,
  canned: CannedResponse,
): void {
  res.setHeader('content-type', 'text/event-stream');
  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('message_start', {
    type: 'message_start',
    message: {
      id: `msg_${n}`, type: 'message', role: 'assistant',
      model: 'claude-opus-5', content: [], stop_reason: null,
      stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 },
    },
  });

  (canned.content as Record<string, unknown>[]).forEach((block, index) => {
    if (block.type === 'text') {
      send('content_block_start', {
        type: 'content_block_start', index,
        content_block: { type: 'text', text: '' },
      });
      send('content_block_delta', {
        type: 'content_block_delta', index,
        delta: { type: 'text_delta', text: block.text },
      });
    } else if (block.type === 'tool_use') {
      send('content_block_start', {
        type: 'content_block_start', index,
        content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
      });
      send('content_block_delta', {
        type: 'content_block_delta', index,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) },
      });
    }
    send('content_block_stop', { type: 'content_block_stop', index });
  });

  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: canned.stop_reason, stop_sequence: null },
    usage: { output_tokens: 50 },
  });
  send('message_stop', { type: 'message_stop' });
  res.end();
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
