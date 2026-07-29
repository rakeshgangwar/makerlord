import { describe, expect, it } from 'vitest';
import { pinCurrentRule } from '../src/rules/pin-current.js';
import { fixtureContext, net, LED_PROFILE, UNO_PROFILE, LED, UNO, RESISTOR, RESISTOR_PROFILE } from './fixtures.js';

const parts = [
  { ref: 'U1', defId: 'uno' },
  { ref: 'LED1', defId: 'led' },
  { ref: 'LED2', defId: 'led' },
];

describe('pinCurrentRule', () => {
  it('stays quiet for a single 20 mA LED on a 20 mA pin', () => {
    const ctx = fixtureContext({
      parts,
      nets: [net('a', [{ ref: 'U1', pin: 'D13' }, { ref: 'LED1', pin: 'anode' }])],
    });
    expect(pinCurrentRule.check(ctx)).toEqual([]);
  });

  it('fires when two LEDs share one pin', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('a', [
          { ref: 'U1', pin: 'D13' },
          { ref: 'LED1', pin: 'anode' },
          { ref: 'LED2', pin: 'anode' },
        ]),
      ],
    });
    const f = pinCurrentRule.check(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('RULE_PIN_CURRENT_EXCEEDED');
    expect(f[0]!.message).toMatch(/40 mA/);
  });

  it('fires on aggregate port current even when each pin is legal', () => {
    // Six pins at 20 mA each = 120 mA, over the 100 mA port budget.
    const leds = Array.from({ length: 6 }, (_, i) => ({
      ref: `L${i}`,
      defId: 'led',
    }));
    const ioPins = ['D13', 'D9', 'D13', 'D9', 'D13', 'D9'];
    const ctx = fixtureContext({
      parts: [{ ref: 'U1', defId: 'uno' }, ...leds],
      defs: [['uno', UNO], ['led', LED], ['res', RESISTOR]],
      profiles: [['uno', UNO_PROFILE], ['led', LED_PROFILE], ['res', RESISTOR_PROFILE]],
      nets: leds.map((l, i) =>
        net(`n${i}`, [{ ref: 'U1', pin: ioPins[i]! }, { ref: l.ref, pin: 'anode' }]),
      ),
    });
    const f = pinCurrentRule.check(ctx);
    expect(f.some((x) => x.message.match(/total/i))).toBe(true);
  });

  it('ignores loads on supply and ground pins', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('v', [
          { ref: 'U1', pin: '5V' },
          { ref: 'LED1', pin: 'anode' },
          { ref: 'LED2', pin: 'anode' },
        ]),
      ],
    });
    expect(pinCurrentRule.check(ctx)).toEqual([]);
  });

  it('ignores parts with no declared current draw', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'U1', defId: 'uno' }, { ref: 'R1', defId: 'res' }],
      nets: [net('a', [{ ref: 'U1', pin: 'D13' }, { ref: 'R1', pin: '0' }])],
    });
    expect(pinCurrentRule.check(ctx)).toEqual([]);
  });

  it('states the limit it exceeded', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('a', [
          { ref: 'U1', pin: 'D13' },
          { ref: 'LED1', pin: 'anode' },
          { ref: 'LED2', pin: 'anode' },
        ]),
      ],
    });
    expect(pinCurrentRule.check(ctx)[0]!.message).toMatch(/20 mA/);
  });
});
