import { describe, expect, it } from 'vitest';
import type { Finding, Rule, RuleContext } from '../src/rules/engine.js';
import { gateOpens, runRules } from '../src/rules/engine.js';
import { makeContext, netRole, profileFor } from '../src/rules/context.js';
import type { Board } from '../src/board.js';
import type { Circuit } from '../src/model.js';

const board: Board = { id: 't', grid: { pitch: 7.2, holes: {} }, buses: [] };
const circuit: Circuit = { boardId: 't', parts: [], wires: [], intent: [] };

function ctx(over: Partial<RuleContext> = {}): RuleContext {
  return { ...makeContext(board, circuit, [], [], new Map(), new Map()), ...over };
}

function rule(id: string, severity: Finding['severity'], n = 1): Rule {
  return {
    id,
    severity,
    check: () =>
      Array.from({ length: n }, (_, i) => ({
        ruleId: id,
        severity,
        message: `${id} fired ${i}`,
        affected: {},
      })),
  };
}

describe('runRules', () => {
  it('collects findings from every rule', () => {
    const out = runRules([rule('a', 'NOTE'), rule('b', 'WARNING')], ctx());
    expect(out.map((f) => f.ruleId).sort()).toEqual(['a', 'b']);
  });

  it('sorts most severe first', () => {
    const out = runRules(
      [rule('note', 'NOTE'), rule('refuse', 'REFUSE'), rule('block', 'BLOCKER')],
      ctx(),
    );
    expect(out.map((f) => f.severity)).toEqual(['REFUSE', 'BLOCKER', 'NOTE']);
  });

  it('returns an empty list when nothing fires', () => {
    expect(runRules([{ id: 'quiet', severity: 'NOTE', check: () => [] }], ctx()))
      .toEqual([]);
  });

  it('keeps multiple findings from one rule', () => {
    expect(runRules([rule('multi', 'WARNING', 3)], ctx())).toHaveLength(3);
  });
});

describe('gateOpens', () => {
  it('opens when there is nothing to block', () => {
    expect(gateOpens([])).toBe(true);
  });

  it('opens on warnings and notes alone', () => {
    expect(gateOpens(runRules([rule('w', 'WARNING'), rule('n', 'NOTE')], ctx())))
      .toBe(true);
  });

  it('stays shut on a BLOCKER', () => {
    expect(gateOpens(runRules([rule('b', 'BLOCKER')], ctx()))).toBe(false);
  });

  it('stays shut on a REFUSE', () => {
    expect(gateOpens(runRules([rule('r', 'REFUSE')], ctx()))).toBe(false);
  });
});

describe('netRole', () => {
  const defs = new Map([
    ['uno', { id: 'uno', title: 'Uno', family: 'mcu', properties: {},
      pins: [
        { id: 'c0', name: 'GND', role: 'gnd' as const },
        { id: 'c1', name: '5V', role: 'supply' as const },
        { id: 'c2', name: 'D13', role: 'io' as const },
      ],
      buses: [], views: {} }],
  ]);
  const c: Circuit = {
    boardId: 't',
    parts: [{ ref: 'U1', defId: 'uno' }],
    wires: [],
    intent: [],
  };

  it('calls a net carrying a gnd pin ground', () => {
    const k = makeContext(board, c, [], [], defs, new Map());
    expect(netRole(k, { id: 'n', holes: [], pins: [{ ref: 'U1', pin: 'GND' }] }))
      .toBe('gnd');
  });

  it('calls a net carrying a supply pin supply', () => {
    const k = makeContext(board, c, [], [], defs, new Map());
    expect(netRole(k, { id: 'n', holes: [], pins: [{ ref: 'U1', pin: '5V' }] }))
      .toBe('supply');
  });

  it('prefers ground when a net carries both', () => {
    const k = makeContext(board, c, [], [], defs, new Map());
    expect(
      netRole(k, {
        id: 'n', holes: [],
        pins: [{ ref: 'U1', pin: '5V' }, { ref: 'U1', pin: 'GND' }],
      }),
    ).toBe('gnd');
  });

  it('calls everything else signal', () => {
    const k = makeContext(board, c, [], [], defs, new Map());
    expect(netRole(k, { id: 'n', holes: [], pins: [{ ref: 'U1', pin: 'D13' }] }))
      .toBe('signal');
  });
});

describe('profileFor', () => {
  it('returns undefined for an unknown ref', () => {
    expect(profileFor(ctx(), 'nope')).toBeUndefined();
  });
});
