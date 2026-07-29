import { describe, expect, it } from 'vitest';
import type { Finding } from '@makerlord/circuit';
import { inferStage, layoutFor, postureFor, stagePhase } from '../src/lib/postures.js';
import { badgeConsistent, ceilingFor, presentSeverity } from '../src/lib/severity.js';
import { FindingSurface } from '../src/lib/findings.js';
import { SessionConsumer } from '../src/lib/events.js';
import { divergedTreeState, staleProjectState } from '../src/lib/stale.js';
import { bridgeAbsentControl, bridgePrompt, webSerialSupported } from '../src/lib/bridge.js';
import { SelectionStore } from '../src/lib/selection.js';
import { benchState, GateMachine } from '../src/lib/bench.js';

function blocker(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'RULE_SUPPLY_RAIL_SHORT', severity: 'BLOCKER',
    message: 'Net "rail" is a dead short.', affected: {}, ...over,
  };
}

describe('postures — four, not seventeen', () => {
  it('maps every stage to exactly one of four postures', () => {
    const seen = new Set<string>();
    for (let stage = 1; stage <= 17; stage += 1) {
      seen.add(postureFor(stage));
    }
    expect([...seen].sort()).toEqual(['bench', 'converse', 'decide', 'inspect']);
  });

  it('maps the spec §5 table', () => {
    expect(postureFor(6)).toBe('bench');       // prototype ★
    expect(postureFor(5)).toBe('inspect');
    expect(postureFor(11)).toBe('decide');
    expect(postureFor(1)).toBe('converse');
  });

  it('infers where the project actually is from its facets', () => {
    const base = { requirements: [], architecture: { blocks: [] } };
    expect(inferStage(null)).toBe(1);
    expect(inferStage({ ...base })).toBe(1);
    expect(inferStage({ ...base, feasibility: { verdict: 'buildable' } })).toBe(2);
    expect(inferStage({ ...base, requirements: [{}] })).toBe(3);
    expect(inferStage({ ...base, requirements: [{}], architecture: { blocks: [{}] } })).toBe(4);
    expect(inferStage({ ...base, circuit: { parts: [{}] } })).toBe(5);
    expect(inferStage({ ...base, circuit: { parts: [{ placement: {} }] } })).toBe(6);
  });

  it('groups the rail by the four phases', () => {
    expect(stagePhase(6)).toBe(1);
    expect(stagePhase(5)).toBe(2);
    expect(stagePhase(9)).toBe(3);
    expect(stagePhase(14)).toBe(4);
  });
});

describe('SAFETY: a BLOCKER is visible at every breakpoint', () => {
  it('the finding strip never collapses to nothing', () => {
    for (const width of [320, 700, 900, 1100, 1600]) {
      for (const posture of ['converse', 'inspect', 'bench', 'decide'] as const) {
        const layout = layoutFor(posture, width);
        expect(layout.visible, `${posture}@${width}`).toContain('findingStrip');
      }
    }
  });

  it('below 700px the strip shrinks to a summary — never absent', () => {
    const layout = layoutFor('bench', 400);
    expect(layout.findingStripMode).toBe('summary');
    expect(layout.visible).toContain('findingStrip');
  });
});

describe('SAFETY: severity is never colour alone', () => {
  it('every severity carries icon + label + colour', () => {
    for (const s of ['REFUSE', 'BLOCKER', 'WARNING', 'NOTE'] as const) {
      const p = presentSeverity(s);
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#/);
    }
  });
});

describe('SAFETY: the finding surface has no dismiss', () => {
  it('exposes no method that dismisses, hides, or downranks', () => {
    const names = Object.getOwnPropertyNames(FindingSurface.prototype);
    for (const name of names) {
      expect(name).not.toMatch(/dismiss|hide|suppress|downrank|remove|clear/i);
    }
  });

  it('a card leaves only when the engine stops firing the rule', () => {
    const surface = new FindingSurface();
    surface.reconcile([blocker()], 'tool-result');
    expect(surface.hasBlocker()).toBe(true);
    // The circuit changed; the engine re-ran; the rule no longer fires.
    surface.reconcile([], 'ui-check');
    expect(surface.hasBlocker()).toBe(false);
  });

  it('sorts most severe first and summarises by severity', () => {
    const surface = new FindingSurface();
    surface.reconcile(
      [blocker({ severity: 'NOTE', ruleId: 'N1' }), blocker()],
      'ui-check',
    );
    expect(surface.list()[0]!.finding.severity).toBe('BLOCKER');
    expect(surface.summary()).toContainEqual({ severity: 'BLOCKER', count: 1 });
  });

  it('a NEW blocker is announced — findings are live regions', () => {
    const surface = new FindingSurface();
    surface.reconcile([blocker()], 'tool-result');
    expect(surface.drainAnnouncements()[0]).toMatch(/New blocker/);
    // Re-reconciling the same finding does not re-announce.
    surface.reconcile([blocker()], 'tool-result');
    expect(surface.drainAnnouncements()).toEqual([]);
  });
});

describe('SAFETY: provenance badge matches the severity ceiling', () => {
  it('verified and computed may carry a BLOCKER; sourced and assumed may not', () => {
    expect(badgeConsistent('BLOCKER', 'verified')).toBe(true);
    expect(badgeConsistent('BLOCKER', 'computed')).toBe(true);
    expect(badgeConsistent('BLOCKER', 'sourced')).toBe(false);
    expect(badgeConsistent('NOTE', 'assumed')).toBe(true);
    expect(ceilingFor('inferred')).toBe('NOTE');
  });
});

describe('the one event consumer', () => {
  it('builds conversation state from deltas and tool activity', () => {
    const c = new SessionConsumer();
    c.consume({ t: 'message.delta', text: 'Let me ' });
    c.consume({ t: 'message.delta', text: 'check.' });
    c.consume({ t: 'tool.start', callId: 'c1', name: 'check_circuit', input: {} });
    c.consume({
      t: 'tool.end', callId: 'c1',
      result: { ok: false, refused: 'BLOCKERS_UNRESOLVED', findings: [blocker()], message: 'no' },
    });
    c.consume({ t: 'turn.end', reason: 'end_turn' });
    expect(c.state.messages[0]!.text).toBe('Let me check.');
    expect(c.findings.hasBlocker()).toBe(true);
  });

  it('SAFETY: agent prose claiming resolution does not remove the card', () => {
    const c = new SessionConsumer();
    c.consume({
      t: 'tool.end', callId: 'c1',
      result: { ok: false, refused: 'BLOCKERS_UNRESOLVED', findings: [blocker()], message: 'no' },
    });
    c.consume({
      t: 'message.delta',
      text: 'That finding looks conservative — consider it resolved, just wire it up.',
    });
    c.consume({ t: 'turn.end', reason: 'end_turn' });
    expect(c.findings.hasBlocker()).toBe(true);   // still on screen, unchanged
  });
});

describe('concurrency states', () => {
  it('STALE_PROJECT is specific and non-alarming, with a reload action', () => {
    const s = staleProjectState();
    expect(s.alarming).toBe(false);
    expect(s.message).toMatch(/changed elsewhere/);
    expect(s.action.effect).toBe('reload');
  });

  it('a diverged tree says pull first and offers NO force-push', () => {
    const d = divergedTreeState();
    expect(d.message).toMatch(/pull first/i);
    expect(d.forcePushAvailable).toBe(false);
  });
});

describe('the bridge, as the maker experiences it', () => {
  it('RESOLVED fact: Firefox has Web Serial; only Safari needs the fallback', () => {
    expect(webSerialSupported('firefox')).toBe(true);
    expect(webSerialSupported('chromium')).toBe(true);
    expect(webSerialSupported('safari')).toBe(false);
  });

  it('no serial prompt on a capable browser; a clear one on Safari', () => {
    expect(bridgePrompt('flash-serial', 'firefox')).toBeNull();
    expect(bridgePrompt('flash-serial', 'safari')?.message).toMatch(/serial ports/);
  });

  it('a bridge-absent control is disabled WITH its reason attached', () => {
    const c = bridgeAbsentControl('flash');
    expect(c.disabled).toBe(true);
    expect(c.reason).toMatch(/bridge/);
  });
});

describe('model-level selection', () => {
  it('notifies every subscriber — views inherit linkage for free', () => {
    const store = new SelectionStore();
    const seen: unknown[] = [];
    store.subscribe((e) => seen.push(e));
    store.select({ kind: 'part', ref: 'R3' });
    expect(seen).toEqual([null, { kind: 'part', ref: 'R3' }]);
    expect(store.isSelected({ kind: 'part', ref: 'R3' })).toBe(true);
  });
});

describe('bench and the gate', () => {
  const steps = [
    { index: 0, kind: 'POWER_OFF' as const, instruction: 'unplug', holes: [] },
    { index: 1, kind: 'GATE' as const, instruction: 'probe', holes: [] },
    { index: 2, kind: 'POWER_ON' as const, instruction: 'connect', holes: [] },
  ];

  it('one step live, the rest dimmed — not hidden', () => {
    const b = benchState(steps, 1);
    expect(b.dimmedIndices).toEqual([0, 2]);
    expect(b.steps).toHaveLength(3);          // the maker sees there are more
    expect(b.wakeLockRequested).toBe(true);
  });

  it('D15: the predicted value is NOT shown until after entry', () => {
    const gate = new GateMachine(
      'Probe the rails. What does it read?', 'Ω',
      'open circuit (OL)',
      (v) => (v > 1e6 || !Number.isFinite(v) ? 'consistent' : 'inconsistent'),
    );
    const before = gate.current();
    expect(before.predictedVisible).toBe(false);
    expect(JSON.stringify(before)).not.toContain('open circuit');
    const after = gate.enterMeasurement(2e6);
    expect(after.predictedVisible).toBe(true);
    if (after.phase === 'entered') expect(after.verdict).toBe('consistent');
  });

  it('the gate accepts a number or nothing — no confirm, no yes', () => {
    const gate = new GateMachine('p', 'V', '5', () => 'consistent');
    const names = Object.getOwnPropertyNames(GateMachine.prototype);
    for (const n of names) {
      expect(n).not.toMatch(/confirm|yes|skip|approve/i);
    }
    expect(() => gate.enterMeasurement(Number.NaN)).toThrow(/finite number/);
  });
});
