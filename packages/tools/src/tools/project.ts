import { join } from 'node:path';
import { z } from 'zod';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { ok } from '../result.js';
import { initProjectFile } from '../session.js';

const projectInit: ToolDef<{ intent: string; path?: string }, { path: string }> = {
  name: 'project_init',
  summary:
    'Call this once, when the maker first states what they want to build and ' +
    'no project exists yet. Errors if a project.json is already present.',
  input: z.object({ intent: z.string().min(1), path: z.string().optional() }),
  mutates: false,
  gated: false,
  handler(input, ctx) {
    const path = input.path ?? join(ctx.cwd, 'project.json');
    const session = initProjectFile(path, input.intent);
    ctx.session = session;
    return ok({ path: session.path });
  },
};

const projectStatus: ToolDef = {
  name: 'project_status',
  summary:
    'Call this to orient yourself at the start of a session or after another ' +
    'writer may have changed the project — it returns counts and gate state.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    const { file, hash } = requireSession(ctx);
    const p = file.project;
    return ok({
      intent: p.intent,
      hash,
      verdict: p.feasibility?.verdict ?? null,
      counts: {
        inventory: p.inventory.length,
        requirements: p.requirements.length,
        blocks: p.architecture.blocks.length,
        links: p.architecture.links.length,
        circuitParts: p.circuit?.parts.length ?? 0,
        wires: p.circuit?.wires.length ?? 0,
      },
      build: {
        currentStep: file.build.currentStep,
        gateOpen: file.build.gateOpen,
        measurements: file.build.measurements.length,
      },
    });
  },
};

const projectInspect: ToolDef = {
  name: 'project_inspect',
  summary:
    'Call this when you need the complete project state — the full model, not ' +
    'a summary. Large; prefer project_status for orientation.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    const { file, hash } = requireSession(ctx);
    return ok({ file, hash });
  },
};

export const PROJECT_TOOLS: ToolDef[] = [
  projectInit as ToolDef,
  projectStatus,
  projectInspect,
];
