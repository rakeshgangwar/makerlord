import { z } from 'zod';
import { bundle, geometryIndex, tierOf } from '../data.js';
import type { ToolDef } from '../def.js';
import { ok } from '../result.js';

const partsSearch: ToolDef = {
  name: 'parts_search',
  summary:
    'Call this when you need a component — search the library before naming ' +
    'any part. You cannot invent parts; only ids returned here exist. Hits ' +
    'carry a tier: verified and sourced are usable; includeGeometry adds ' +
    'the whole corpus as browse-only hits — propose a profile to use one.',
  input: z.object({
    query: z.string(),
    includeGeometry: z.boolean().optional(),
  }),
  mutates: false,
  gated: false,
  handler(input) {
    const { query, includeGeometry } = input as {
      query: string; includeGeometry?: boolean;
    };
    const q = query.toLowerCase();
    const match = (p: { id: string; title: string; family: string }): boolean =>
      p.id.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      p.family.toLowerCase().includes(q);

    const hits: { id: string; title: string; family: string; tier: string; file?: string }[] =
      Object.values(bundle().parts)
        .filter(match)
        .map((p) => ({ id: p.id, title: p.title, family: p.family, tier: tierOf(p.id) }));

    if (includeGeometry === true) {
      const known = new Set(hits.map((h) => h.id));
      for (const g of geometryIndex()) {
        if (known.has(g.id) || !match(g)) continue;
        // Browse-only: not addable until a profile proposal exists.
        hits.push({ ...g, tier: 'geometry' });
      }
    }
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
    return ok({ definition, profile: bundle().profiles[id] ?? null, tier: tierOf(id) });
  },
};

export const PARTS_TOOLS: ToolDef[] = [partsSearch, partsGet];
