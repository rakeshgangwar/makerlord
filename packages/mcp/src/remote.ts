import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ALL_TOOLS } from '@makerlord/tools';

export interface RemoteOptions {
  api: string;       // e.g. https://makerlord.dev
  token: string;     // the hosted bearer token
  projectId: string; // which hosted project this session is scoped to
}

/**
 * The remote adapter: the same 37 tools, executed on the hosted engine over
 * HTTP. This is what lets a LOCAL agent (the maker's own Claude Code) drive
 * a SERVER project — the brain moves, the authority does not. Schemas come
 * from the local registry (the bridge ships with the repo), execution and
 * gates stay server-side; a refusal arrives exactly as it would in-process.
 */
export function buildRemoteServer(opts: RemoteOptions): Server {
  const server = new Server(
    { name: 'maker-mcp-remote', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: ALL_TOOLS
      .filter((t) => t.name !== 'project_init')  // the hosted project exists
      .map((t) => ({
        name: t.name,
        description: t.summary,
        inputSchema: zodToJsonSchema(t.input) as Record<string, unknown>,
      })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const res = await fetch(
        `${opts.api}/api/projects/${opts.projectId}/tool`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${opts.token}`,
          },
          body: JSON.stringify({
            name: request.params.name,
            input: request.params.arguments ?? {},
          }),
        },
      );
      const body = await res.text();
      if (!res.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `hosted engine returned ${res.status}: ${body}` }) }],
          isError: true,
        };
      }
      // Success and refusal are both normal results — same doctrine as local.
      return { content: [{ type: 'text', text: body }] };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}
