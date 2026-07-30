import { describe, expect, it } from 'vitest';
import type { SafetyProfile } from '@makerlord/parts';
import { runRules, gateOpens } from '../src/rules/engine.js';
import { ALL_RULES } from '../src/rules/index.js';
import { def, fixtureContext, net } from './fixtures.js';

/**
 * The fourth deferred rule (deferred-work §B), unlocked by the curated
 * cell + charger. A bare LiPo feeding a circuit directly — no charge
 * control, no protection — is the classic hobby fire: over-discharge
 * puffs it, a short torches it. The cell's nets may reach ONLY parts
 * hand-marked `managesLipo` (the charger/protection module); anything
 * else is a BLOCKER on hand-authored (verified) provenance.
 */

const CELL = def('lipo-cell', 'battery', [
  { id: 'c0', name: '+', role: 'supply' },
  { id: 'c1', name: '-', role: 'gnd' },
]);
const CELL_PROFILE: SafetyProfile = {
  partId: 'lipo-cell',
  footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
  polarity: 'polarized',
  maxContinuousMa: 1000,
  hazardClass: 'lipo',
};

const CHARGER = def('charger', 'power', [
  { id: 'c0', name: 'B+', role: 'supply' },
  { id: 'c1', name: 'B-', role: 'gnd' },
  { id: 'c2', name: '5V', role: 'supply' },
  { id: 'c3', name: 'G', role: 'gnd' },
]);
const CHARGER_PROFILE: SafetyProfile = {
  partId: 'charger',
  footprint: { pins: { 'B+': [0, 0], 'B-': [0, 1], '5V': [1, 0], G: [1, 1] } },
  managesLipo: true,
  hazardClass: 'none',
};

const LED = def('led', 'LED', [
  { id: 'c0', name: 'anode', role: 'passive' },
  { id: 'c1', name: 'cathode', role: 'passive' },
]);
const LED_PROFILE: SafetyProfile = {
  partId: 'led',
  footprint: { pins: { anode: [0, 0], cathode: [0, 1] } },
  hazardClass: 'none',
};

const DEFS: [string, ReturnType<typeof def>][] = [
  ['lipo-cell', CELL], ['charger', CHARGER], ['led', LED],
];
const PROFILES: [string, SafetyProfile][] = [
  ['lipo-cell', CELL_PROFILE], ['charger', CHARGER_PROFILE], ['led', LED_PROFILE],
];

describe('RULE_LIPO_UNMANAGED', () => {
  it('a bare cell wired straight to a load is a BLOCKER that shuts the gate', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'BT1', defId: 'lipo-cell' }, { ref: 'LED1', defId: 'led' }],
      nets: [
        net('n1', [{ ref: 'BT1', pin: '+' }, { ref: 'LED1', pin: 'anode' }]),
        net('n2', [{ ref: 'BT1', pin: '-' }, { ref: 'LED1', pin: 'cathode' }]),
      ],
      defs: DEFS, profiles: PROFILES,
    });
    const findings = runRules(ALL_RULES, ctx);
    const hit = findings.find((f) => f.ruleId === 'RULE_LIPO_UNMANAGED');
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe('BLOCKER');
    expect(hit!.message).toMatch(/BT1/);
    expect(hit!.suggestedFix).toMatch(/charg|protect/i);
    expect(gateOpens(findings)).toBe(false);
  });

  it('the benign twin: the cell reaches only the charger — silent', () => {
    const ctx = fixtureContext({
      parts: [{ ref: 'BT1', defId: 'lipo-cell' }, { ref: 'CHG1', defId: 'charger' }],
      nets: [
        net('n1', [{ ref: 'BT1', pin: '+' }, { ref: 'CHG1', pin: 'B+' }]),
        net('n2', [{ ref: 'BT1', pin: '-' }, { ref: 'CHG1', pin: 'B-' }]),
      ],
      defs: DEFS, profiles: PROFILES,
    });
    expect(runRules(ALL_RULES, ctx).map((f) => f.ruleId)).not.toContain('RULE_LIPO_UNMANAGED');
  });

  it('a load sharing the cell net BESIDE the charger still fires', () => {
    const ctx = fixtureContext({
      parts: [
        { ref: 'BT1', defId: 'lipo-cell' },
        { ref: 'CHG1', defId: 'charger' },
        { ref: 'LED1', defId: 'led' },
      ],
      nets: [
        net('n1', [
          { ref: 'BT1', pin: '+' }, { ref: 'CHG1', pin: 'B+' }, { ref: 'LED1', pin: 'anode' },
        ]),
        net('n2', [{ ref: 'BT1', pin: '-' }, { ref: 'CHG1', pin: 'B-' }]),
      ],
      defs: DEFS, profiles: PROFILES,
    });
    const hit = runRules(ALL_RULES, ctx).find((f) => f.ruleId === 'RULE_LIPO_UNMANAGED');
    expect(hit).toBeDefined();
    expect(hit!.message).toMatch(/LED1/);
  });

  it('now registers twelve rules', () => {
    expect(ALL_RULES).toHaveLength(12);
  });
});
