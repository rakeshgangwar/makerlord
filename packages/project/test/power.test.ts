import { describe, expect, it } from 'vitest';
import {
  blockActiveMa, computePowerBudget, dutyCycle, severityForComputed,
} from '../src/architecture/power.js';
import type { Block } from '../src/architecture/types.js';
import { ctx, projectWith, req } from './fixtures.js';

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [{ id: 'p', kind: 'power', direction: 'consumes', voltageV: 3.3 }],
};

const mcuWithPower: Block = { ...mcu, power: { activeMa: 80, sleepMa: 0.01 } };

describe('blockActiveMa', () => {
  it('prefers the block power field and marks it curated', () => {
    const v = blockActiveMa(ctx(projectWith([], [mcuWithPower])), mcuWithPower);
    expect(v.value).toBe(80);
    expect(v.provenance).toBe('curated');
  });

  it('falls back to the profile quiescent current, still curated', () => {
    const v = blockActiveMa(ctx(projectWith([], [mcu])), mcu);
    expect(v.value).toBe(80);           // ESP32_PROFILE.quiescentMa
    expect(v.provenance).toBe('curated');
  });

  it('falls back to a default and marks it assumed', () => {
    const unknown: Block = {
      id: 'x', name: 'x',
      sourcing: { type: 'buy', partId: 'not-curated' },
      interfaces: [],
    };
    const v = blockActiveMa(ctx(projectWith([], [unknown])), unknown);
    expect(v.value).toBe(50);
    expect(v.provenance).toBe('assumed');
  });
});

describe('dutyCycle', () => {
  it('derives duty from sample interval and active duration', () => {
    const p = projectWith([
      req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
    ]);
    const d = dutyCycle(ctx(p));
    expect(d.value).toBeCloseTo(3 / 3600, 6);
    expect(d.provenance).toBe('curated');
  });

  it('assumes always-on when no sample interval is stated', () => {
    const d = dutyCycle(ctx(projectWith([])));
    expect(d.value).toBe(1);
    expect(d.provenance).toBe('assumed');
  });
});

describe('computePowerBudget', () => {
  it('computes the worked hourly case from the spec', () => {
    // 80 mA active for 3 s per hour, 0.01 mA asleep the rest.
    const p = projectWith(
      [
        req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
        req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
      ],
      [mcuWithPower],
    );
    const b = computePowerBudget(ctx(p));
    expect(b.averageMa).toBeCloseTo(0.077, 2);
    expect(b.anyAssumed).toBe(false);
  });

  it('computes the worked per-minute case from the spec', () => {
    const p = projectWith(
      [
        req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
        req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
      ],
      [mcuWithPower],
    );
    const b = computePowerBudget(ctx(p));
    expect(b.averageMa).toBeCloseTo(4.01, 2);
  });

  it('flags anyAssumed when duty was not stated', () => {
    const b = computePowerBudget(ctx(projectWith([], [mcuWithPower])));
    expect(b.anyAssumed).toBe(true);
  });

  it('sums across blocks', () => {
    const second: Block = { ...mcuWithPower, id: 'radio', name: 'radio' };
    const p = projectWith(
      [
        req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
        req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
      ],
      [mcuWithPower, second],
    );
    const b = computePowerBudget(ctx(p));
    expect(b.averageMa).toBeCloseTo(0.154, 2);
  });
});

describe('severityForComputed', () => {
  it('blocks when every input is curated', () => {
    expect(severityForComputed(false)).toBe('BLOCKER');
  });

  it('degrades to a warning when any input is assumed', () => {
    expect(severityForComputed(true)).toBe('WARNING');
  });
});
