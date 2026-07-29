import { describe, expect, it } from 'vitest';
import {
  parseFeasibility, parseFeasibilityClaim,
} from '../src/feasibility/schema.js';

const SOURCED = {
  claim: 'three people have built a soil sensor on ESP32',
  grade: 'sourced',
  evidence: { url: 'https://example.com/build', fetchedAt: '2026-07-29T10:00:00Z' },
};

describe('parseFeasibilityClaim', () => {
  it('accepts a sourced claim with fetched evidence', () => {
    expect(parseFeasibilityClaim(SOURCED).grade).toBe('sourced');
  });

  it('REJECTS a sourced claim with no evidence at all', () => {
    const { evidence, ...noEvidence } = SOURCED;
    expect(() => parseFeasibilityClaim(noEvidence)).toThrow(/evidence/i);
  });

  it('REJECTS a sourced claim whose evidence lacks fetchedAt', () => {
    expect(() =>
      parseFeasibilityClaim({ ...SOURCED, evidence: { url: 'https://x.test' } }),
    ).toThrow();
  });

  it('REJECTS a sourced claim backed only by a tool call', () => {
    expect(() =>
      parseFeasibilityClaim({ ...SOURCED, evidence: { toolCall: 'search_parts' } }),
    ).toThrow(/evidence/i);
  });

  it('accepts a verified claim backed by a tool call', () => {
    const c = parseFeasibilityClaim({
      claim: 'the library has a profile for this sensor',
      grade: 'verified',
      evidence: { toolCall: 'search_parts' },
    });
    expect(c.grade).toBe('verified');
  });

  it('REJECTS a verified claim with no evidence', () => {
    expect(() =>
      parseFeasibilityClaim({ claim: 'x', grade: 'verified' }),
    ).toThrow(/evidence/i);
  });

  it('accepts an inferred claim with no evidence — that is what inferred means', () => {
    const c = parseFeasibilityClaim({
      claim: 'roughly a weekend of work',
      grade: 'inferred',
    });
    expect(c.evidence).toBeUndefined();
  });
});

describe('parseFeasibility', () => {
  it('accepts a complete verdict', () => {
    const f = parseFeasibility({
      verdict: 'buildable',
      claims: [SOURCED],
      priorArt: [{ title: 'Soil sensor', url: 'https://x.test', parts: ['esp32'] }],
      roughCost: { value: 28, currency: 'GBP', grade: 'inferred' },
    });
    expect(f.verdict).toBe('buildable');
  });

  it('rejects an unknown verdict', () => {
    expect(() =>
      parseFeasibility({ verdict: 'vibes', claims: [], priorArt: [] }),
    ).toThrow();
  });

  it('accepts buy-instead as a legitimate terminal verdict', () => {
    const f = parseFeasibility({
      verdict: 'buy-instead', claims: [], priorArt: [],
    });
    expect(f.verdict).toBe('buy-instead');
  });
});
