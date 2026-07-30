import { describe, expect, it } from 'vitest';
import { emptyProject } from '../src/model.js';
import { parseDebug, parseObservation } from '../src/debug/schema.js';

/**
 * The debug facet (spec §2): candidates and prunes are ENGINE output —
 * the only agent-authored text is the symptom's detail. A candidate dies
 * only by contradiction; the schema has no field for a manual verdict.
 */
describe('the debug facet', () => {
  it('round-trips a session mid-search', () => {
    const d = parseDebug({
      symptom: { kind: 'element_dead', ref: 'LED1' },
      candidates: [
        { id: 'open-n1', fault: { kind: 'open_joint', net: 'n1' },
          status: 'live',
          signature: { netVoltages: { n1: 0 }, provenance: 'computed' } },
        { id: 'no-fault', fault: { kind: 'no_fault' }, status: 'contradicted',
          signature: { netVoltages: { n1: 4.7 }, provenance: 'computed' },
          contradictedBy: 'obs-1' },
      ],
      observations: [
        { id: 'obs-1', kind: 'voltage', net: 'n1', value: 0.02, unit: 'V' },
      ],
      proposed: { net: 'n2', why: 'separates open-n1 from reversed-LED1' },
      status: 'open',
    });
    expect(d.candidates[0]!.status).toBe('live');
    expect(d.candidates[1]!.contradictedBy).toBe('obs-1');
  });

  it('rejects an unknown symptom kind and an unknown fault kind', () => {
    expect(() => parseDebug({
      symptom: { kind: 'vibes_off' }, candidates: [], observations: [], status: 'open',
    })).toThrow();
    expect(() => parseDebug({
      symptom: { kind: 'board_dead' },
      candidates: [{ id: 'x', fault: { kind: 'gremlins' }, status: 'live',
        signature: { netVoltages: {}, provenance: 'computed' } }],
      observations: [], status: 'open',
    })).toThrow();
  });

  it('observations are typed: voltage needs a net and unit, selftest a role', () => {
    expect(parseObservation({
      id: 'o1', kind: 'voltage', net: 'n1', value: 3.3, unit: 'V',
    }).kind).toBe('voltage');
    expect(parseObservation({
      id: 'o2', kind: 'selftest', role: 'STATUS_LED', ok: false,
    }).kind).toBe('selftest');
    expect(() => parseObservation({ id: 'o3', kind: 'voltage', value: 1 })).toThrow();
  });

  it('the facet is optional on a project', () => {
    expect(emptyProject('a lamp').debug).toBeUndefined();
  });
});
