import { corpusRoot, loadPart } from './corpus.js';
import type { SafetyProfile } from './profile.js';
import type { PartDefinition } from './types.js';

export interface CuratedEntry {
  file: string;
  partId: string;
}

export interface Bundle {
  parts: Record<string, PartDefinition>;
  profiles: Record<string, SafetyProfile>;
}

export function buildBundle(
  curated: CuratedEntry[],
  profiles: Map<string, SafetyProfile>,
  root: string = corpusRoot(),
): Bundle {
  const bundle: Bundle = { parts: {}, profiles: {} };
  for (const entry of curated) {
    const def = loadPart(entry.file, root);
    if (def.id !== entry.partId) {
      throw new Error(
        `bundle: ${entry.file} has moduleId ${def.id}, curated list says ${entry.partId}`,
      );
    }
    bundle.parts[def.id] = def;
    const profile = profiles.get(def.id);
    if (profile) bundle.profiles[def.id] = profile;
  }
  return bundle;
}

/** Returns human-readable problems. Empty array means the bundle is sound. */
export function validateBundle(b: Bundle): string[] {
  const problems: string[] = [];

  for (const [id, def] of Object.entries(b.parts)) {
    const profile = b.profiles[id];
    if (!profile) {
      problems.push(`part ${id} (${def.title}) has no safety profile`);
      continue;
    }
    const pinNames = new Set(def.pins.map((p) => p.name));
    for (const pin of Object.keys(profile.footprint.pins)) {
      if (!pinNames.has(pin)) {
        problems.push(`part ${id}: footprint names pin "${pin}" which the part does not have`);
      }
    }
  }

  for (const id of Object.keys(b.profiles)) {
    if (!b.parts[id]) {
      problems.push(`profile ${id} has no corresponding part in the bundle`);
    }
  }

  return problems;
}
