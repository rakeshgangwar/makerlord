import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const offset = z.tuple([z.number(), z.number()]);

const pinLimit = z.object({
  maxCurrentMa: z.number().nonnegative().optional(),
  logicLevelV: z.number().nonnegative().optional(),
});

/** D48: per-pin MCU capability, hand-authored from the datasheet — strap
 *  pins and analog domains live there, not in Arduino core headers. */
const gpioPin = z.object({
  digital: z.boolean().optional(),
  analogIn: z.boolean().optional(),
  /** Max voltage at the BOARD pin (dividers included — D1 mini A0 is 3.2). */
  analogMaxV: z.number().nonnegative().optional(),
  pwm: z.boolean().optional(),
  interrupt: z.boolean().optional(),
  /** Boot-strapping requirement: the level this pin must sit at during
   *  reset for the chip to boot normally. */
  strap: z
    .object({ atBoot: z.enum(['HIGH', 'LOW']), why: z.string().optional() })
    .optional(),
  builtinLed: z.boolean().optional(),
  note: z.string().optional(),
});

export const profileSchema = z.object({
  partId: z.string().min(1),
  footprint: z.object({ pins: z.record(offset) }),
  polarity: z.enum(['polarized', 'nonpolarized']).optional(),
  forwardVoltageV: z.number().nonnegative().optional(),
  maxCurrentMa: z.number().nonnegative().optional(),
  /** Source-side: continuous current this SUPPLY can deliver (datasheet-cited). */
  maxContinuousMa: z.number().nonnegative().optional(),
  logicLevelV: z.number().nonnegative().optional(),
  pinMaxMa: z.number().nonnegative().optional(),
  portTotalMaxMa: z.number().nonnegative().optional(),
  regulatorMaxMa: z.number().nonnegative().optional(),
  absMaxVoltageV: z.number().nonnegative().optional(),
  quiescentMa: z.number().nonnegative().optional(),
  resistanceOhms: z.number().nonnegative().optional(),
  powerRatingW: z.number().nonnegative().optional(),
  hazardClass: z
    .enum(['none', 'lipo', 'mains', 'inductive', 'highCurrent'])
    .default('none'),
  pinLimits: z.record(pinLimit).optional(),
  gpio: z.record(gpioPin).optional(),
  /** arduino-cli board identity; presence marks the profile as an MCU. */
  fqbn: z.string().min(1).optional(),
  /** How the browser flashes it (D37: WebSerial, no installs). */
  flash: z
    .object({
      protocol: z.enum(['esptool-js', 'stk500v1']),
      baud: z.number().int().positive().optional(),
    })
    .optional(),
}).superRefine((p, ctx) => {
  // A gpio entry for a pin the footprint doesn't have is a typo that would
  // silently disable its rules — reject it loudly.
  for (const pin of Object.keys(p.gpio ?? {})) {
    if (!(pin in p.footprint.pins)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `gpio names pin "${pin}" absent from the footprint`,
      });
    }
  }
});

export type SafetyProfile = z.infer<typeof profileSchema>;
export type HazardClass = SafetyProfile['hazardClass'];
export type Footprint = SafetyProfile['footprint'];

export function parseProfile(yamlText: string): SafetyProfile {
  return profileSchema.parse(parseYaml(yamlText));
}

export function profilesDir(): string {
  return resolve(process.env.MAKERLORD_PROFILES_PATH ?? './data/profiles');
}

export function loadProfiles(dir: string = profilesDir()): Map<string, SafetyProfile> {
  const out = new Map<string, SafetyProfile>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    const p = parseProfile(readFileSync(join(dir, f), 'utf8'));
    if (out.has(p.partId)) {
      throw new Error(`profile: duplicate partId ${p.partId} in ${f}`);
    }
    out.set(p.partId, p);
  }
  return out;
}
