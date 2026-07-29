import { describe, expect, it } from 'vitest';
import { classifyPinRole, normalize, parseUnitValue } from '../src/normalize.js';
import type { RawFzp } from '../src/fzp/types.js';

function raw(over: Partial<RawFzp> = {}): RawFzp {
  return {
    moduleId: 'm1',
    title: 'Part',
    properties: { family: 'LED' },
    connectors: [],
    buses: [],
    views: {},
    ...over,
  };
}

describe('classifyPinRole', () => {
  it('recognises ground by several spellings', () => {
    // "G" is the WeMos D1 mini's ground label — real corpus data.
    for (const n of ['GND', 'gnd', 'Ground', 'VSS', 'earth', 'G']) {
      expect(classifyPinRole(n)).toBe('gnd');
    }
  });

  it('recognises supply rails', () => {
    for (const n of ['VCC', 'vdd', '5V', '3V3', 'V+', 'VIN']) {
      expect(classifyPinRole(n)).toBe('supply');
    }
  });

  it('recognises io pins', () => {
    for (const n of ['D13', 'GPIO4', 'A0', 'SCL']) {
      expect(classifyPinRole(n)).toBe('io');
    }
  });

  it('recognises passive leads', () => {
    for (const n of ['anode', 'cathode', 'pin 1', 'leg2']) {
      expect(classifyPinRole(n)).toBe('passive');
    }
  });

  it('falls back to unknown', () => {
    expect(classifyPinRole('wibble')).toBe('unknown');
  });
});

describe('parseUnitValue', () => {
  it('parses plain numbers', () => {
    expect(parseUnitValue('220')).toBe(220);
  });

  it('strips trailing unit letters', () => {
    expect(parseUnitValue('0.030A')).toBeCloseTo(0.03);
    expect(parseUnitValue('0.25W')).toBeCloseTo(0.25);
    expect(parseUnitValue('5V')).toBe(5);
  });

  it('applies metric prefixes', () => {
    expect(parseUnitValue('4.7k')).toBe(4700);
    expect(parseUnitValue('1M')).toBe(1_000_000);
    expect(parseUnitValue('100m')).toBeCloseTo(0.1);
  });

  it('returns undefined for unparseable text', () => {
    expect(parseUnitValue('')).toBeUndefined();
    expect(parseUnitValue('lots')).toBeUndefined();
  });
});

describe('normalize', () => {
  it('carries identity across', () => {
    const d = normalize(raw({ moduleId: 'x', title: 'Thing' }));
    expect(d.id).toBe('x');
    expect(d.title).toBe('Thing');
  });

  it('lifts family out of properties', () => {
    expect(normalize(raw({ properties: { family: 'Resistor' } })).family)
      .toBe('Resistor');
  });

  it('defaults family to unknown when absent', () => {
    expect(normalize(raw({ properties: {} })).family).toBe('unknown');
  });

  it('turns connectors into pins with classified roles', () => {
    const d = normalize(
      raw({
        connectors: [
          { id: 'c0', name: 'GND', type: 'male' },
          { id: 'c1', name: 'anode', type: 'male' },
        ],
      }),
    );
    expect(d.pins).toEqual([
      { id: 'c0', name: 'GND', role: 'gnd' },
      { id: 'c1', name: 'anode', role: 'passive' },
    ]);
  });

  it('preserves buses verbatim', () => {
    const buses = [{ id: 'b0', members: ['c0', 'c1'] }];
    expect(normalize(raw({ buses })).buses).toEqual(buses);
  });

  it('rejects a part with no moduleId', () => {
    expect(() => normalize(raw({ moduleId: '' }))).toThrow(/moduleId/);
  });
});
