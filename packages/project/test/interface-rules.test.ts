import { describe, expect, it } from 'vitest';
import {
  interfaceUnmetRule, voltageMismatchRule,
} from '../src/architecture/rules.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { ctx, projectWith } from './fixtures.js';

const supply3v3: Block = {
  id: 'supply', name: 'power',
  sourcing: { type: 'buy', partId: 'aa-2x' },
  interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 3.3 }],
};

const supply5v: Block = {
  ...supply3v3,
  interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 5 }],
};

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes', voltageV: 3.3 }],
};

const powered: BlockLink = {
  from: { blockId: 'supply', interfaceId: 'out' },
  to: { blockId: 'mcu', interfaceId: 'vin' },
};

describe('interfaceUnmetRule', () => {
  it('blocks a consumes port with no link', () => {
    const f = interfaceUnmetRule.check(ctx(projectWith([], [supply3v3, mcu], [])));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_INTERFACE_UNMET');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('passes when the port is linked', () => {
    expect(
      interfaceUnmetRule.check(ctx(projectWith([], [supply3v3, mcu], [powered]))),
    ).toEqual([]);
  });

  it('ignores unlinked provides ports — a spare output is fine', () => {
    const spare: Block = {
      id: 'psu', name: 'psu',
      sourcing: { type: 'buy', partId: 'aa-2x' },
      interfaces: [
        { id: 'a', kind: 'power', direction: 'provides', voltageV: 3.3 },
        { id: 'b', kind: 'power', direction: 'provides', voltageV: 3.3 },
      ],
    };
    const link: BlockLink = {
      from: { blockId: 'psu', interfaceId: 'a' },
      to: { blockId: 'mcu', interfaceId: 'vin' },
    };
    expect(
      interfaceUnmetRule.check(ctx(projectWith([], [spare, mcu], [link]))),
    ).toEqual([]);
  });

  it('names the block and the port', () => {
    const f = interfaceUnmetRule.check(ctx(projectWith([], [mcu], [])));
    expect(f[0]!.message).toContain('mcu');
    expect(f[0]!.message).toContain('vin');
  });
});

describe('voltageMismatchRule', () => {
  it('blocks 5 V driving a 3V3 input', () => {
    const f = voltageMismatchRule.check(
      ctx(projectWith([], [supply5v, mcu], [powered])),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_VOLTAGE_MISMATCH');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('reports both voltages so the maker can see the gap', () => {
    const f = voltageMismatchRule.check(
      ctx(projectWith([], [supply5v, mcu], [powered])),
    );
    expect(f[0]!.message).toMatch(/5/);
    expect(f[0]!.message).toMatch(/3\.3/);
  });

  it('passes on a matched rail', () => {
    expect(
      voltageMismatchRule.check(ctx(projectWith([], [supply3v3, mcu], [powered]))),
    ).toEqual([]);
  });

  it('stays quiet when either side declares no voltage', () => {
    const noVolts: Block = {
      ...mcu,
      interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes' }],
    };
    expect(
      voltageMismatchRule.check(ctx(projectWith([], [supply5v, noVolts], [powered]))),
    ).toEqual([]);
  });

  it('ignores non-power links', () => {
    const i2cA: Block = {
      id: 'supply', name: 'a',
      sourcing: { type: 'buy', partId: 'esp32' },
      interfaces: [{ id: 'out', kind: 'i2c', direction: 'provides', voltageV: 5 }],
    };
    const i2cB: Block = {
      id: 'mcu', name: 'b',
      sourcing: { type: 'buy', partId: 'esp32' },
      interfaces: [{ id: 'vin', kind: 'i2c', direction: 'consumes', voltageV: 3.3 }],
    };
    // Kind is i2c, not power — level shifting is a circuit-stage concern.
    expect(
      voltageMismatchRule.check(ctx(projectWith([], [i2cA, i2cB], [powered]))),
    ).toEqual([]);
  });
});
