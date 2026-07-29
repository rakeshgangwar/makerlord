import { describe, expect, it } from 'vitest';
import { expandArchitecture } from '../src/architecture/expand.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { projectWith } from './fixtures.js';

const supply: Block = {
  id: 'supply', name: 'power',
  sourcing: { type: 'buy', partId: 'aa-2x' },
  interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 3 }],
};

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes', voltageV: 3 }],
};

const link: BlockLink = {
  from: { blockId: 'supply', interfaceId: 'out' },
  to: { blockId: 'mcu', interfaceId: 'vin' },
};

describe('expandArchitecture', () => {
  it('turns a buy block into exactly one part instance', () => {
    const c = expandArchitecture(projectWith([], [supply], []));
    expect(c.parts).toHaveLength(1);
    expect(c.parts[0]!.defId).toBe('aa-2x');
  });

  it('retains the block id on the part — D27 needs it for sheets', () => {
    const c = expandArchitecture(projectWith([], [supply], []));
    expect(c.parts[0]!.blockId).toBe('supply');
  });

  it('turns a build block into one part per listed part', () => {
    const divider: Block = {
      id: 'divider', name: 'divider',
      sourcing: { type: 'build', partIds: ['res', 'res'] },
      interfaces: [],
    };
    const c = expandArchitecture(projectWith([], [divider], []));
    expect(c.parts).toHaveLength(2);
    expect(c.parts.every((p) => p.blockId === 'divider')).toBe(true);
  });

  it('gives every part a unique ref', () => {
    const divider: Block = {
      id: 'divider', name: 'divider',
      sourcing: { type: 'build', partIds: ['res', 'res'] },
      interfaces: [],
    };
    const c = expandArchitecture(projectWith([], [divider], []));
    const refs = c.parts.map((p) => p.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('turns a block link into an intent net', () => {
    const c = expandArchitecture(projectWith([], [supply, mcu], [link]));
    expect(c.intent).toHaveLength(1);
    expect(c.intent[0]!.members).toHaveLength(2);
  });

  it('leaves parts unplaced — placement is the prototype stage', () => {
    const c = expandArchitecture(projectWith([], [supply], []));
    expect(c.parts[0]!.placement).toBeUndefined();
  });

  it('REFUSES an undecided block', () => {
    const undecided: Block = {
      id: 'x', name: 'x', sourcing: { type: 'undecided' }, interfaces: [],
    };
    expect(() => expandArchitecture(projectWith([], [undecided], []))).toThrow(
      /undecided/i,
    );
  });

  it('refuses a link naming a block that does not exist', () => {
    const dangling: BlockLink = {
      from: { blockId: 'ghost', interfaceId: 'out' },
      to: { blockId: 'mcu', interfaceId: 'vin' },
    };
    expect(() =>
      expandArchitecture(projectWith([], [mcu], [dangling])),
    ).toThrow(/ghost/);
  });
});
