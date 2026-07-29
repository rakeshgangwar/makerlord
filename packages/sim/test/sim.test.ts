import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Circuit } from '@makerlord/circuit';
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import { capFinding, severityCeiling, weakest } from '../src/provenance.js';
import { deviceModel } from '../src/models.js';
import { assumedStimulusFinding, stimulusLine, type Stimulus } from '../src/stimulus.js';
import { spiceNetlist } from '../src/netlist.js';
import {
  cornerFrequency, downsample, parseOpOutput, parseWrdata, traceMin,
} from '../src/parse.js';
import {
  checkCorner, checkDissipation, checkRailSag, noConvergenceFinding,
} from '../src/findings.js';
import { climbLadder, CONVERGENCE_LADDER } from '../src/ladder.js';
import { dischargePlan, notSimulable } from '../src/discharge.js';

afterEach(() => {
  delete process.env.MAKERLORD_SPICE_PATH;
});

describe('D43 — provenance bounds severity, weakest not average', () => {
  it('maps the ceiling table exactly', () => {
    expect(severityCeiling('verified')).toBe('BLOCKER');
    expect(severityCeiling('computed')).toBe('BLOCKER');
    expect(severityCeiling('sourced')).toBe('WARNING');
    expect(severityCeiling('assumed')).toBe('NOTE');
  });

  it('one idealised part caps the whole run', () => {
    expect(weakest(['verified', 'computed', 'assumed'])).toBe('assumed');
    expect(weakest(['verified', 'computed'])).toBe('computed');
  });

  it('capFinding degrades and says why; never upgrades', () => {
    const f = {
      ruleId: 'SIM_POWER_DISSIPATION', severity: 'BLOCKER' as const,
      message: 'too hot', affected: {},
    };
    const capped = capFinding(f, 'NOTE');
    expect(capped.severity).toBe('NOTE');
    expect(capped.message).toMatch(/capped/);
    expect(capFinding({ ...f, severity: 'NOTE' }, 'BLOCKER').severity).toBe('NOTE');
  });

  it('THE test that matters most: identical outcome, curated vs idealised', () => {
    const numeric = {
      ruleId: 'SIM_ABSMAX_EXCEEDED', severity: 'BLOCKER' as const,
      message: 'over abs-max', affected: {},
    };
    const curatedRun = capFinding(numeric, severityCeiling('computed'));
    const idealisedRun = capFinding(numeric, severityCeiling('assumed'));
    expect(curatedRun.severity).toBe('BLOCKER');
    expect(idealisedRun.severity).toBe('NOTE');
  });
});

const RES_PROFILE: SafetyProfile = {
  partId: 'res', footprint: { pins: {} }, resistanceOhms: 220,
  powerRatingW: 0.25, hazardClass: 'none',
};
const LED_PROFILE: SafetyProfile = {
  partId: 'led', footprint: { pins: {} }, forwardVoltageV: 2,
  maxCurrentMa: 20, hazardClass: 'none',
};
const MCU_PROFILE: SafetyProfile = {
  partId: 'mcu', footprint: { pins: {} }, pinMaxMa: 20, quiescentMa: 45,
  hazardClass: 'none',
};

describe('device models', () => {
  it('a resistor profile becomes a computed resistor', () => {
    const { model } = deviceModel('R1', undefined, RES_PROFILE);
    expect(model).toMatchObject({ kind: 'resistor', provenance: 'computed' });
  });

  it('an LED profile becomes a computed diode with a card', () => {
    const { model } = deviceModel('LED1', undefined, LED_PROFILE);
    expect(model.kind).toBe('diode');
    expect(model.provenance).toBe('computed');
    expect(model.card).toContain('.model D_LED1');
  });

  it('an MCU becomes an assumed behavioural stub — the MCU boundary', () => {
    const { model } = deviceModel('U1', undefined, MCU_PROFILE);
    expect(model).toMatchObject({ kind: 'mcu-stub', provenance: 'assumed' });
    expect(model.params.activeMa).toBe(45);
  });

  it('THE missing-model fixture: stubbed, named, and capped at NOTE', () => {
    const { model, finding } = deviceModel('X1', undefined, undefined);
    expect(model.provenance).toBe('assumed');
    expect(finding?.ruleId).toBe('SIM_MODEL_MISSING');
    expect(finding?.message).toContain('X1');
    expect(finding?.suggestedFix).toContain('data/spice/');
  });

  it('a curated .lib upgrades the part to verified', () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-spice-'));
    process.env.MAKERLORD_SPICE_PATH = dir;
    writeFileSync(join(dir, 'fancy-led.lib'), '.model FANCY D(Is=2e-18 N=1.8)');
    const def: PartDefinition = {
      id: 'fancy-led', title: 'Fancy', family: 'LED', properties: {},
      pins: [], buses: [], views: {},
    };
    const { model } = deviceModel('LED9', def, undefined);
    expect(model.provenance).toBe('verified');
    expect(model.card).toContain('FANCY');
  });
});

describe('stimulus', () => {
  const step: Stimulus = {
    id: 'radio-tx', target: 'vcc', kind: 'load_step',
    params: { idleMa: 1, activeMa: 120, delay: 1e-3, duration: 5e-3 },
    provenance: 'derived',
    rationale: 'radio active current from the architecture block',
  };

  it('projects a load step into a pulsed current sink', () => {
    const line = stimulusLine(step, 0, 'vcc');
    expect(line).toMatch(/^I_radio_tx vcc 0 PULSE\(0\.001 0\.12/);
  });

  it('projects a dc source', () => {
    const line = stimulusLine(
      { ...step, kind: 'dc', params: { volts: 5 } }, 0, 'vcc',
    );
    expect(line).toBe('V_radio_tx vcc 0 DC 5');
  });

  it('assumed stimulus produces the NOTE with rationale; derived does not', () => {
    expect(assumedStimulusFinding([step])).toBeNull();
    const guessed = { ...step, provenance: 'assumed' as const, rationale: 'guessed duty' };
    const f = assumedStimulusFinding([guessed]);
    expect(f?.ruleId).toBe('SIM_STIMULUS_ASSUMED');
    expect(f?.message).toContain('guessed duty');
  });
});

describe('netlist projection — golden file', () => {
  const defs = new Map<string, PartDefinition>([
    ['res', {
      id: 'res', title: 'Resistor', family: 'Resistor', properties: {},
      pins: [
        { id: 'c0', name: 'Pin 0', role: 'passive' },
        { id: 'c1', name: 'Pin 1', role: 'passive' },
      ],
      buses: [], views: {},
    }],
    ['led', {
      id: 'led', title: 'LED', family: 'LED', properties: {},
      pins: [
        { id: 'c0', name: 'cathode', role: 'passive' },
        { id: 'c1', name: 'anode', role: 'passive' },
      ],
      buses: [], views: {},
    }],
    ['mcu', {
      id: 'mcu', title: 'MCU', family: 'mcu', properties: {},
      pins: [
        { id: 'c0', name: 'GND', role: 'gnd' },
        { id: 'c1', name: '5V', role: 'supply' },
      ],
      buses: [], views: {},
    }],
  ]);
  const profiles = new Map<string, SafetyProfile>([
    ['res', RES_PROFILE], ['led', LED_PROFILE], ['mcu', MCU_PROFILE],
  ]);

  const circuit: Circuit = {
    boardId: 'half',
    parts: [
      { ref: 'U1', defId: 'mcu' },
      { ref: 'R1', defId: 'res' },
      { ref: 'LED1', defId: 'led' },
    ],
    wires: [],
    intent: [
      { name: 'vcc', members: [{ ref: 'U1', pin: '5V' }, { ref: 'R1', pin: 'Pin 0' }] },
      { name: 'mid', members: [{ ref: 'R1', pin: 'Pin 1' }, { ref: 'LED1', pin: 'anode' }] },
      { name: 'gnd', members: [{ ref: 'U1', pin: 'GND' }, { ref: 'LED1', pin: 'cathode' }] },
    ],
  };

  const supply: Stimulus = {
    id: 'rail', target: 'vcc', kind: 'dc', params: { volts: 5 },
    provenance: 'derived', rationale: 'architecture supply block',
  };

  it('projects the fixture into an exact, hand-runnable .cir', () => {
    const net = spiceNetlist(circuit, defs, profiles, [supply], ['.op']);
    expect(net.cir).toBe(
      [
        '* MakerLord generated netlist — a projection of project.json (D2).',
        '* Readable and hand-runnable on purpose. Check our work.',
        'IU1 vcc 0 0.0450 ; mcu stub, assumed',
        'RR1 vcc mid 220 ; computed',
        'DLED1 mid 0 D_LED1 ; computed',
        'V_rail vcc 0 DC 5 ; derived',
        '.model D_LED1 D(Is=1e-20 N=1.836)',
        '.op',
        '.end',
        '',
      ].join('\n'),
    );
  });

  it('a gnd-role pin makes its whole net node 0', () => {
    const net = spiceNetlist(circuit, defs, profiles, [supply], ['.op']);
    expect(net.nodeOf.get('LED1.cathode')).toBe('0');
    expect(net.nodeOf.get('U1.GND')).toBe('0');
  });

  it('the run inherits the weakest model — the MCU stub', () => {
    const net = spiceNetlist(circuit, defs, profiles, [supply], ['.op']);
    expect(net.provenance).toBe('assumed');
  });
});

describe('parsers — known-answer arithmetic', () => {
  it('parses .op print output', () => {
    const op = parseOpOutput('v(mid) = 2.500000e+00\nv(vcc) = 5.000000e+00\n');
    expect(op.get('v(mid)')).toBeCloseTo(2.5);
  });

  it('divider check: node voltage exact', () => {
    // 5 V across two equal resistors — the parser's job is exactness.
    const op = parseOpOutput('v(mid) = 2.500000e+00');
    expect(op.get('v(mid)')).toBeCloseTo(2.5, 4);
  });

  it('RC corner: −3 dB point within 2% of 1/(2πRC)', () => {
    // R=1k, C=1µ → fc = 159.155 Hz. Synthesise the ideal magnitude curve.
    const R = 1000, C = 1e-6;
    const fc = 1 / (2 * Math.PI * R * C);
    const freqs = Array.from({ length: 400 }, (_, i) => 10 ** (i / 100));
    const mags = freqs.map((f) => 1 / Math.sqrt(1 + (f / fc) ** 2));
    const text = freqs.map((f, i) => `${f} ${mags[i]}`).join('\n');
    const corner = cornerFrequency(parseWrdata(text))!;
    expect(Math.abs(corner - fc) / fc).toBeLessThan(0.02);
  });

  it('RC charging: one time constant ≈ 63.2%', () => {
    const tau = 1e-3;
    const rows = Array.from({ length: 1000 }, (_, i) => {
      const t = (i / 999) * 5 * tau;
      return `${t} ${5 * (1 - Math.exp(-t / tau))}`;
    }).join('\n');
    const trace = parseWrdata(rows);
    const idx = trace.columns[0]!.findIndex((t) => t >= tau);
    expect(trace.columns[1]![idx]! / 5).toBeCloseTo(0.632, 2);
  });

  it('downsamples long traces for progressive disclosure', () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => `${i} ${i * 2}`).join('\n');
    const small = downsample(parseWrdata(rows), 500);
    expect(small.columns[0]!.length).toBeLessThanOrEqual(500);
  });
});

describe('findings', () => {
  it('dissipation above rating fires, and caps under weak provenance', () => {
    const hot = checkDissipation(
      new Map([['R1', 0.9]]),
      new Map([['R1', RES_PROFILE]]),
      'BLOCKER',
    );
    expect(hot[0]).toMatchObject({ ruleId: 'SIM_POWER_DISSIPATION', severity: 'BLOCKER' });
    const capped = checkDissipation(
      new Map([['R1', 0.9]]),
      new Map([['R1', RES_PROFILE]]),
      'NOTE',
    );
    expect(capped[0]!.severity).toBe('NOTE');
  });

  it('rail sag fires with the sag depth', () => {
    const trace = parseWrdata('0 5.0\n0.001 4.9\n0.002 2.7\n0.003 5.0');
    const f = checkRailSag(trace, 3.0, 'vcc', 'BLOCKER');
    expect(f[0]!.ruleId).toBe('SIM_RAIL_SAG');
    expect(f[0]!.message).toContain('2.70');
    expect(checkRailSag(trace, 2.0, 'vcc', 'BLOCKER')).toEqual([]);
    expect(traceMin(trace)).toBeCloseTo(2.7);
  });

  it('corner mismatch compares measured against the requirement', () => {
    const R = 1000, C = 1e-6;
    const fc = 1 / (2 * Math.PI * R * C);   // ≈159 Hz
    const freqs = Array.from({ length: 400 }, (_, i) => 10 ** (i / 100));
    const mags = freqs.map((f) => 1 / Math.sqrt(1 + (f / fc) ** 2));
    const trace = parseWrdata(freqs.map((f, i) => `${f} ${mags[i]}`).join('\n'));
    const requirement = {
      id: 'corner', category: 'performance' as const,
      statement: 'corner at most 10 Hz', metric: 'corner_frequency',
      comparator: '<=' as const, value: 10, unit: 'Hz',
      consumedBy: ['SIM'], provenance: 'stated' as const,
    };
    const { finding, measured } = checkCorner(trace, requirement, 'BLOCKER');
    expect(measured).toBeGreaterThan(100);
    expect(finding?.ruleId).toBe('SIM_AC_CORNER_MISMATCH');
  });
});

describe('the convergence ladder', () => {
  it('records every rung tried and stops at the first success', async () => {
    let calls = 0;
    const outcome = await climbLadder(async (rung) => {
      calls += 1;
      return rung.name === 'source stepping' ? 'solved' : null;
    });
    expect(outcome.converged).toBe(true);
    expect(outcome.rung?.name).toBe('source stepping');
    expect(outcome.rungsTried).toEqual(['default', 'gmin stepping', 'source stepping']);
    expect(calls).toBe(3);
  });

  it('a result at relaxed tolerance is marked as the weaker claim', () => {
    const relaxed = CONVERGENCE_LADDER.find((r) => r.name === 'relaxed tolerances')!;
    expect(relaxed.weakensClaim).toBe(true);
    expect(CONVERGENCE_LADDER[0]!.weakensClaim).toBe(false);
  });

  it('THE convergence-failure fixture: no result is not a pass', async () => {
    const outcome = await climbLadder(async () => null);
    expect(outcome.converged).toBe(false);
    expect(outcome.result).toBeUndefined();
    expect(outcome.rungsTried).toHaveLength(CONVERGENCE_LADDER.length);
    const f = noConvergenceFinding(outcome.rungsTried, 'ngspice: timestep too small');
    expect(f.severity).toBe('NOTE');
    expect(f.message).toMatch(/about our tool, not about your design/);
    expect(f.message).toContain('gear integration');
  });
});

describe('requirement discharge — never silence', () => {
  const corner = {
    id: 'c', category: 'performance' as const, statement: 'corner ≤ 10 Hz',
    metric: 'corner_frequency', comparator: '<=' as const, value: 10,
    unit: 'Hz', consumedBy: ['SIM'], provenance: 'stated' as const,
  };
  const battery = { ...corner, id: 'b', metric: 'battery_runtime', statement: '6 months' };

  it('maps simulable metrics to their analysis', () => {
    const plan = dischargePlan([corner, battery]);
    expect(plan[0]!.analysis).toBe('ac');
    expect(plan[1]!.analysis).toBe('not-simulable');
  });

  it('a not-simulable requirement gets an explicit verdict, not silence', () => {
    const v = notSimulable(battery);
    expect(v.verdict).toBe('not-simulable');
    expect(v.detail).toMatch(/known gap/);
  });
});
