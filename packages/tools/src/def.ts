import type { z } from 'zod';
import type { ToolResult } from './result.js';
import type { Session } from './session.js';

/** Context a tool runs in. Every tool except project_init requires a session. */
export interface ToolCtx {
  session?: Session;
  cwd: string;
}

/**
 * Spec §6: one schema, three consumers. A single zod schema drives runtime
 * validation, the MCP inputSchema, and the CLI flags. Adding a tool means
 * adding one ToolDef — the adapters grow with no further edits.
 */
export interface ToolDef<I = unknown, O = unknown> {
  /** Canonical registry name, e.g. 'req_propose'. */
  name: string;
  /** Prescriptive: states WHEN to call, not just what. The only description an external agent sees. */
  summary: string;
  input: z.ZodType<I>;
  /** Registry appends expectHash handling when true (spec §4). */
  mutates: boolean;
  /** May return a refusal; implies mutates. Only the gated group sets this. */
  gated: boolean;
  handler(input: I, ctx: ToolCtx): Promise<ToolResult<O>> | ToolResult<O>;
}

export function requireSession(ctx: ToolCtx): Session {
  if (!ctx.session) {
    throw new Error('tool: no project loaded — run from a project directory or pass --project');
  }
  return ctx.session;
}
