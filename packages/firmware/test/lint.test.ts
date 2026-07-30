import { describe, expect, it } from 'vitest';
import type { SafetyProfile } from '@makerlord/parts';
import type { Role } from '@makerlord/project';
import { lintApplicationRegion } from '../src/lint.js';

/**
 * D46 made mechanical: the application region references roles, never
 * pins. The lint is a vocabulary table + pin-position call sites — not a
 * C++ parser — over ONE bounded region the engine controls.
 */

const PROFILE: SafetyProfile = {
  partId: 'mcu-x',
  footprint: { pins: { A0: [0, 0], D5: [0, 1], G: [0, 2] } },
  hazardClass: 'none',
  fqbn: 'esp8266:esp8266:d1_mini',
  gpio: { A0: { analogIn: true }, D5: { digital: true } },
};

const ROLES: Role[] = [
  { role: 'STATUS_LED', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'OUTPUT' },
];

const lint = (code: string) => lintApplicationRegion(code, PROFILE, ROLES);

describe('the raw-pin lint (RULE_FW_RAW_PIN_LITERAL)', () => {
  it('fires on a board pin name in a pin-position call', () => {
    const f = lint('digitalWrite(D5, HIGH);');
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('RULE_FW_RAW_PIN_LITERAL');
    expect(f[0]!.severity).toBe('BLOCKER');
    expect(f[0]!.message).toMatch(/D5/);
    expect(f[0]!.suggestedFix).toMatch(/STATUS_LED/);   // names the role to use
  });

  it('fires on a bare integer in a pin position', () => {
    const f = lint('pinMode(13, OUTPUT);');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/13/);
  });

  it('fires on GPIO-number vocabulary anywhere in the region', () => {
    expect(lint('int p = GPIO14; use(p);')).toHaveLength(1);
  });

  it('fires on a pin name assigned to a variable', () => {
    expect(lint('const int led = D5;')).toHaveLength(1);
  });

  it('passes role symbols in pin positions', () => {
    expect(lint('digitalWrite(STATUS_LED, HIGH);')).toEqual([]);
  });

  it('passes integers that are not pins', () => {
    expect(lint('delay(500); Serial.begin(115200); int t = analogRead(MOISTURE_SENSE) + 13;')).toEqual([]);
  });

  it('ignores comments and string literals', () => {
    expect(lint(`
      // digitalWrite(D5, HIGH) would be wrong
      /* also wrong: pinMode(13, OUTPUT) */
      Serial.println("pin D5 status");
    `)).toEqual([]);
  });
});
