import { describe, expect, it } from 'vitest';
import { emptyProject } from '../src/model.js';

describe('emptyProject', () => {
  it('records the intent verbatim', () => {
    const p = emptyProject('a soil sensor for Home Assistant');
    expect(p.intent).toBe('a soil sensor for Home Assistant');
  });

  it('starts with empty collections, not undefined', () => {
    const p = emptyProject('x');
    expect(p.inventory).toEqual([]);
    expect(p.requirements).toEqual([]);
    expect(p.architecture.blocks).toEqual([]);
    expect(p.architecture.links).toEqual([]);
  });

  it('leaves feasibility and circuit absent until produced', () => {
    const p = emptyProject('x');
    expect(p.feasibility).toBeUndefined();
    expect(p.circuit).toBeUndefined();
  });

  it('rejects an empty intent', () => {
    expect(() => emptyProject('   ')).toThrow(/intent/);
  });
});
