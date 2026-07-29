import { describe, expect, it } from 'vitest';
import { EVALUATORS, evaluateMetric } from '../src/architecture/evaluators.js';
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
  interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 3.0 }],
  power: { activeMa: 0 },
};

function hourly() {
  return ctx(
    projectWith(
      [
        req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
        req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
        req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
      ],
      [mcu, battery],
    ),
  );
}

describe('EVALUATORS', () => {
  it('registers battery_runtime', () => {
    expect(EVALUATORS.has('battery_runtime')).toBe(true);
  });

  it('does not register an arbitrary metric', () => {
    expect(EVALUATORS.has('enclosure_colour')).toBe(false);
  });
});

describe('evaluateMetric', () => {
  it('returns null for an unregistered metric — not computable', () => {
    expect(evaluateMetric(hourly(), 'enclosure_colour')).toBeNull();
  });

  it('computes the spec worked case: hourly sampling lasts years', () => {
    const r = evaluateMetric(hourly(), 'battery_runtime')!;
    expect(r.unit).toBe('months');
    expect(r.value).toBeGreaterThan(36);      // ≈3.4 years
  });

  it('computes the failing case: per-minute sampling lasts weeks', () => {
    const perMinute = ctx(
      projectWith(
        [
          req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
          req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
          req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
        ],
        [mcu, battery],
      ),
    );
    const r = evaluateMetric(perMinute, 'battery_runtime')!;
    expect(r.value).toBeLessThan(2);          // ≈29 days
  });

  it('shows its workings so a finding can quote the arithmetic', () => {
    const r = evaluateMetric(hourly(), 'battery_runtime')!;
    expect(r.workings).toMatch(/mA/);
    expect(r.workings).toMatch(/2800/);
  });

  it('returns null when capacity is unknown', () => {
    const noCapacity = ctx(projectWith([], [mcu]));
    expect(evaluateMetric(noCapacity, 'battery_runtime')).toBeNull();
  });
});
