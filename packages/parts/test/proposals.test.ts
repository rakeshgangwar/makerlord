import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProposals, parseProposal } from '../src/proposals.js';
import { buildBundle } from '../src/bundle.js';
import { loadProfiles } from '../src/profile.js';

/**
 * The proposals queue (curation spec §3): agent-drafted profiles with a
 * per-field paper trail, loading as SOURCED tier. Tier is location —
 * a proposal never shadows a verified profile, and nothing but
 * promotion (a human moving the file) changes a part's standing.
 */

const PROPOSAL = `
partId: Buzzer-v15
file: core/Buzzer-v15.fzp
proposedAt: 2026-07-30T18:00:00Z
citations:
  absMaxVoltageV: https://cdn.sparkfun.com/datasheets/Sensors/LightImaging/SEN-09088.pdf
profile:
  partId: Buzzer-v15
  footprint:
    pins:
      "+": [0, 0]
      "-": [0, 1]
  absMaxVoltageV: 5.0
  hazardClass: none
`;

describe('parseProposal', () => {
  it('parses the queue format', () => {
    const p = parseProposal(PROPOSAL);
    expect(p.partId).toBe('Buzzer-v15');
    expect(p.citations.absMaxVoltageV).toMatch(/^https:/);
    expect(p.profile.absMaxVoltageV).toBe(5.0);
  });

  it('refuses an electrical field with no citation — no citation, no field', () => {
    expect(() => parseProposal(`
partId: x
file: core/x.fzp
proposedAt: 2026-07-30T18:00:00Z
citations: {}
profile:
  partId: x
  footprint: { pins: { a: [0, 0] } }
  absMaxVoltageV: 5.0
  hazardClass: none
`)).toThrow(/citation.*absMaxVoltageV/i);
  });

  it('refuses a non-URL citation', () => {
    expect(() => parseProposal(`
partId: x
file: core/x.fzp
proposedAt: 2026-07-30T18:00:00Z
citations: { absMaxVoltageV: "trust me" }
profile:
  partId: x
  footprint: { pins: { a: [0, 0] } }
  absMaxVoltageV: 5.0
  hazardClass: none
`)).toThrow(/url/i);
  });

  it('refuses a partId mismatch between queue entry and profile', () => {
    expect(() => parseProposal(PROPOSAL.replace('partId: Buzzer-v15\nfile:', 'partId: other\nfile:'))).toThrow(/partId/);
  });
});

describe('loadProposals + the tiered bundle', () => {
  it('a proposal loads as sourced; verified profiles stay verified', () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-prop-'));
    mkdirSync(join(dir, 'proposals'), { recursive: true });
    writeFileSync(join(dir, 'proposals', 'photocell.yaml'), PROPOSAL);

    const proposals = loadProposals(join(dir, 'proposals'));
    expect(proposals.size).toBe(1);

    const bundle = buildBundle(
      [{ file: 'core/resistor.fzp', partId: 'ResistorModuleID' }],
      loadProfiles(),
      undefined,
      proposals,
    );
    expect(bundle.tiers.ResistorModuleID).toBe('verified');
    expect(bundle.tiers['Buzzer-v15']).toBe('sourced');
    expect(bundle.parts['Buzzer-v15']).toBeDefined();
    expect(bundle.profiles['Buzzer-v15']?.absMaxVoltageV).toBe(5.0);
  });

  it('a proposal shadowing a verified profile is dropped, loudly listed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-prop-'));
    mkdirSync(join(dir, 'proposals'), { recursive: true });
    writeFileSync(join(dir, 'proposals', 'shadow.yaml'), `
partId: ResistorModuleID
file: core/resistor.fzp
proposedAt: 2026-07-30T18:00:00Z
citations: { resistanceOhms: "https://example.com/ds.pdf" }
profile:
  partId: ResistorModuleID
  footprint: { pins: { "Pin 0": [0, 0], "Pin 1": [0, 1] } }
  resistanceOhms: 1
  hazardClass: none
`);
    const proposals = loadProposals(join(dir, 'proposals'));
    const bundle = buildBundle(
      [{ file: 'core/resistor.fzp', partId: 'ResistorModuleID' }],
      loadProfiles(),
      undefined,
      proposals,
    );
    // The verified profile wins; the proposal never shadows it.
    expect(bundle.tiers.ResistorModuleID).toBe('verified');
    expect(bundle.profiles.ResistorModuleID?.resistanceOhms).not.toBe(1);
  });
});
