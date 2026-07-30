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

/** D48: an MCU (a profile with an fqbn) must carry its GPIO facet — the
 *  firmware cross-check rules stand on it. */
describe('the GPIO curation gate (D48)', () => {
  it('every MCU profile carries gpio + flash, and both curated MCUs exist', () => {
    const profiles = loadProfiles();
    const mcus = [...profiles.values()].filter((p) => p.fqbn !== undefined);
    const ids = mcus.map((p) => p.partId).sort();
    expect(ids).toContain('arduino_Uno_Rev3(fix)');
    expect(ids).toContain('WeMos_D1_mini_male_headers_above_fix');
    for (const mcu of mcus) {
      expect(mcu.gpio, `${mcu.partId} has fqbn but no gpio facet`).toBeDefined();
      expect(Object.keys(mcu.gpio!).length).toBeGreaterThan(0);
      expect(mcu.flash, `${mcu.partId} has fqbn but no flash protocol`).toBeDefined();
    }
  });

  it('the D1 mini facet carries the strap pins and the A0 divider', () => {
    const p = loadProfiles().get('WeMos_D1_mini_male_headers_above_fix')!;
    expect(p.gpio?.D3?.strap?.atBoot).toBe('HIGH');
    expect(p.gpio?.D4?.strap?.atBoot).toBe('HIGH');
    expect(p.gpio?.D8?.strap?.atBoot).toBe('LOW');
    expect(p.gpio?.A0?.analogMaxV).toBe(3.2);
    expect(p.gpio?.D0?.pwm).toBe(false);
  });

  it('the Uno facet carries PWM, interrupts and the built-in LED', () => {
    const p = loadProfiles().get('arduino_Uno_Rev3(fix)')!;
    for (const pin of ['D3 PWM', 'D5 PWM', 'D6 PWM', 'D9 PWM']) {
      expect(p.gpio?.[pin]?.pwm, `${pin} should be pwm`).toBe(true);
    }
    expect(p.gpio?.D2?.interrupt).toBe(true);
    expect(p.gpio?.['D13/SCK']?.builtinLed).toBe(true);
    expect(p.gpio?.A0?.analogIn).toBe(true);
  });
});

/** D25: the KiCad mapping drip — the stage-⑨ curation gate, started
 *  early. Structural validation here; kicad-cli verification lands with
 *  the PCB stage. */
describe('the KiCad mapping drip (D25)', () => {
  it('at least seven curated parts carry a mapping, all in Lib:Name form', () => {
    const mapped = [...loadProfiles().values()].filter((p) => p.kicad !== undefined);
    expect(mapped.length).toBeGreaterThanOrEqual(7);
    for (const p of mapped) {
      expect(p.kicad!.symbol, p.partId).toMatch(/^[\w-]+:[\w.,+-]+$/);
      expect(p.kicad!.footprint, p.partId).toMatch(/^[\w-]+:[\w.,+-]+$/);
    }
  });

  it('the passives that every board needs are mapped', () => {
    const profiles = loadProfiles();
    for (const id of ['ResistorModuleID', '5mmColorLEDModuleID',
      '100milCeramicCapacitorModuleID', '3254CBFC44diode']) {
      expect(profiles.get(id)?.kicad, id).toBeDefined();
    }
  });
});
