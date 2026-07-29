import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES, UNIVERSAL_SLOTS, slotsFor, suggestArchetype,
} from '../src/requirements/archetypes.js';

describe('UNIVERSAL_SLOTS', () => {
  it('covers the four always-asked categories', () => {
    const cats = new Set(UNIVERSAL_SLOTS.map((s) => s.category));
    expect(cats).toContain('power');
    expect(cats).toContain('environment');
    expect(cats).toContain('interface');
    expect(cats).toContain('physical');
  });

  it('gives every slot a consumer — no orphans by construction', () => {
    for (const s of UNIVERSAL_SLOTS) {
      expect(s.consumedBy.length).toBeGreaterThan(0);
    }
  });

  it('gives every slot a unit and a prompt', () => {
    for (const s of UNIVERSAL_SLOTS) {
      expect(s.unit.length).toBeGreaterThan(0);
      expect(s.prompt.length).toBeGreaterThan(0);
    }
  });
});

describe('ARCHETYPES', () => {
  it('ships eight archetypes', () => {
    expect(ARCHETYPES).toHaveLength(8);
  });

  it('has unique ids', () => {
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives the sensor node a sample interval, which the power budget reads', () => {
    const sensor = ARCHETYPES.find((a) => a.id === 'sensor-node')!;
    const slot = sensor.slots.find((s) => s.metric === 'sample_interval')!;
    expect(slot.consumedBy).toContain('CHECK_POWER_BUDGET');
  });
});

describe('suggestArchetype', () => {
  it('matches a soil sensor to the sensor node', () => {
    expect(suggestArchetype('a soil moisture sensor for Home Assistant')?.id)
      .toBe('sensor-node');
  });

  it('matches a robot to the robot archetype', () => {
    expect(suggestArchetype('a small robot that follows a line')?.id).toBe('robot');
  });

  it('returns undefined for something unmatched — hints, not gates', () => {
    expect(suggestArchetype('a device for reticulating splines')).toBeUndefined();
  });
});

describe('slotsFor', () => {
  it('returns the universal core when no archetype matches', () => {
    expect(slotsFor(undefined)).toEqual([...UNIVERSAL_SLOTS]);
  });

  it('appends archetype slots to the universal core', () => {
    const slots = slotsFor('sensor-node');
    expect(slots.length).toBeGreaterThan(UNIVERSAL_SLOTS.length);
    expect(slots.some((s) => s.metric === 'sample_interval')).toBe(true);
  });

  it('never returns duplicate metrics', () => {
    const metrics = slotsFor('sensor-node').map((s) => s.metric);
    expect(new Set(metrics).size).toBe(metrics.length);
  });
});
