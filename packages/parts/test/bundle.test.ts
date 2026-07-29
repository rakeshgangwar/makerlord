import { describe, expect, it } from 'vitest';
import { buildBundle, validateBundle } from '../src/bundle.js';
import { loadProfiles } from '../src/profile.js';
import { parseProfile } from '../src/profile.js';

const CURATED = [
  { file: 'core/LED-generic-5mm.fzp', partId: '5mmColorLEDModuleID' },
];

describe('buildBundle', () => {
  it('includes only the curated parts', () => {
    const b = buildBundle(CURATED, loadProfiles());
    expect(Object.keys(b.parts)).toEqual(['5mmColorLEDModuleID']);
  });

  it('attaches the matching profile', () => {
    const b = buildBundle(CURATED, loadProfiles());
    expect(b.profiles['5mmColorLEDModuleID']?.polarity).toBe('polarized');
  });

  it('throws when a curated partId does not match the file it names', () => {
    expect(() =>
      buildBundle(
        [{ file: 'core/LED-generic-5mm.fzp', partId: 'wrong-id' }],
        loadProfiles(),
      ),
    ).toThrow(/wrong-id/);
  });
});

describe('validateBundle', () => {
  it('accepts a sound bundle', () => {
    expect(validateBundle(buildBundle(CURATED, loadProfiles()))).toEqual([]);
  });

  it('reports a part with no profile', () => {
    const b = buildBundle(CURATED, new Map());
    expect(validateBundle(b).join(' ')).toMatch(/no safety profile/i);
  });

  it('reports a footprint naming a pin the part does not have', () => {
    const bad = parseProfile(`
partId: 5mmColorLEDModuleID
footprint: { pins: { nonexistent: [0, 0] } }
`);
    const b = buildBundle(CURATED, new Map([[bad.partId, bad]]));
    expect(validateBundle(b).join(' ')).toMatch(/nonexistent/);
  });

  it('reports a profile with no corresponding part', () => {
    const orphan = parseProfile(`
partId: ghost
footprint: { pins: { a: [0, 0] } }
`);
    const b = buildBundle(CURATED, loadProfiles());
    b.profiles.ghost = orphan;
    expect(validateBundle(b).join(' ')).toMatch(/ghost/);
  });
});
