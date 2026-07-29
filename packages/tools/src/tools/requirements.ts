import { z } from 'zod';
import { parseRequirement, slotsFor, suggestArchetype } from '@makerlord/project';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { ok } from '../result.js';

const reqSlots: ToolDef = {
  name: 'req_slots',
  summary:
    'Call this at the start of requirements elicitation — it suggests an ' +
    'archetype from the intent and returns the question slots to work through.',
  input: z.object({ intent: z.string().optional() }),
  mutates: false,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const intent = (input as { intent?: string }).intent ?? s.file.project.intent;
    const archetype = suggestArchetype(intent);
    return ok({
      archetype: archetype ? { id: archetype.id, name: archetype.name } : null,
      slots: slotsFor(archetype?.id),
    });
  },
};

const reqPropose: ToolDef = {
  name: 'req_propose',
  summary:
    'Call this when the maker states a target with a number in it — a runtime, ' +
    'a temperature range, a size limit — or when you fill a slot with a ' +
    'default (then provenance MUST be "assumed").',
  input: z.object({
    id: z.string().min(1),
    category: z.enum([
      'power', 'environment', 'interface', 'performance', 'physical', 'cost',
    ]),
    statement: z.string().min(1),
    metric: z.string().min(1),
    comparator: z.enum(['>=', '<=', '==', 'range']),
    value: z.number(),
    max: z.number().optional(),
    unit: z.string().min(1),
    consumedBy: z.array(z.string()),
    provenance: z.enum(['stated', 'derived', 'assumed']),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const r = parseRequirement(input);
    if (s.file.project.requirements.some((x) => x.id === r.id)) {
      throw new Error(`req_propose: requirement "${r.id}" already exists`);
    }
    s.file.project.requirements.push(r);
    return ok({ id: r.id, count: s.file.project.requirements.length });
  },
};

const reqConfirm: ToolDef = {
  name: 'req_confirm',
  summary:
    'Call this when the maker confirms or corrects an assumed requirement — ' +
    'it flips provenance to stated and optionally updates the value.',
  input: z.object({
    id: z.string().min(1),
    value: z.number().optional(),
    max: z.number().optional(),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { id, value, max } = input as { id: string; value?: number; max?: number };
    const r = s.file.project.requirements.find((x) => x.id === id);
    if (!r) throw new Error(`req_confirm: no requirement "${id}"`);
    r.provenance = 'stated';
    if (value !== undefined) r.value = value;
    if (max !== undefined) r.max = max;
    return ok({ id, provenance: r.provenance });
  },
};

const reqList: ToolDef = {
  name: 'req_list',
  summary:
    'Call this to review the requirements so far — before architecture, and ' +
    'whenever deciding what still needs asking.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    return ok({ requirements: requireSession(ctx).file.project.requirements });
  },
};

const reqRemove: ToolDef = {
  name: 'req_remove',
  summary:
    'Call this when the maker withdraws a requirement or it was captured wrong ' +
    'beyond repair — prefer req_confirm for value corrections.',
  input: z.object({ id: z.string().min(1) }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { id } = input as { id: string };
    const before = s.file.project.requirements.length;
    s.file.project.requirements = s.file.project.requirements.filter(
      (r) => r.id !== id,
    );
    if (s.file.project.requirements.length === before) {
      throw new Error(`req_remove: no requirement "${id}"`);
    }
    return ok({ count: s.file.project.requirements.length });
  },
};

export const REQUIREMENT_TOOLS: ToolDef[] = [
  reqSlots, reqPropose, reqConfirm, reqList, reqRemove,
];
