import { z } from 'zod';
import type { Requirement } from './types.js';

export const requirementSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum([
      'power', 'environment', 'interface',
      'performance', 'physical', 'cost',
    ]),
    statement: z.string().min(1),
    metric: z.string().min(1),
    comparator: z.enum(['>=', '<=', '==', 'range']),
    value: z.number().finite(),
    max: z.number().finite().optional(),
    unit: z.string().min(1),
    consumedBy: z.array(z.string().min(1)),
    provenance: z.enum(['stated', 'derived', 'assumed']),
  })
  .refine((r) => r.comparator !== 'range' || r.max !== undefined, {
    message: 'comparator "range" requires max',
    path: ['max'],
  });

export function parseRequirement(input: unknown): Requirement {
  return requirementSchema.parse(input) as Requirement;
}

/**
 * Spec §2.1: measurable means value + unit + comparator present AND
 * consumedBy non-empty. An orphan requirement is not measurable, because
 * nothing downstream would ever read it.
 */
export function isMeasurable(r: Requirement): boolean {
  return (
    Number.isFinite(r.value) &&
    r.unit.trim().length > 0 &&
    r.comparator.length > 0 &&
    r.consumedBy.length > 0
  );
}
