import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const offset = z.tuple([z.number(), z.number()]);

const pinLimit = z.object({
  maxCurrentMa: z.number().nonnegative().optional(),
  logicLevelV: z.number().nonnegative().optional(),
});

export const profileSchema = z.object({
  partId: z.string().min(1),
  footprint: z.object({ pins: z.record(offset) }),
  polarity: z.enum(['polarized', 'nonpolarized']).optional(),
  forwardVoltageV: z.number().nonnegative().optional(),
  maxCurrentMa: z.number().nonnegative().optional(),
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
