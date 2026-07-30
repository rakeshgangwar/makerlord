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

// ── the GPIO facet (D48): hand-authored, datasheet-cited MCU pin data ──

const MCU = `
partId: mcu-x
footprint:
  pins:
    A0: [0, 0]
    D3: [0, 1]
    D5: [0, 2]
    G: [0, 3]
fqbn: esp8266:esp8266:d1_mini
flash: { protocol: esptool-js, baud: 460800 }
gpio:
  A0: { analogIn: true, analogMaxV: 3.2 }
  D3: { digital: true, strap: { atBoot: HIGH, why: "GPIO0 LOW enters flash mode" } }
  D5: { digital: true, pwm: true, interrupt: true }
`;

describe('the GPIO facet (D48)', () => {
  it('parses per-pin capabilities, strap requirements, fqbn and flash', () => {
    const p = parseProfile(MCU);
    expect(p.fqbn).toBe('esp8266:esp8266:d1_mini');
    expect(p.flash).toEqual({ protocol: 'esptool-js', baud: 460800 });
    expect(p.gpio?.A0).toEqual({ analogIn: true, analogMaxV: 3.2 });
    expect(p.gpio?.D3?.strap).toEqual({
      atBoot: 'HIGH', why: 'GPIO0 LOW enters flash mode',
    });
    expect(p.gpio?.D5).toMatchObject({ digital: true, pwm: true, interrupt: true });
  });

  it('rejects a gpio pin name absent from the footprint', () => {
    expect(() => parseProfile(`
partId: mcu-x
footprint: { pins: { A0: [0, 0] } }
gpio:
  D9: { digital: true }
`)).toThrow(/D9/);
  });

  it('rejects an unknown flash protocol', () => {
    expect(() => parseProfile(`
partId: mcu-x
footprint: { pins: { A0: [0, 0] } }
flash: { protocol: usb-dfu }
`)).toThrow();
  });

  it('rejects a strap level that is not HIGH or LOW', () => {
    expect(() => parseProfile(`
partId: mcu-x
footprint: { pins: { A0: [0, 0] } }
gpio:
  A0: { digital: true, strap: { atBoot: FLOATING } }
`)).toThrow();
  });

  it('profiles without the facet stay valid', () => {
    const p = parseProfile(LED);
    expect(p.gpio).toBeUndefined();
    expect(p.fqbn).toBeUndefined();
  });
});
