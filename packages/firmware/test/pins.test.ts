import { describe, expect, it } from 'vitest';
import type { Role } from '@makerlord/project';
import { arduinoToken, renderPinsH } from '../src/pins.js';

/**
 * pins.h is a PURE projection (D2/D46): byte-identical output for the
 * same model, "never edit" stamped in the header, roles only — the one
 * place a pin name is allowed to appear.
 */

const ROLES: Role[] = [
  { role: 'MOISTURE_SENSE', ref: 'SENS1', pin: 'AOUT', mcuPin: 'A0', mode: 'ANALOG_IN' },
  { role: 'STATUS_LED', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'OUTPUT' },
  { role: 'DOOR_SWITCH', ref: 'SW1', pin: 'out', mcuPin: 'D3', mode: 'INPUT' },
];

describe('arduinoToken — corpus pin name → Arduino identifier', () => {
  it('keeps Dx macros on ESP cores and strips to numbers on AVR', () => {
    expect(arduinoToken('D5', 'esp8266:esp8266:d1_mini')).toBe('D5');
    expect(arduinoToken('D5 PWM', 'arduino:avr:uno')).toBe('5');
    expect(arduinoToken('D13/SCK', 'arduino:avr:uno')).toBe('13');
    expect(arduinoToken('A0', 'arduino:avr:uno')).toBe('A0');
    expect(arduinoToken('A4/SDA', 'arduino:avr:uno')).toBe('A4');
  });

  it('refuses a pin name it cannot map, naming it', () => {
    expect(() => arduinoToken('RST', 'esp8266:esp8266:d1_mini')).toThrow(/RST/);
  });
});

describe('renderPinsH — the golden projection', () => {
  it('renders the exact file for an ESP8266 target', () => {
    expect(renderPinsH(ROLES, 'esp8266:esp8266:d1_mini')).toBe(`\
// pins.h — GENERATED from the circuit model. Never edit: this file is
// regenerated on every netlist change. Application code references the
// ROLE symbols below, never pins (D46).
#pragma once
#include <Arduino.h>

#define DOOR_SWITCH D3  // INPUT — SW1.out
#define MOISTURE_SENSE A0  // ANALOG_IN — SENS1.AOUT
#define STATUS_LED D5  // OUTPUT — LED1.anode

inline void setup_pins() {
  pinMode(DOOR_SWITCH, INPUT);
  pinMode(STATUS_LED, OUTPUT);
  // ANALOG_IN roles need no pinMode: MOISTURE_SENSE
}
`);
  });

  it('renders AVR numeric tokens for an Uno target', () => {
    const roles: Role[] = [
      { role: 'STATUS_LED', ref: 'LED1', pin: 'anode', mcuPin: 'D5 PWM', mode: 'OUTPUT' },
    ];
    const out = renderPinsH(roles, 'arduino:avr:uno');
    expect(out).toContain('#define STATUS_LED 5  // OUTPUT — LED1.anode');
  });

  it('is deterministic: same model, byte-identical output', () => {
    const a = renderPinsH(ROLES, 'esp8266:esp8266:d1_mini');
    const b = renderPinsH([...ROLES].reverse(), 'esp8266:esp8266:d1_mini');
    expect(a).toBe(b);   // ordering comes from the model, not the caller
  });
});
