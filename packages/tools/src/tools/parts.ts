import { z } from 'zod';
import { bundle } from '../data.js';
import type { ToolDef } from '../def.js';
import { ok } from '../result.js';

const partsSearch: ToolDef = {
  name: 'parts_search',
  summary:
    'Call this when you need a component — search the curated library before ' +
    'naming any part. You cannot invent parts; only ids returned here exist. ' +
    'An empty query lists the entire curated library.',
  input: z.object({ query: z.string() }),
  mutates: false,
  gated: false,
  handler(input) {
    const q = (input as { query: string }).query.toLowerCase();
    const hits = Object.values(bundle().parts)
      .filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.family.toLowerCase().includes(q),
      )
      .map((p) => ({ id: p.id, title: p.title, family: p.family }));
    return ok({ hits });
  },
};

const partsGet: ToolDef = {
  name: 'parts_get',
  summary:
    'Call this after parts_search, when you need the full pin list and safety ' +
    'profile of one specific part before adding or reasoning about it.',
  input: z.object({ id: z.string().min(1) }),
  mutates: false,
  gated: false,
  handler(input) {
    const { id } = input as { id: string };
    const definition = bundle().parts[id];
    if (!definition) {
      throw new Error(`parts_get: unknown part id "${id}" — use parts_search first`);
    }
    return ok({ definition, profile: bundle().profiles[id] ?? null });
  },
};

export const PARTS_TOOLS: ToolDef[] = [partsSearch, partsGet];
