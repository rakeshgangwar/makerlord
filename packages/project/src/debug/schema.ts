import { z } from 'zod';
import type { DebugSession, Observation } from './types.js';

const id = z.string().min(1);

const symptomSchema = z.object({
  kind: z.enum(['element_dead', 'wrong_reading', 'no_serial', 'board_dead']),
  ref: z.string().optional(),
  net: z.string().optional(),
  detail: z.string().optional(),
});

const faultSchema = z.union([
  z.object({ kind: z.literal('no_fault') }),
  z.object({ kind: z.literal('open_joint'), net: id, member: z.string().optional() }),
  z.object({ kind: z.literal('bridge'), netA: id, netB: id }),
  z.object({ kind: z.literal('reversed_part'), ref: id }),
  z.object({ kind: z.literal('wrong_value'), ref: id, factor: z.number().positive() }),
  z.object({ kind: z.literal('dead_rail') }),
]);

const signatureSchema = z.object({
  netVoltages: z.record(z.number()),
  provenance: z.enum(['verified', 'computed', 'sourced', 'assumed']),
});

const candidateSchema = z.object({
  id,
  fault: faultSchema,
  status: z.enum(['live', 'contradicted', 'convicted']),
  signature: signatureSchema,
  contradictedBy: z.string().optional(),
});

const observationSchema = z.union([
  z.object({ id, kind: z.literal('voltage'), net: id, value: z.number(), unit: id }),
  z.object({ id, kind: z.literal('selftest'), role: id, ok: z.boolean() }),
  z.object({ id, kind: z.literal('log'), behavior: id, value: z.string() }),
]);

export const debugSchema = z.object({
  symptom: symptomSchema,
  candidates: z.array(candidateSchema),
  observations: z.array(observationSchema),
  proposed: z.object({ net: id, why: z.string().min(1) }).optional(),
  status: z.enum(['open', 'localized', 'exonerated']),
});

export function parseDebug(input: unknown): DebugSession {
  return debugSchema.parse(input);
}

export function parseObservation(input: unknown): Observation {
  return observationSchema.parse(input);
}
