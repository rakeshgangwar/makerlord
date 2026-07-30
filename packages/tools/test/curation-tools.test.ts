import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDataCache, tierOf } from '../src/data.js';
import type { ToolCtx } from '../src/def.js';
import { ALL_TOOLS, runTool } from '../src/registry.js';
import { initProjectFile } from '../src/session.js';

/**
 * The D50/D51 pipeline through the tool surface: a sourced part designs
 * and checks freely, both gates refuse it, and promotion does not exist
 * here — the absence IS the guarantee.
 */

const BUZZER_PROPOSAL = `
partId: Buzzer-v15
file: core/Buzzer-v15.fzp
proposedAt: 2026-07-30T18:00:00Z
citations:
  absMaxVoltageV: https://example.com/buzzer-datasheet.pdf
  quiescentMa: https://example.com/buzzer-datasheet.pdf
profile:
  partId: Buzzer-v15
  footprint:
    pins:
      "+": [0, 0]
      "-": [0, 1]
  polarity: polarized
  absMaxVoltageV: 5.0
  quiescentMa: 30
  hazardClass: none
`;

let ctx: ToolCtx;
let proposalsDir: string;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'makerlord-cur-'));
  proposalsDir = join(dir, 'proposals');
  mkdirSync(proposalsDir, { recursive: true });
  process.env.MAKERLORD_PROPOSALS_PATH = proposalsDir;
  resetDataCache();
  const session = initProjectFile(join(dir, 'project.json'), 'a beeper');
  ctx = { session, cwd: dir };
});

afterEach(() => {
  delete process.env.MAKERLORD_PROPOSALS_PATH;
  resetDataCache();
});

async function call(name: string, input: unknown = {}) {
  return runTool(name, input, ctx);
}

async function data(name: string, input: unknown = {}) {
  const r = await call(name, input);
  expect(r.ok, `${name}: ${JSON.stringify(r).slice(0, 300)}`).toBe(true);
  return (r as { ok: true; data: never }).data as Record<string, unknown>;
}

describe('the sourced tier through the tool surface', () => {
  beforeEach(() => {
    writeFileSync(join(proposalsDir, 'buzzer.yaml'), BUZZER_PROPOSAL);
    resetDataCache();
  });

  it('a sourced part designs and checks — with the honest NOTE', async () => {
    expect(tierOf('Buzzer-v15')).toBe('sourced');
    await data('part_add', { ref: 'BZ1', defId: 'Buzzer-v15' });
    await data('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' });
    await data('connect', { from: 'U1.D5 PWM', to: 'BZ1.+' });
    await data('connect', { from: 'BZ1.-', to: 'U1.GND' });
    const checked = await data('check_circuit');
    const findings = checked.findings as { ruleId: string; severity: string }[];
    const note = findings.find((f) => f.ruleId === 'PART_PROFILE_SOURCED');
    expect(note).toBeDefined();
    expect(note!.severity).toBe('NOTE');
  });

  it('the power gate refuses PROFILE_UNVERIFIED, naming the part', async () => {
    await data('part_add', { ref: 'BZ1', defId: 'Buzzer-v15' });
    await data('measure', { name: 'continuity', value: 1, unit: 'ohm' });
    const r = await call('gate_open');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refused).toBe('PROFILE_UNVERIFIED');
      expect(r.message).toMatch(/BZ1/);
    }
  });

  it('promotion unblocks: the fixture moves the file, the gate opens', async () => {
    await data('part_add', { ref: 'BZ1', defId: 'Buzzer-v15' });
    await data('measure', { name: 'continuity', value: 1, unit: 'ohm' });
    // "Promotion" in fixture form — the FULL move the CLI performs:
    // profile into the verified dir AND an entry in the curated manifest.
    // Tier is location, and verified-location is both of those.
    const verifiedRoot = mkdtempSync(join(tmpdir(), 'makerlord-verified-'));
    const profilesDir = join(verifiedRoot, 'profiles');
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(join(profilesDir, 'buzzer.yaml'), `
partId: Buzzer-v15
footprint:
  pins:
    "+": [0, 0]
    "-": [0, 1]
polarity: polarized
absMaxVoltageV: 5.0
quiescentMa: 30
hazardClass: none
`);
    const curated = JSON.parse(readFileSync('data/curated.json', 'utf8')) as unknown[];
    writeFileSync(join(verifiedRoot, 'curated.json'), JSON.stringify([
      ...curated,
      { file: 'core/Buzzer-v15.fzp', partId: 'Buzzer-v15' },
    ]));
    // The original profiles still load (uno etc.); ours adds the buzzer.
    const merged = mkdtempSync(join(tmpdir(), 'makerlord-merged-'));
    for (const f of (await import('node:fs')).readdirSync('data/profiles')) {
      writeFileSync(join(merged, f), readFileSync(join('data/profiles', f)));
    }
    writeFileSync(join(merged, 'buzzer.yaml'), readFileSync(join(profilesDir, 'buzzer.yaml')));
    process.env.MAKERLORD_PROFILES_PATH = merged;
    process.env.MAKERLORD_CURATED_PATH = join(verifiedRoot, 'curated.json');
    resetDataCache();
    try {
      expect(tierOf('Buzzer-v15')).toBe('verified');
      const r = await call('gate_open');
      expect(r.ok, JSON.stringify(r).slice(0, 200)).toBe(true);
    } finally {
      delete process.env.MAKERLORD_PROFILES_PATH;
      delete process.env.MAKERLORD_CURATED_PATH;
      resetDataCache();
    }
  });
});

describe('profile_propose', () => {
  it('files a validated proposal and reports plausibility + next steps', async () => {
    const r = await data('profile_propose', {
      file: 'core/Buzzer-v15.fzp',
      partId: 'Buzzer-v15',
      profile: {
        partId: 'Buzzer-v15',
        footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
        polarity: 'polarized',
        absMaxVoltageV: 5.0,
        hazardClass: 'none',
      },
      citations: { absMaxVoltageV: 'https://example.com/ds.pdf' },
    });
    expect(r.tier).toBe('sourced');
    expect(r.next).toMatch(/maker curate/);
    expect(readFileSync(join(proposalsDir, 'Buzzer-v15.yaml'), 'utf8'))
      .toContain('absMaxVoltageV: 5');
    resetDataCache();
    expect(tierOf('Buzzer-v15')).toBe('sourced');
  });

  it('refuses to shadow a verified part', async () => {
    const r = await call('profile_propose', {
      file: 'core/resistor.fzp',
      partId: 'ResistorModuleID',
      profile: {
        partId: 'ResistorModuleID',
        footprint: { pins: { 'Pin 0': [0, 0], 'Pin 1': [0, 1] } },
        hazardClass: 'none',
      },
      citations: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/VERIFIED/);
  });

  it('rejects an uncited electrical field and a phantom footprint pin', async () => {
    await expect(call('profile_propose', {
      file: 'core/Buzzer-v15.fzp',
      partId: 'Buzzer-v15',
      profile: {
        partId: 'Buzzer-v15',
        footprint: { pins: { '+': [0, 0] } },
        absMaxVoltageV: 5.0,
        hazardClass: 'none',
      },
      citations: {},
    })).rejects.toThrow(/citation/i);

    await expect(call('profile_propose', {
      file: 'core/Buzzer-v15.fzp',
      partId: 'Buzzer-v15',
      profile: {
        partId: 'Buzzer-v15',
        footprint: { pins: { VCC: [0, 0] } },
        hazardClass: 'none',
      },
      citations: {},
    })).rejects.toThrow(/VCC/);
  });

  it('an implausible Vf is named, not silently accepted', async () => {
    const r = await data('profile_propose', {
      file: 'core/Buzzer-v15.fzp',
      partId: 'Buzzer-v15',
      profile: {
        partId: 'Buzzer-v15',
        footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
        forwardVoltageV: 9.5,
        hazardClass: 'none',
      },
      citations: { forwardVoltageV: 'https://example.com/ds.pdf' },
    });
    expect((r.plausibility as string[])[0]).toMatch(/1\.2–4 V/);
  });
});

describe('the absence (D51)', () => {
  it('no registry tool promotes, sets tiers, or dismisses', () => {
    for (const t of ALL_TOOLS) {
      expect(t.name).not.toMatch(/promote|tier|dismiss|override|suppress|force/);
    }
  });
});

describe('tier-labelled search + geometry browse', () => {
  it('curated hits carry verified; geometry hits are browse-only extras', async () => {
    const r = await data('parts_search', { query: 'resistor' });
    const hits = r.hits as { id: string; tier: string }[];
    expect(hits.find((h) => h.id === 'ResistorModuleID')?.tier).toBe('verified');

    const wide = await data('parts_search', { query: 'buzzer', includeGeometry: true });
    const wideHits = wide.hits as { id: string; tier: string; file?: string }[];
    const buzzer = wideHits.find((h) => h.id === 'Buzzer-v15');
    expect(buzzer?.tier).toBe('geometry');
    expect(buzzer?.file).toBe('core/Buzzer-v15.fzp');
    // …and a geometry part cannot enter a circuit.
    await expect(call('part_add', { ref: 'BZ1', defId: 'Buzzer-v15' }))
      .rejects.toThrow();
  }, 120_000);
});

describe('the upload channel (spec §3.5)', () => {
  it('datasheet_read extracts a stored PDF, framed unverified', async () => {
    const dsDir = mkdtempSync(join(tmpdir(), 'makerlord-dsr-'));
    process.env.MAKERLORD_DATASHEETS_PATH = dsDir;
    try {
      const { saveDatasheet } = await import('@makerlord/parts');
      const { ref } = saveDatasheet(
        readFileSync(new URL('./fixtures/mini-datasheet.pdf', import.meta.url)) as Buffer,
      );
      const r = await data('datasheet_read', { ref });
      expect(r.text).toMatch(/^\[maker-supplied — unverified\]/);
      expect(r.text).toMatch(/Absolute maximum voltage 5\.0 V/);
      expect(r.pages).toBe(1);

      // …and a proposal citing the upload passes validation.
      const proposed = await data('profile_propose', {
        file: 'core/Buzzer-v15.fzp',
        partId: 'Buzzer-v15',
        profile: {
          partId: 'Buzzer-v15',
          footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
          absMaxVoltageV: 5.0,
          hazardClass: 'none',
        },
        citations: { absMaxVoltageV: ref },
      });
      expect(proposed.tier).toBe('sourced');
    } finally {
      delete process.env.MAKERLORD_DATASHEETS_PATH;
    }
  });

  it('a never-uploaded ref is refused at read AND at propose', async () => {
    const ghost = `upload:sha256:${'e'.repeat(64)}`;
    await expect(call('datasheet_read', { ref: ghost })).rejects.toThrow(/never uploaded/);
    await expect(call('profile_propose', {
      file: 'core/Buzzer-v15.fzp',
      partId: 'Buzzer-v15',
      profile: {
        partId: 'Buzzer-v15',
        footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
        absMaxVoltageV: 5.0,
        hazardClass: 'none',
      },
      citations: { absMaxVoltageV: ghost },
    })).rejects.toThrow(/never uploaded/);
  });

  it('parts_get serves a geometry part: def real, profile null, un-addable', async () => {
    const r = await data('parts_get', { id: 'Buzzer-v15' });
    expect(r.tier).toBe('geometry');
    expect(r.profile).toBeNull();
    expect((r.definition as { pins: unknown[] }).pins.length).toBeGreaterThan(0);
    expect(r.file).toBe('core/Buzzer-v15.fzp');
  }, 120_000);
});

describe('transport tolerance — the fifteen-retry failure, pinned', () => {
  it('a stringified profile with numeric strings coerces and files', async () => {
    const r = await data('profile_propose', {
      file: 'core/Buzzer-v15.fzp',
      partId: 'Buzzer-v15',
      // Exactly what the looping agent sent: JSON-as-string, numbers quoted.
      profile: JSON.stringify({
        partId: 'Buzzer-v15',
        footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
        absMaxVoltageV: '5.0',
        quiescentMa: '30',
        hazardClass: 'none',
      }),
      citations: JSON.stringify({ absMaxVoltageV: 'https://example.com/ds.pdf', quiescentMa: 'https://example.com/ds.pdf' }),
    });
    expect(r.tier).toBe('sourced');
    const written = readFileSync(join(proposalsDir, 'Buzzer-v15.yaml'), 'utf8');
    expect(written).toContain('absMaxVoltageV: 5');   // a NUMBER landed
  });

  it('garbage still fails loudly — coercion is not acceptance', async () => {
    await expect(call('profile_propose', {
      file: 'core/Buzzer-v15.fzp',
      partId: 'Buzzer-v15',
      profile: JSON.stringify({
        partId: 'Buzzer-v15',
        footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
        absMaxVoltageV: 'five volts ish',
        hazardClass: 'none',
      }),
      citations: '{}',
    })).rejects.toThrow();
  });
});
