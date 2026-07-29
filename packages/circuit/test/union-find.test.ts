import { describe, expect, it } from 'vitest';
import { DisjointSet } from '../src/derive/union-find.js';

describe('DisjointSet', () => {
  it('treats an unknown element as its own root', () => {
    const d = new DisjointSet();
    d.add('a');
    expect(d.find('a')).toBe('a');
  });

  it('auto-adds elements on union', () => {
    const d = new DisjointSet();
    d.union('a', 'b');
    expect(d.find('a')).toBe(d.find('b'));
  });

  it('merges transitively', () => {
    const d = new DisjointSet();
    d.union('a', 'b');
    d.union('b', 'c');
    expect(d.find('a')).toBe(d.find('c'));
  });

  it('keeps disjoint groups apart', () => {
    const d = new DisjointSet();
    d.union('a', 'b');
    d.union('c', 'd');
    expect(d.find('a')).not.toBe(d.find('c'));
  });

  it('returns groups as sorted member lists', () => {
    const d = new DisjointSet();
    d.union('b', 'a');
    d.add('z');
    const g = d.groups().map((m) => m.sort());
    expect(g).toContainEqual(['a', 'b']);
    expect(g).toContainEqual(['z']);
  });

  it('is idempotent on repeated unions', () => {
    const d = new DisjointSet();
    d.union('a', 'b');
    d.union('a', 'b');
    expect(d.groups()).toHaveLength(1);
  });

  it('throws on find of an element never added', () => {
    expect(() => new DisjointSet().find('missing')).toThrow(/missing/);
  });
});
