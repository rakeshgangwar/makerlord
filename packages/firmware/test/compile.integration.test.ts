import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Firmware } from '@makerlord/project';
import type { SafetyProfile } from '@makerlord/parts';
import {
  arduinoCliAvailable, compileFirmware, writeSketch,
} from '../src/compile.js';

/**
 * The compile gate against the REAL compiler — the D13 arbiter. Known
 * good must compile; an invented API must fail with the compiler naming
 * the symbol. Skips LOUDLY when arduino-cli is missing (the ngspice
 * precedent: a silent skip shipped a wrong model once).
 */

const available = await arduinoCliAvailable();

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  arduino-cli is NOT installed — compile-gate integration tests are ' +
      'SKIPPED.\n   Install: https://arduino.github.io/arduino-cli/ then ' +
      '`arduino-cli core install arduino:avr esp8266:esp8266`\n',
  );
}

const UNO_PROFILE: SafetyProfile = {
  partId: 'arduino_Uno_Rev3(fix)',
  footprint: { pins: { 'D5 PWM': [0, 0], A0: [0, 1] } },
  hazardClass: 'none',
  fqbn: 'arduino:avr:uno',
  flash: { protocol: 'stk500v1' },
};

const FW: Firmware = {
  target: { ref: 'U1' },
  behaviors: [
    { id: 'read', kind: 'sample', role: 'MOISTURE_SENSE', everyMs: 1000 },
    { id: 'alert', kind: 'threshold', watch: 'read', above: 700,
      drive: 'STATUS_LED', to: 'HIGH' },
  ],
  roles: [
    { role: 'MOISTURE_SENSE', ref: 'S1', pin: 'o', mcuPin: 'A0', mode: 'ANALOG_IN' },
    { role: 'STATUS_LED', ref: 'L1', pin: 'a', mcuPin: 'D5 PWM', mode: 'OUTPUT' },
  ],
};

describe('writeSketch — the projection into a sketch dir (no compiler needed)', () => {
  it('writes pins.h, merged main.cpp and the ino entry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-fw-'));
    const { sketchDir } = writeSketch(dir, FW, 'arduino:avr:uno', '  int extra = 1;');
    expect(readFileSync(join(sketchDir, 'pins.h'), 'utf8'))
      .toContain('#define STATUS_LED 5');
    const main = readFileSync(join(sketchDir, 'main.cpp'), 'utf8');
    expect(main).toContain('int extra = 1;');
    expect(main).toContain('SELFTEST role=STATUS_LED');
    expect(readFileSync(join(sketchDir, 'firmware.ino'), 'utf8')).toContain('arduino-cli');
  });
});

describe.skipIf(!available)('the compile gate — real arduino-cli', () => {
  it('the known-good fixture compiles and yields a binary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-fw-'));
    const { sketchDir } = writeSketch(dir, FW, UNO_PROFILE.fqbn!);
    const r = await compileFirmware(sketchDir, UNO_PROFILE);
    expect(r.ok, r.log).toBe(true);
    expect(r.binPath).toBeDefined();
  }, 240_000);

  it('the same model compiles for the D1 mini (ESP8266 core, Dx macros)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-fw-'));
    const espFw: Firmware = {
      ...FW,
      roles: [
        { role: 'MOISTURE_SENSE', ref: 'S1', pin: 'o', mcuPin: 'A0', mode: 'ANALOG_IN' },
        { role: 'STATUS_LED', ref: 'L1', pin: 'a', mcuPin: 'D5', mode: 'OUTPUT' },
      ],
    };
    const esp: SafetyProfile = {
      partId: 'WeMos_D1_mini_male_headers_above_fix',
      footprint: { pins: { D5: [0, 0], A0: [0, 1] } },
      hazardClass: 'none',
      fqbn: 'esp8266:esp8266:d1_mini',
      flash: { protocol: 'esptool-js' },
    };
    const { sketchDir } = writeSketch(dir, espFw, esp.fqbn!);
    const r = await compileFirmware(sketchDir, esp);
    expect(r.ok, r.log).toBe(true);
    expect(r.binPath).toMatch(/\.bin$/);
  }, 240_000);

  it('an invented API fails, with the compiler naming the symbol', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-fw-'));
    const { sketchDir } = writeSketch(dir, FW, UNO_PROFILE.fqbn!,
      '  enableQuantumMode(STATUS_LED);');
    const r = await compileFirmware(sketchDir, UNO_PROFILE);
    expect(r.ok).toBe(false);
    expect(r.log).toMatch(/enableQuantumMode/);
  }, 240_000);
});
