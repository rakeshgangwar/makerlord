import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { isUploadRef } from './datasheets.js';
import { profileSchema, type SafetyProfile } from './profile.js';

/**
 * The proposals queue (curation spec §3): agent-drafted profiles with a
 * per-field paper trail, loading as SOURCED tier. No citation, no field
 * — every electrical claim names the datasheet it came from. Tier is
 * location: a file here is sourced; only promotion (a human moving it
 * to data/profiles/) makes it verified (D50/D51).
 */

/** The fields that make electrical claims — each demands a citation. */
export const ELECTRICAL_FIELDS = [
  'forwardVoltageV', 'maxCurrentMa', 'maxContinuousMa', 'logicLevelV',
  'pinMaxMa', 'portTotalMaxMa', 'regulatorMaxMa', 'absMaxVoltageV',
  'quiescentMa', 'resistanceOhms', 'powerRatingW',
] as const;

export const proposalSchema = z
  .object({
    partId: z.string().min(1),
    /** The corpus .fzp this part's geometry comes from — parts are
     *  never invented, proposals included. */
    file: z.string().min(1),
    proposedAt: z.string().min(1),
    citations: z.record(
      z.string().refine(
        // http(s) explicitly — zod's .url() accepts any scheme:path, which
        // would let a malformed upload ref slip through as a "URL".
        (c) => isUploadRef(c)
          || (/^https?:\/\//.test(c) && z.string().url().safeParse(c).success),
        'every citation must be an http(s) URL or an upload:sha256:<hash> ref',
      ),
    ),
    profile: profileSchema,
  })
  .superRefine((p, ctx) => {
    if (p.profile.partId !== p.partId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `partId mismatch: queue entry says "${p.partId}", profile says "${p.profile.partId}"`,
      });
    }
    for (const field of ELECTRICAL_FIELDS) {
      if (p.profile[field] !== undefined && p.citations[field] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `no citation for electrical field "${field}" — no citation, no field`,
        });
      }
    }
  });

export type Proposal = z.infer<typeof proposalSchema>;

export function parseProposal(yamlText: string): Proposal {
  return proposalSchema.parse(parseYaml(yamlText));
}

export function proposalsDir(): string {
  return resolve(process.env.MAKERLORD_PROPOSALS_PATH ?? './data/proposals');
}

export function loadProposals(dir: string = proposalsDir()): Map<string, Proposal> {
  const out = new Map<string, Proposal>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    const p = parseProposal(readFileSync(join(dir, f), 'utf8'));
    if (out.has(p.partId)) {
      throw new Error(`proposals: duplicate partId ${p.partId} in ${f}`);
    }
    out.set(p.partId, p);
  }
  return out;
}

export type PartTier = 'verified' | 'sourced';

export function proposalProfiles(
  proposals: Map<string, Proposal>,
): Map<string, SafetyProfile> {
  return new Map([...proposals.values()].map((p) => [p.partId, p.profile]));
}
