import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle, type CuratedEntry } from '../src/bundle.js';
import { validateBundle } from '../src/bundle.js';
import { loadProfiles } from '../src/profile.js';

/**
 * The curation gate: the SHIPPED manifest and profiles must validate as a
 * pair, forever. Every entry's moduleId must match its file (buildBundle
 * throws otherwise), every part must have a profile, every footprint pin
 * must name a real connector, and no profile may be an orphan. Growing the
 * library means keeping this green.
 */
describe('the shipped curated manifest', () => {
  const curated = JSON.parse(
    readFileSync(resolve('./data/curated.json'), 'utf8'),
  ) as CuratedEntry[];

  it('has at least the seventeen curated parts', () => {
    expect(curated.length).toBeGreaterThanOrEqual(17);
  });

  it('builds and validates with zero problems', () => {
    const bundle = buildBundle(curated, loadProfiles());
    expect(validateBundle(bundle)).toEqual([]);
  });

  it('covers the parts the deferred rules need: inductive loads exist', () => {
    const bundle = buildBundle(curated, loadProfiles());
    const inductive = Object.values(bundle.profiles).filter(
      (p) => p.hazardClass === 'inductive',
    );
    expect(inductive.length).toBeGreaterThanOrEqual(3);   // motor, relay, servo
  });
});
