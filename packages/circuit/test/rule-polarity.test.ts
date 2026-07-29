import { describe, expect, it } from 'vitest';
import { polarityRule } from '../src/rules/polarity.js';
import { fixtureContext, net } from './fixtures.js';

const parts = [{ ref: 'U1', defId: 'uno' }, { ref: 'LED1', defId: 'led' }];

describe('polarityRule', () => {
  it('fires when anode is on ground and cathode on supply', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'anode' }]),
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    const f = polarityRule.check(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('RULE_POLARIZED_PART_REVERSED');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('stays quiet when oriented correctly', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'LED1', pin: 'anode' }]),
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    expect(polarityRule.check(ctx)).toEqual([]);
  });

  it('stays quiet when neither lead touches a rail', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('s1', [{ ref: 'LED1', pin: 'anode' }]),
        net('s2', [{ ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    expect(polarityRule.check(ctx)).toEqual([]);
  });

  it('ignores non-polarized parts', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'U1', defId: 'uno' }, { ref: 'R1', defId: 'res' }],
      nets: [
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'R1', pin: '0' }]),
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'R1', pin: '1' }]),
      ],
    });
    expect(polarityRule.check(ctx)).toEqual([]);
  });

  it('names the reversed part and tells the maker to flip it', () => {
    const ctx = fixtureContext({
      parts,
      nets: [
        net('g', [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'anode' }]),
        net('v', [{ ref: 'U1', pin: '5V' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
    });
    const f = polarityRule.check(ctx)[0]!;
    expect(f.affected.parts).toEqual(['LED1']);
    expect(f.suggestedFix).toMatch(/turn it around|flip/i);
  });
});
