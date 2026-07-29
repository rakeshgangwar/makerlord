import { describe, expect, it } from 'vitest';
import {
  powerBudgetRule, requirementUnsatisfiedRule,
} from '../src/architecture/rules.js';
import type { Block } from '../src/architecture/types.js';
import { ctx, projectWith, req } from './fixtures.js';

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [],
  power: { activeMa: 80, sleepMa: 0.01 },
};

const battery: Block = {
  id: 'supply', name: 'power',
  sourcing: { type: 'buy', partId: 'aa-2x' },
  interfaces: [
    { id: 'out', kind: 'power', direction: 'provides', voltageV: 3, currentMa: 200 },
  ],
  power: { activeMa: 0, sleepMa: 0 },
};

const timing = [
  req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
  req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
];
const capacity = req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' });

describe('powerBudgetRule', () => {
  it('passes when the supply covers the average draw', () => {
    expect(
      powerBudgetRule.check(ctx(projectWith(timing, [mcu, battery]))),
    ).toEqual([]);
  });

  it('blocks when average draw exceeds what the supply provides', () => {
    const hungry: Block = { ...mcu, power: { activeMa: 500, sleepMa: 400 } };
    const always = [
      req({ id: 'si', metric: 'sample_interval', value: 1, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 1, unit: 's' }),
    ];
    const f = powerBudgetRule.check(ctx(projectWith(always, [hungry, battery])));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_POWER_BUDGET_EXCEEDED');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('degrades to WARNING when an input was assumed', () => {
    // No sleepMa declared and no curated profile value -> assumed default.
    const vague: Block = {
      id: 'mystery', name: 'mystery',
      sourcing: { type: 'buy', partId: 'not-curated' },
      interfaces: [],
    };
    const always = [
      req({ id: 'si', metric: 'sample_interval', value: 1, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 1, unit: 's' }),
    ];
    const tiny: Block = {
      ...battery,
      interfaces: [
        { id: 'out', kind: 'power', direction: 'provides', voltageV: 3, currentMa: 1 },
      ],
    };
    const f = powerBudgetRule.check(ctx(projectWith(always, [vague, tiny])));
    expect(f[0]!.severity).toBe('WARNING');
    expect(f[0]!.message).toMatch(/assumed/i);
  });

  it('stays quiet when no block provides a current budget', () => {
    const noBudget: Block = {
      ...battery,
      interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 3 }],
    };
    expect(
      powerBudgetRule.check(ctx(projectWith(timing, [mcu, noBudget]))),
    ).toEqual([]);
  });
});

describe('requirementUnsatisfiedRule', () => {
  it('passes the spec worked case — hourly sampling meets 6 months', () => {
    const runtime = req({
      id: 'rt', metric: 'battery_runtime', comparator: '>=',
      value: 6, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
    });
    expect(
      requirementUnsatisfiedRule.check(
        ctx(projectWith([...timing, capacity, runtime], [mcu, battery])),
      ),
    ).toEqual([]);
  });

  it('blocks the spec failing case — per-minute sampling misses 6 months', () => {
    const perMinute = [
      req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
    ];
    const runtime = req({
      id: 'rt', metric: 'battery_runtime', comparator: '>=',
      value: 6, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
    });
    const f = requirementUnsatisfiedRule.check(
      ctx(projectWith([...perMinute, capacity, runtime], [mcu, battery])),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_REQUIREMENT_UNSATISFIED');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('shows the arithmetic in the message', () => {
    const perMinute = [
      req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
    ];
    const runtime = req({
      id: 'rt', metric: 'battery_runtime', comparator: '>=',
      value: 6, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
    });
    const f = requirementUnsatisfiedRule.check(
      ctx(projectWith([...perMinute, capacity, runtime], [mcu, battery])),
    );
    expect(f[0]!.message).toMatch(/2800/);
    expect(f[0]!.message).toMatch(/mAh|mA/);
  });

  it('ignores requirements with no evaluator', () => {
    const colour = req({
      id: 'c', metric: 'enclosure_colour', value: 1, unit: 'enum',
      consumedBy: ['TEST_PLAN'],
    });
    expect(
      requirementUnsatisfiedRule.check(
        ctx(projectWith([...timing, capacity, colour], [mcu, battery])),
      ),
    ).toEqual([]);
  });

  it('degrades to WARNING when the computation rests on an assumption', () => {
    const runtime = req({
      id: 'rt', metric: 'battery_runtime', comparator: '>=',
      value: 600, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
    });
    // No timing requirements -> duty cycle is assumed always-on.
    const f = requirementUnsatisfiedRule.check(
      ctx(projectWith([capacity, runtime], [mcu, battery])),
    );
    expect(f[0]!.severity).toBe('WARNING');
    expect(f[0]!.message).toMatch(/assumed/i);
  });
});
