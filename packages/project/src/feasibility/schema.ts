import { z } from 'zod';
import type { Feasibility, FeasibilityClaim } from './types.js';

const fetchedEvidence = z.object({
  url: z.string().url(),
  fetchedAt: z.string().min(1),
});

const toolEvidence = z.object({ toolCall: z.string().min(1) });

export const feasibilityClaimSchema = z
  .object({
    claim: z.string().min(1),
    grade: z.enum(['verified', 'sourced', 'inferred']),
    evidence: z.union([fetchedEvidence, toolEvidence]).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.grade === 'sourced') {
      const ok =
        c.evidence !== undefined && fetchedEvidence.safeParse(c.evidence).success;
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evidence'],
          message:
            'a sourced claim requires evidence with a fetched url and fetchedAt',
        });
      }
    }
    if (c.grade === 'verified') {
      const ok =
        c.evidence !== undefined && toolEvidence.safeParse(c.evidence).success;
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evidence'],
          message: 'a verified claim requires evidence naming the tool call',
        });
      }
    }
  });

export const feasibilitySchema = z.object({
  verdict: z.enum([
    'buildable', 'buildable-with-caveats', 'buy-instead', 'out-of-envelope',
  ]),
  claims: z.array(feasibilityClaimSchema),
  priorArt: z.array(
    z.object({
      title: z.string().min(1),
      url: z.string().url(),
      parts: z.array(z.string()),
    }),
  ),
  roughCost: z
    .object({
      value: z.number().nonnegative(),
      currency: z.string().min(1),
      grade: z.enum(['verified', 'sourced', 'inferred']),
    })
    .optional(),
});

export function parseFeasibilityClaim(input: unknown): FeasibilityClaim {
  return feasibilityClaimSchema.parse(input) as FeasibilityClaim;
}

export function parseFeasibility(input: unknown): Feasibility {
  return feasibilitySchema.parse(input) as Feasibility;
}
