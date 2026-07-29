import { z } from 'zod';
import type { Feasibility } from '@makerlord/project';
import { parseFeasibilityClaim } from '@makerlord/project';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { ok } from '../result.js';

function feasibilityOf(project: { feasibility?: Feasibility }): Feasibility {
  if (!project.feasibility) {
    // Provisional until feasibility_verdict is called; conservative default.
    project.feasibility = {
      verdict: 'buildable-with-caveats',
      claims: [],
      priorArt: [],
    };
  }
  return project.feasibility;
}

const feasibilityClaim: ToolDef = {
  name: 'feasibility_claim',
  summary:
    'Call this to record a research finding about whether the project is ' +
    'buildable. A sourced claim MUST carry a fetched url and fetchedAt; a ' +
    'verified claim MUST name the tool call. Unevidenced claims are rejected.',
  input: z.object({
    claim: z.string().min(1),
    grade: z.enum(['verified', 'sourced', 'inferred']),
    evidence: z
      .union([
        z.object({ url: z.string(), fetchedAt: z.string() }),
        z.object({ toolCall: z.string() }),
      ])
      .optional(),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const claim = parseFeasibilityClaim(input); // throws on missing evidence
    feasibilityOf(s.file.project).claims.push(claim);
    return ok({ claims: s.file.project.feasibility!.claims.length });
  },
};

const feasibilityVerdict: ToolDef = {
  name: 'feasibility_verdict',
  summary:
    'Call this once research is done, to record whether the project is ' +
    'buildable, buildable with caveats, better bought, or out of envelope.',
  input: z.object({
    verdict: z.enum([
      'buildable', 'buildable-with-caveats', 'buy-instead', 'out-of-envelope',
    ]),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    feasibilityOf(s.file.project).verdict = (
      input as { verdict: Feasibility['verdict'] }
    ).verdict;
    return ok({ verdict: s.file.project.feasibility!.verdict });
  },
};

const feasibilityShow: ToolDef = {
  name: 'feasibility_show',
  summary:
    'Call this to read back the recorded feasibility verdict and its claims ' +
    'with their evidence grades.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    return ok({ feasibility: requireSession(ctx).file.project.feasibility ?? null });
  },
};

export const FEASIBILITY_TOOLS: ToolDef[] = [
  feasibilityClaim,
  feasibilityVerdict,
  feasibilityShow,
];
