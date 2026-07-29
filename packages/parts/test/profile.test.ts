import { describe, expect, it } from 'vitest';
import { loadProfiles, parseProfile } from '../src/profile.js';

const LED = `
partId: 5mmColorLEDModuleID
footprint:
  pins:
    cathode: [0, 0]
    anode: [1, 0]
polarity: polarized
forwardVoltageV: 2.0
maxCurrentMa: 20
hazardClass: none
`;

describe('parseProfile', () => {
  it('reads identity and footprint offsets', () => {
    const p = parseProfile(LED);
    expect(p.partId).toBe('5mmColorLEDModuleID');
    expect(p.footprint.pins.anode).toEqual([1, 0]);
  });

  it('reads electrical limits', () => {
    const p = parseProfile(LED);
    expect(p.forwardVoltageV).toBe(2.0);
    expect(p.maxCurrentMa).toBe(20);
    expect(p.polarity).toBe('polarized');
  });

  it('defaults hazardClass to none when omitted', () => {
    const p = parseProfile(`
partId: x
footprint: { pins: { a: [0, 0] } }
`);
    expect(p.hazardClass).toBe('none');
  });

  it('rejects a profile with no partId', () => {
    expect(() => parseProfile('footprint: { pins: {} }')).toThrow();
  });

  it('rejects a footprint offset that is not a pair of numbers', () => {
    expect(() =>
      parseProfile(`
partId: x
footprint: { pins: { a: [0] } }
`),
    ).toThrow();
  });

  it('rejects a negative current limit', () => {
    expect(() =>
      parseProfile(`
partId: x
footprint: { pins: { a: [0, 0] } }
maxCurrentMa: -5
`),
    ).toThrow();
  });

  it('reads per-pin limits for multi-pin parts', () => {
    const p = parseProfile(`
partId: uno
footprint: { pins: { D13: [0, 0] } }
logicLevelV: 5
pinMaxMa: 20
portTotalMaxMa: 100
pinLimits:
  D13: { maxCurrentMa: 40 }
`);
    expect(p.pinMaxMa).toBe(20);
    expect(p.pinLimits?.D13?.maxCurrentMa).toBe(40);
  });
});

describe('loadProfiles', () => {
  it('loads the authored profiles keyed by partId', () => {
    const m = loadProfiles();
    expect(m.size).toBeGreaterThanOrEqual(3);
    expect(m.get('5mmColorLEDModuleID')?.polarity).toBe('polarized');
  });
});
