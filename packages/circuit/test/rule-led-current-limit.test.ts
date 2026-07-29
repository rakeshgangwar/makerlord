import { describe, expect, it } from 'vitest';
import { ledCurrentLimitRule } from '../src/rules/led-current-limit.js';
import { fixtureContext, net } from './fixtures.js';

const parts = [
  { ref: 'U1', defId: 'uno' },
  { ref: 'LED1', defId: 'led' },
  { ref: 'R1', defId: 'res' },
];

describe('ledCurrentLimitRule', () => {
  it('fires when the LED sits directly between a pin and ground', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('a', [{ ref: 'U1', pin: 'D13' }, { ref: 'LED1', pin: 'anode' }]),
        net('b', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    const found = ledCurrentLimitRule.check(ctx);
    expect(found).toHaveLength(1);
    expect(found[0]!.ruleId).toBe('RULE_LED_NO_CURRENT_LIMIT');
    expect(found[0]!.severity).toBe('BLOCKER');
  });

  it('stays quiet when a resistor shares one of the LED nets', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('a', [{ ref: 'U1', pin: 'D13' }, { ref: 'R1', pin: '0' }]),
        net('b', [{ ref: 'R1', pin: '1' }, { ref: 'LED1', pin: 'anode' }]),
        net('c', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    expect(ledCurrentLimitRule.check(ctx)).toEqual([]);
  });

  it('names the LED it is complaining about', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('a', [{ ref: 'LED1', pin: 'anode' }]),
        net('b', [{ ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    expect(ledCurrentLimitRule.check(ctx)[0]!.affected.parts).toEqual(['LED1']);
  });

  it('suggests a concrete resistor value', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('a', [{ ref: 'LED1', pin: 'anode' }]),
        net('b', [{ ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    expect(ledCurrentLimitRule.check(ctx)[0]!.suggestedFix).toMatch(/\d+\s*Ω/);
  });

  it('ignores parts that are not LEDs', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'R1', defId: 'res' }],
      nets: [net('a', [{ ref: 'R1', pin: '0' }])],
    });
    expect(ledCurrentLimitRule.check(ctx)).toEqual([]);
  });

  it('ignores an LED that is not placed on any net', () => {
    const ctx = fixtureContext({ parts, nets: [] });
    expect(ledCurrentLimitRule.check(ctx)).toEqual([]);
  });

  it('fires once per unprotected LED', () => {
    const ctx = fixtureContext({
      parts: [...parts, { ref: 'LED2', defId: 'led' }],
      nets: [
        net('a', [{ ref: 'LED1', pin: 'anode' }]),
        net('b', [{ ref: 'LED2', pin: 'anode' }]),
      ],
    });
    expect(ledCurrentLimitRule.check(ctx)).toHaveLength(2);
  });
});
