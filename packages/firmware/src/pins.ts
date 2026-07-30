import type { Role } from '@makerlord/project';

/**
 * pins.h is a PURE projection (D2/D46): the one place a pin name may
 * appear, regenerated on every netlist change, byte-identical for the
 * same model. Roles render sorted by name so output never depends on
 * caller ordering.
 */

/** Corpus pin name → the token the Arduino core actually accepts. ESP
 *  cores define Dx macros; AVR digital pins are bare numbers; Ax works
 *  everywhere. Corpus names carry tags ("D3 PWM", "A4/SDA") — strip
 *  them. */
export function arduinoToken(mcuPin: string, fqbn: string): string {
  const analog = /^A(\d+)/.exec(mcuPin);
  if (analog) return `A${analog[1]}`;
  const digital = /^D(\d+)/.exec(mcuPin);
  if (digital) {
    return fqbn.startsWith('arduino:avr') ? digital[1]! : `D${digital[1]}`;
  }
  throw new Error(
    `pins.h: no Arduino token for pin "${mcuPin}" — roles may only bind ` +
    'digital (Dn) or analog (An) pins',
  );
}

export function renderPinsH(roles: Role[], fqbn: string): string {
  const sorted = [...roles].sort((a, b) => a.role.localeCompare(b.role));

  const defines = sorted.map((r) =>
    `#define ${r.role} ${arduinoToken(r.mcuPin, fqbn)}  // ${r.mode} — ${r.ref}.${r.pin}`);

  const modes = sorted
    .filter((r) => r.mode === 'INPUT' || r.mode === 'OUTPUT')
    .map((r) => `  pinMode(${r.role}, ${r.mode});`);
  const analogs = sorted.filter((r) => r.mode === 'ANALOG_IN').map((r) => r.role);

  return [
    '// pins.h — GENERATED from the circuit model. Never edit: this file is',
    '// regenerated on every netlist change. Application code references the',
    '// ROLE symbols below, never pins (D46).',
    '#pragma once',
    '#include <Arduino.h>',
    '',
    ...defines,
    '',
    'inline void setup_pins() {',
    ...modes,
    ...(analogs.length > 0
      ? [`  // ANALOG_IN roles need no pinMode: ${analogs.join(', ')}`]
      : []),
    '}',
    '',
  ].join('\n');
}
