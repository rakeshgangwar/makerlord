import type { ToolCtx, ToolDef } from './def.js';
import type { ToolResult } from './result.js';
import { refuse } from './result.js';
import { saveSession } from './session.js';
import { ARCHITECTURE_TOOLS } from './tools/architecture.js';
import { CHECK_TOOLS } from './tools/checks.js';
import { CIRCUIT_TOOLS } from './tools/circuit.js';
import { FEASIBILITY_TOOLS } from './tools/feasibility.js';
import { GATED_TOOLS } from './tools/gated.js';
import { INVENTORY_TOOLS } from './tools/inventory.js';
import { PARTS_TOOLS } from './tools/parts.js';
import { PROJECT_TOOLS } from './tools/project.js';
import { REQUIREMENT_TOOLS } from './tools/requirements.js';
import { SIM_TOOLS } from './tools/sim.js';

/** The registry name is canonical; adapters map onto it. */
export const ALL_TOOLS: readonly ToolDef[] = [
  ...PROJECT_TOOLS,
  ...INVENTORY_TOOLS,
  ...PARTS_TOOLS,
  ...FEASIBILITY_TOOLS,
  ...REQUIREMENT_TOOLS,
  ...ARCHITECTURE_TOOLS,
  ...CIRCUIT_TOOLS,
  ...CHECK_TOOLS,
  ...GATED_TOOLS,
  ...SIM_TOOLS,
];

const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDef {
  const tool = byName.get(name);
  if (!tool) {
    const near = [...byName.keys()].filter(
      (k) => k.includes(name) || name.includes(k.split('_')[0] ?? ''),
    );
    throw new Error(
      `unknown tool "${name}"${near.length ? ` — did you mean: ${near.join(', ')}?` : ''}`,
    );
  }
  return tool;
}

/**
 * Load → validate → mutate → atomic write. expectHash is a registry-level
 * concern (spec §4): appended to every mutating tool, validated here, once.
 */
export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolCtx,
  expectHash?: string,
): Promise<ToolResult<unknown>> {
  const tool = getTool(name);
  const input: unknown = tool.input.parse(rawInput ?? {});

  if (tool.mutates && expectHash !== undefined && ctx.session) {
    if (ctx.session.hash !== expectHash) {
      return refuse('STALE_PROJECT', 'project changed since read; re-read and retry');
    }
  }

  const result = await tool.handler(input, ctx);

  if (tool.mutates && result.ok && ctx.session) {
    const saved = saveSession(ctx.session, ctx.session.hash);
    if (!saved.ok) return saved;
  }
  return result;
}
