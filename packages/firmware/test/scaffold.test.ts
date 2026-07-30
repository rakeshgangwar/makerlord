import { describe, expect, it } from 'vitest';
import type { Firmware } from '@makerlord/project';
import {
  extractApplicationRegion, mergeApplicationRegion, renderMainCpp,
} from '../src/scaffold.js';

/**
 * The scaffold is engine-owned; ONLY the marked region is the agent's.
 * Behavior templates are deterministic codegen from the closed set —
 * golden-file tested, no LLM anywhere near them.
 */

const FW: Firmware = {
  target: { ref: 'U1' },
  behaviors: [
    { id: 'read-soil', kind: 'sample', role: 'MOISTURE_SENSE', everyMs: 60000 },
    { id: 'alert', kind: 'threshold', watch: 'read-soil', above: 700,
      drive: 'STATUS_LED', to: 'HIGH' },
    { id: 'report', kind: 'serial_log', watch: 'read-soil' },
    { id: 'heater-off', kind: 'drive', role: 'HEATER', to: 'LOW' },
  ],
  roles: [
    { role: 'MOISTURE_SENSE', ref: 'SENS1', pin: 'AOUT', mcuPin: 'A0', mode: 'ANALOG_IN' },
    { role: 'STATUS_LED', ref: 'LED1', pin: 'anode', mcuPin: 'D5', mode: 'OUTPUT' },
    { role: 'HEATER', ref: 'R1', pin: 'a', mcuPin: 'D8', mode: 'OUTPUT' },
  ],
};

describe('renderMainCpp — the golden scaffold', () => {
  const out = renderMainCpp(FW);

  it('renders the exact scaffold for the soil fixture', () => {
    expect(out).toBe(`\
// main.cpp — engine scaffold; regenerated with the model. ONLY the
// marked application region below is yours to edit.
#include <Arduino.h>
#include "pins.h"

// sample state — behavior "read-soil"
unsigned long last_read_soil = 0;
int value_read_soil = 0;

void setup() {
  Serial.begin(115200);
  setup_pins();
  Serial.println("SELFTEST role=HEATER mode=OUTPUT ok");
  Serial.println("SELFTEST role=MOISTURE_SENSE mode=ANALOG_IN ok");
  Serial.println("SELFTEST role=STATUS_LED mode=OUTPUT ok");
  digitalWrite(HEATER, LOW);  // behavior "heater-off"
}

void loop() {
  // behavior "read-soil": sample MOISTURE_SENSE every 60000 ms
  if (millis() - last_read_soil >= 60000) {
    last_read_soil = millis();
    value_read_soil = analogRead(MOISTURE_SENSE);
    // behavior "alert": STATUS_LED HIGH when above 700
    digitalWrite(STATUS_LED, (value_read_soil > 700) ? HIGH : LOW);
    // behavior "report"
    Serial.print("LOG read-soil=");
    Serial.println(value_read_soil);
  }

  // ── application logic (agent-authored) ──
  // ── end application logic ──
}
`);
  });

  it('a digital sample uses digitalRead', () => {
    const digital = renderMainCpp({
      target: { ref: 'U1' },
      behaviors: [{ id: 'poll', kind: 'sample', role: 'DOOR', everyMs: 50 }],
      roles: [{ role: 'DOOR', ref: 'SW1', pin: 'o', mcuPin: 'D3', mode: 'INPUT' }],
    });
    expect(digital).toContain('value_poll = digitalRead(DOOR);');
  });

  it('a below-threshold renders the inverted comparison', () => {
    const below = renderMainCpp({
      target: { ref: 'U1' },
      behaviors: [
        { id: 's', kind: 'sample', role: 'LIGHT', everyMs: 1000 },
        { id: 'lamp', kind: 'threshold', watch: 's', below: 300, drive: 'LAMP', to: 'HIGH' },
      ],
      roles: [
        { role: 'LIGHT', ref: 'L1', pin: 'o', mcuPin: 'A0', mode: 'ANALOG_IN' },
        { role: 'LAMP', ref: 'D1', pin: 'a', mcuPin: 'D5', mode: 'OUTPUT' },
      ],
    });
    expect(below).toContain('digitalWrite(LAMP, (value_s < 300) ? HIGH : LOW);');
  });

  it('a threshold watching a non-sample behavior is a clean error', () => {
    expect(() => renderMainCpp({
      target: { ref: 'U1' },
      behaviors: [
        { id: 'x', kind: 'drive', role: 'LAMP', to: 'HIGH' },
        { id: 't', kind: 'threshold', watch: 'x', above: 1, drive: 'LAMP', to: 'HIGH' },
      ],
      roles: [{ role: 'LAMP', ref: 'D1', pin: 'a', mcuPin: 'D5', mode: 'OUTPUT' }],
    })).toThrow(/watch/i);
  });
});

describe('the application region — extraction and merge', () => {
  it('round-trips agent code through a regeneration', () => {
    const scaffold = renderMainCpp(FW);
    const edited = mergeApplicationRegion(scaffold,
      '  // my extra logic\n  Serial.println("hi");');
    expect(edited).toContain('my extra logic');

    // The model changes; the scaffold regenerates; the region survives.
    const regenerated = mergeApplicationRegion(
      renderMainCpp(FW), extractApplicationRegion(edited));
    expect(regenerated).toContain('my extra logic');
    expect(regenerated).toContain('SELFTEST role=STATUS_LED');
  });

  it('missing or duplicated markers are an error, never silent loss', () => {
    expect(() => extractApplicationRegion('int x;')).toThrow(/marker/i);
    const twice = renderMainCpp(FW) + renderMainCpp(FW);
    expect(() => extractApplicationRegion(twice)).toThrow(/marker/i);
  });
});
