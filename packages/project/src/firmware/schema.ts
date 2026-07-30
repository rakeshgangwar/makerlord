import { z } from 'zod';
import type { Behavior, Firmware } from './types.js';

const id = z.string().min(1);
const level = z.enum(['HIGH', 'LOW']);

const sample = z.object({
  id, kind: z.literal('sample'),
  role: z.string().min(1),
  everyMs: z.number().int().positive(),
});

const threshold = z
  .object({
    id, kind: z.literal('threshold'),
    watch: z.string().min(1),
    above: z.number().optional(),
    below: z.number().optional(),
    drive: z.string().min(1),
    to: level,
  })
  .refine((t) => t.above !== undefined || t.below !== undefined, {
    message: 'a threshold needs above and/or below',
  });

const drive = z.object({
  id, kind: z.literal('drive'),
  role: z.string().min(1),
  to: level,
});

const serialLog = z.object({
  id, kind: z.literal('serial_log'),
  watch: z.string().min(1),
});

/** The CLOSED set — an unknown kind is a validation error, never a
 *  fallthrough to codegen. */
export const behaviorSchema = z.union([sample, threshold, drive, serialLog]);

const roleSchema = z.object({
  role: z.string().min(1),
  ref: z.string().min(1),
  pin: z.string().min(1),
  mcuPin: z.string().min(1),
  mode: z.enum(['ANALOG_IN', 'INPUT', 'OUTPUT']),
});

export const firmwareSchema = z
  .object({
    target: z.object({ ref: z.string().min(1) }),
    behaviors: z.array(behaviorSchema),
    roles: z.array(roleSchema),
    applicationRegion: z.string().optional(),
    lastBuild: z
      .object({
        ok: z.boolean(),
        bin: z.string().optional(),
        at: z.string().min(1),
      })
      .optional(),
  })
  .superRefine((fw, ctx) => {
    const behaviorIds = fw.behaviors.map((b) => b.id);
    if (new Set(behaviorIds).size !== behaviorIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['behaviors'],
        message: 'duplicate behavior id',
      });
    }
    const roleNames = fw.roles.map((r) => r.role);
    if (new Set(roleNames).size !== roleNames.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roles'],
        message: 'duplicate role name',
      });
    }
  });

export function parseBehavior(input: unknown): Behavior {
  return behaviorSchema.parse(input);
}

export function parseFirmware(input: unknown): Firmware {
  return firmwareSchema.parse(input);
}
