import { describe, expect, it } from 'vitest';
import { listCorePartFiles, loadCorpus, loadPart } from '../src/corpus.js';

// These run against the vendored corpus. They are the golden-file baseline:
// a regression here means an upstream refresh broke the ETL.
describe('corpus', () => {
  it('finds at least the 1794 known core parts', () => {
    expect(listCorePartFiles().length).toBeGreaterThanOrEqual(1794);
  });

  it('parses every core part with zero failures', () => {
    const { parts, failures } = loadCorpus();
    expect(failures).toEqual([]);
    expect(parts.length).toBeGreaterThanOrEqual(1794);
  });

  it('gives every part a non-empty id', () => {
    const { parts } = loadCorpus();
    expect(parts.filter((p) => p.id.length === 0)).toEqual([]);
  });

  it('loads the half breadboard with its 420 holes and 68 buses', () => {
    const bb = loadPart('core/halfBreadboard.fzp');
    expect(bb.pins).toHaveLength(420);
    expect(bb.buses).toHaveLength(68);
  });

  it('models breadboard column groups as five-member buses', () => {
    const bb = loadPart('core/halfBreadboard.fzp');
    const col = bb.buses.find((b) => b.id === 'bus0-4');
    expect(col?.members).toEqual(['A98', 'B98', 'C98', 'D98', 'E98']);
  });

  it('models power rails as long buses that are NOT contiguous', () => {
    const bb = loadPart('core/halfBreadboard.fzp');
    const rail = bb.buses.find((b) => b.id === 'busX-2');
    expect(rail!.members.length).toBe(25);
    // X6 is absent — never infer topology from hole names.
    expect(rail!.members).not.toContain('X6');
  });

  it('reads LED polarity from connector names', () => {
    const led = loadPart('core/LED-generic-5mm.fzp');
    expect(led.pins.map((p) => p.name).sort()).toEqual(['anode', 'cathode']);
  });
});
