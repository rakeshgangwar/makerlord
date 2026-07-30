import { describe, expect, it } from 'vitest';
import { emptyProject } from '../src/model.js';
import {
  parseBehavior, parseFirmware,
} from '../src/firmware/schema.js';

/**
 * The firmware facet (spec §2): behaviors are the maker's vocabulary — a
 * CLOSED set; a kind the engine doesn't know is a validation error, never
 * a fallthrough to codegen. Roles are derived, never authored — the
 * schema stores them, no tool sets mcuPin.
 */
describe('the behavior closed set', () => {
  it('parses each of the four kinds', () => {
    expect(parseBehavior({
      id: 'read-soil', kind: 'sample', role: 'MOISTURE_SENSE', everyMs: 60000,
    }).kind).toBe('sample');
    expect(parseBehavior({
      id: 'alert', kind: 'threshold', watch: 'read-soil', above: 700,
      drive: 'STATUS_LED', to: 'HIGH',
    }).kind).toBe('threshold');
    expect(parseBehavior({
      id: 'lamp-on', kind: 'drive', role: 'STATUS_LED', to: 'HIGH',
    }).kind).toBe('drive');
    expect(parseBehavior({
      id: 'report', kind: 'serial_log', watch: 'read-soil',
    }).kind).toBe('serial_log');
  });

  it('rejects an unknown kind — no fallthrough to codegen', () => {
    expect(() => parseBehavior({
      id: 'x', kind: 'pwm_sweep', role: 'R',
    })).toThrow();
  });

  it('rejects a threshold with neither above nor below', () => {
    expect(() => parseBehavior({
      id: 'x', kind: 'threshold', watch: 'y', drive: 'R', to: 'HIGH',
    })).toThrow(/above|below/);
  });

  it('rejects a sample with a non-positive period', () => {
    expect(() => parseBehavior({
      id: 'x', kind: 'sample', role: 'R', everyMs: 0,
    })).toThrow();
  });
});

describe('the firmware facet', () => {
  it('round-trips target, behaviors and derived roles', () => {
    const fw = parseFirmware({
      target: { ref: 'U1' },
      behaviors: [
        { id: 'read-soil', kind: 'sample', role: 'MOISTURE_SENSE', everyMs: 60000 },
      ],
      roles: [
        { role: 'MOISTURE_SENSE', ref: 'SENS1', pin: 'AOUT',
          mcuPin: 'A0', mode: 'ANALOG_IN' },
      ],
    });
    expect(fw.target.ref).toBe('U1');
    expect(fw.roles[0]).toMatchObject({ role: 'MOISTURE_SENSE', mcuPin: 'A0' });
  });

  it('rejects duplicate behavior ids and duplicate role names', () => {
    expect(() => parseFirmware({
      target: { ref: 'U1' },
      behaviors: [
        { id: 'a', kind: 'serial_log', watch: 'x' },
        { id: 'a', kind: 'serial_log', watch: 'y' },
      ],
      roles: [],
    })).toThrow(/duplicate/i);
    expect(() => parseFirmware({
      target: { ref: 'U1' },
      behaviors: [],
      roles: [
        { role: 'R', ref: 'A', pin: 'p', mcuPin: 'D1', mode: 'OUTPUT' },
        { role: 'R', ref: 'B', pin: 'q', mcuPin: 'D2', mode: 'OUTPUT' },
      ],
    })).toThrow(/duplicate/i);
  });

  it('a project without the facet stays valid', () => {
    const p = emptyProject('a lamp');
    expect(p.firmware).toBeUndefined();
  });
});
