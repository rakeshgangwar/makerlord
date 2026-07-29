import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  ALL_TOOLS, findProjectFile, loadSession, runTool,
} from '@makerlord/tools';
import type { ToolCtx } from '@makerlord/tools';

/**
 * The MCP adapter is thin and dumb (spec §2): every tool comes straight from
 * the registry, refusals are NORMAL results (never isError), and expectHash
 * is appended to every mutating tool's schema so an agent editing alongside
 * a human cannot silently clobber their work.
 */
export function buildServer(cwd: string = process.cwd()): Server {
  const server = new Server(
    { name: 'maker-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: ALL_TOOLS.map((t) => {
      const schema = zodToJsonSchema(t.input) as {
        properties?: Record<string, unknown>;
      };
      if (t.mutates) {
        schema.properties = {
          ...schema.properties,
          expectHash: {
            type: 'string',
            description:
              'contentHash from your last read; the call refuses with ' +
              'STALE_PROJECT if the project changed underneath',
          },
        };
      }
      return { name: t.name, description: t.summary, inputSchema: schema };
    }),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = { ...(request.params.arguments ?? {}) } as Record<string, unknown>;
    const expectHash =
      typeof args.expectHash === 'string' ? args.expectHash : undefined;
    delete args.expectHash;

    try {
      const ctx: ToolCtx = { cwd };
      if (name !== 'project_init') {
        const path = process.env.MAKERLORD_PROJECT ?? findProjectFile(cwd);
        ctx.session = loadSession(path);
      }
      const result = await runTool(name, args, ctx, expectHash);
      // Success and refusal are both normal results — spec §3.
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
