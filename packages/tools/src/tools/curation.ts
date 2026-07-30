import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as toYaml } from 'yaml';
import { z } from 'zod';
import {
  ELECTRICAL_FIELDS, loadPart, proposalSchema, proposalsDir,
} from '@makerlord/parts';
import { tierOf } from '../data.js';
import type { ToolDef } from '../def.js';
import { ok, refuse } from '../result.js';

/**
 * The propose half of the pipeline (curation spec §4): the agent drafts,
 * two arbiters dispose — the machine here for shape, a human later for
 * truth. Promotion does NOT exist in this registry (D51): `maker curate
 * promote` lives in the maintainer CLI only, so no agent — local brain
 * included — can move a part to verified. The absence is the guarantee.
 */

/** Family plausibility — cheap sanity that makes human review cheaper. */
export function plausibilityWarnings(profile: {
  forwardVoltageV?: number;
  resistanceOhms?: number;
  absMaxVoltageV?: number;
  quiescentMa?: number;
}): string[] {
  const warnings: string[] = [];
  if (profile.forwardVoltageV !== undefined
    && (profile.forwardVoltageV < 1.2 || profile.forwardVoltageV > 4)) {
    warnings.push(
      `forwardVoltageV ${profile.forwardVoltageV} is outside the diode-plausible ` +
      '1.2–4 V band — double-check the datasheet',
    );
  }
  if (profile.resistanceOhms !== undefined && profile.resistanceOhms > 10_000_000) {
    warnings.push(`resistanceOhms ${profile.resistanceOhms} is over 10 MΩ — unusual`);
  }
  if (profile.absMaxVoltageV !== undefined && profile.absMaxVoltageV > 48) {
    warnings.push(
      `absMaxVoltageV ${profile.absMaxVoltageV} exceeds the 48 V bench envelope — ` +
      'this part may never be usable on a breadboard',
    );
  }
  if (profile.quiescentMa !== undefined && profile.quiescentMa > 500) {
    warnings.push(`quiescentMa ${profile.quiescentMa} is very high — is this the peak, not quiescent?`);
  }
  return warnings;
}

const profilePropose: ToolDef = {
  name: 'profile_propose',
  summary:
    'Call this after researching a part\'s datasheet — it files a SOURCED ' +
    'profile proposal into the curation queue. Every electrical field needs ' +
    'a citation URL you actually fetched. A human promotes it to verified; ' +
    'you cannot.',
  input: z.object({
    file: z.string().min(1),
    partId: z.string().min(1),
    profile: z.record(z.unknown()),
    citations: z.record(z.string()),
  }),
  mutates: false,   // mutates the REPO's proposals queue, not project.json
  gated: false,
  handler(input) {
    const { file, partId, profile, citations } = input as {
      file: string; partId: string;
      profile: Record<string, unknown>; citations: Record<string, string>;
    };

    if (tierOf(partId) === 'verified') {
      return refuse(
        'PROFILE_UNVERIFIED',
        `${partId} already has a VERIFIED profile — proposals never shadow ` +
        'the truth. Edit data/profiles/ through review if it is wrong.',
      );
    }

    // The corpus is the geometry authority — parts are never invented.
    const def = loadPart(file);
    if (def.id !== partId) {
      throw new Error(
        `profile_propose: ${file} has moduleId "${def.id}", not "${partId}"`,
      );
    }

    const proposal = proposalSchema.parse({
      partId,
      file,
      proposedAt: new Date().toISOString(),
      citations,
      profile,
    });

    // Footprint pins must be REAL connectors on the corpus part.
    const connectorNames = new Set(def.pins.map((p) => p.name));
    for (const pin of Object.keys(proposal.profile.footprint.pins)) {
      if (!connectorNames.has(pin)) {
        throw new Error(
          `profile_propose: footprint names pin "${pin}", which ${partId} ` +
          `does not have (its connectors: ${[...connectorNames].join(', ')})`,
        );
      }
    }

    const dir = proposalsDir();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${partId.replace(/[^A-Za-z0-9._-]+/g, '_')}.yaml`);
    writeFileSync(path, toYaml(proposal));

    return ok({
      queued: partId,
      path,
      tier: 'sourced',
      plausibility: plausibilityWarnings(proposal.profile),
      citedFields: ELECTRICAL_FIELDS.filter((f) => proposal.profile[f] !== undefined),
      next: 'a human reviews and promotes with `maker curate` — until then the part designs and simulates, but the power gate refuses it',
    });
  },
};

export const CURATION_TOOLS: ToolDef[] = [profilePropose];
