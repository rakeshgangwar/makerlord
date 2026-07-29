import { describe, expect, it } from 'vitest';
import { checkRequirements } from '../src/requirements/rules.js';
import { ctx, projectWith, req } from './fixtures.js';

describe('checkRequirements', () => {
  it('passes a complete requirement', () => {
    expect(checkRequirements(ctx(projectWith([req()])))).toEqual([]);
  });

  it('blocks a requirement with no unit', () => {
    const f = checkRequirements(ctx(projectWith([req({ unit: '' })])));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('REQ_NOT_MEASURABLE');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('warns on an orphan requirement', () => {
    const f = checkRequirements(ctx(projectWith([req({ consumedBy: [] })])));
    const orphan = f.find((x) => x.ruleId === 'REQ_ORPHAN');
    expect(orphan?.severity).toBe('WARNING');
  });

  it('notes an assumed value so the maker can correct it', () => {
    const f = checkRequirements(
      ctx(projectWith([req({ provenance: 'assumed' })])),
    );
    const note = f.find((x) => x.ruleId === 'REQ_ASSUMED_UNCONFIRMED');
    expect(note?.severity).toBe('NOTE');
  });

  it('names the offending requirement', () => {
    const f = checkRequirements(
      ctx(projectWith([req({ id: 'runtime', unit: '' })])),
    );
    expect(f[0]!.message).toContain('runtime');
  });

  it('reports each requirement independently', () => {
    const f = checkRequirements(
      ctx(projectWith([req({ id: 'a', unit: '' }), req({ id: 'b', unit: '' })])),
    );
    expect(f.filter((x) => x.ruleId === 'REQ_NOT_MEASURABLE')).toHaveLength(2);
  });

  it('returns nothing for a project with no requirements yet', () => {
    expect(checkRequirements(ctx(projectWith([])))).toEqual([]);
  });
});
