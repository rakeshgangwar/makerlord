import { describe, expect, it } from 'vitest';
import { railShortRule } from '../src/rules/rail-short.js';
import { fixtureContext, net } from './fixtures.js';

const uno = { ref: 'U1', defId: 'uno' };

describe('railShortRule', () => {
  it('fires when ground and supply share a node', () => {
    const ctx = fixtureContext({
      parts: [uno],
      nets: [net('n1', [{ ref: 'U1', pin: 'GND' }, { ref: 'U1', pin: '5V' }])],
    });
    const found = railShortRule.check(ctx);
    expect(found).toHaveLength(1);
    expect(found[0]!.ruleId).toBe('RULE_SUPPLY_RAIL_SHORT');
    expect(found[0]!.severity).toBe('BLOCKER');
  });

  it('names the offending net', () => {
    const ctx = fixtureContext({
      parts: [uno],
      nets: [net('rail', [{ ref: 'U1', pin: 'GND' }, { ref: 'U1', pin: '5V' }])],
    });
    expect(railShortRule.check(ctx)[0]!.affected.nets).toEqual(['rail']);
  });

  it('stays quiet when the rails are separate', () => {
    const ctx = fixtureContext({
      parts: [uno],
      nets: [
        net('gnd', [{ ref: 'U1', pin: 'GND' }]),
        net('vcc', [{ ref: 'U1', pin: '5V' }]),
      ],
    });
    expect(railShortRule.check(ctx)).toEqual([]);
  });

  it('stays quiet on a signal net', () => {
    const ctx = fixtureContext({
      parts: [uno],
      nets: [net('sig', [{ ref: 'U1', pin: 'D13' }])],
    });
    expect(railShortRule.check(ctx)).toEqual([]);
  });

  it('fires once per shorted net', () => {
    const ctx = fixtureContext({
      parts: [uno],
      nets: [
        net('a', [{ ref: 'U1', pin: 'GND' }, { ref: 'U1', pin: '5V' }]),
        net('b', [{ ref: 'U1', pin: 'GND' }, { ref: 'U1', pin: '3V3' }]),
      ],
    });
    expect(railShortRule.check(ctx)).toHaveLength(2);
  });

  it('offers a fix that mentions checking continuity', () => {
    const ctx = fixtureContext({
      parts: [uno],
      nets: [net('n', [{ ref: 'U1', pin: 'GND' }, { ref: 'U1', pin: '5V' }])],
    });
    expect(railShortRule.check(ctx)[0]!.suggestedFix).toMatch(/continuity/i);
  });
});
