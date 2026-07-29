import { describe, expect, it } from 'vitest';
import { isMeasurable, parseRequirement } from '../src/requirements/schema.js';
import type { Requirement } from '../src/requirements/types.js';

const GOOD = {
  id: 'r1',
  category: 'power',
  statement: '≥6 months on 2×AA, one reading per hour',
  metric: 'battery_runtime',
  comparator: '>=',
  value: 6,
  unit: 'months',
  consumedBy: ['CHECK_POWER_BUDGET'],
  provenance: 'stated',
};

describe('parseRequirement', () => {
  it('accepts a well-formed requirement', () => {
    expect(parseRequirement(GOOD).metric).toBe('battery_runtime');
  });

  it('rejects an unknown category', () => {
    expect(() => parseRequirement({ ...GOOD, category: 'vibes' })).toThrow();
  });

  it('rejects a blank unit', () => {
    expect(() => parseRequirement({ ...GOOD, unit: '' })).toThrow();
  });

  it('requires max when comparator is range', () => {
    expect(() =>
      parseRequirement({ ...GOOD, comparator: 'range' }),
    ).toThrow(/max/);
  });

  it('accepts range when max is supplied', () => {
    const r = parseRequirement({ ...GOOD, comparator: 'range', value: 0, max: 40, unit: 'C' });
    expect(r.max).toBe(40);
  });
});

describe('isMeasurable', () => {
  it('is true for a complete requirement', () => {
    expect(isMeasurable(parseRequirement(GOOD))).toBe(true);
  });

  it('is false when consumedBy is empty — nothing reads it', () => {
    const r = { ...parseRequirement(GOOD), consumedBy: [] } as Requirement;
    expect(isMeasurable(r)).toBe(false);
  });

  it('is false when the unit is blank', () => {
    const r = { ...parseRequirement(GOOD), unit: '  ' } as Requirement;
    expect(isMeasurable(r)).toBe(false);
  });
});
