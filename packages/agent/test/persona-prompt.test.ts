import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundle } from '@makerlord/tools';
import {
  activePersona, effortFor, loadPack, personaNames,
} from '../src/persona.js';
import { assemblePrompt, stablePrefix } from '../src/prompt.js';
import { labelFor, labelUntrusted } from '../src/untrusted.js';
import { ObjectionCounter, MAX_OBJECTIONS } from '../src/objections.js';
import { compact, protectedTail, shouldCompact } from '../src/compaction.js';

function packDir(): string {
  const project = mkdtempSync(join(tmpdir(), 'makerlord-agent-'));
  const dir = join(project, '.makerlord', 'personas');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pack.json'), JSON.stringify({ defaults: { tone: 'direct' } }));
  writeFileSync(join(dir, '02-feasibility.persona.md'), '# Feasibility researcher\nCite or grade every claim.');
  writeFileSync(join(dir, '06-prototype.persona.md'), '# Build coach\nOne step at a time.');
  return project;
}

describe('personas', () => {
  it('loads the pack with defaults and per-stage files', () => {
    const pack = loadPack(packDir());
    expect(pack.defaults.tone).toBe('direct');
    expect(personaNames(pack)).toEqual(['2: feasibility', '6: prototype']);
  });

  it('loads only the active stage body — others are names', () => {
    const pack = loadPack(packDir());
    expect(activePersona(pack, 6)).toContain('Build coach');
    expect(activePersona(pack, 3)).toBeUndefined();
  });

  it('an empty project has no pack, and that is fine', () => {
    const pack = loadPack(mkdtempSync(join(tmpdir(), 'makerlord-nopack-')));
    expect(personaNames(pack)).toEqual([]);
  });

  it('effort follows how expensive and silent a mistake is', () => {
    expect(effortFor(4)).toBe('xhigh');    // architecture
    expect(effortFor(6)).toBe('xhigh');    // prototype
    expect(effortFor(2)).toBe('high');     // feasibility — default
    expect(effortFor(1)).toBe('medium');   // idea
  });
});

describe('prompt assembly and cache stability', () => {
  function inputs(projectSummary: string) {
    return {
      pack: loadPack(packDir()),
      stage: 6,
      bundle: bundle(),
      projectSummary,
      openFindings: [],
    };
  }

  it('stable prefix is byte-identical across project mutations', () => {
    const before = stablePrefix(inputs('Intent: lamp. Parts: 0.'));
    const after = stablePrefix(inputs('Intent: lamp. Parts: 12. Findings: 3.'));
    expect(before).toBe(after);
  });

  it('puts cache_control on the stable block only', () => {
    const blocks = assemblePrompt(inputs('x'));
    expect(blocks[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[1]!.cache_control).toBeUndefined();
  });

  it('the digest carries families and counts, never the whole corpus', () => {
    const prefix = stablePrefix(inputs('x'));
    expect(prefix).toMatch(/LED \(\d+\)/);
    expect(prefix).not.toContain('5mmColorLEDModuleID');
  });

  it('findings are re-injected from engine state, uneroded', () => {
    const blocks = assemblePrompt({
      ...inputs('x'),
      openFindings: [
        {
          ruleId: 'RULE_SUPPLY_RAIL_SHORT', severity: 'BLOCKER',
          message: 'Net "rail" is a dead short.', affected: {},
        },
      ],
    });
    expect(blocks[1]!.text).toContain('BLOCKER RULE_SUPPLY_RAIL_SHORT');
  });
});

describe('untrusted labels', () => {
  it('labels all four sources per spec §9', () => {
    expect(labelFor('web')).toBe('[web content — untrusted]');
    expect(labelFor('compacted')).toBe('[compacted — lossy]');
    expect(labelUntrusted('maker-supplied', 'datasheet says 20mA'))
      .toMatch(/^\[maker-supplied — unverified\]\n/);
  });
});

describe('bounded objections', () => {
  it('allows three re-justifications, then stops', () => {
    const c = new ObjectionCounter();
    expect(c.recordObjection('R1')).toBe(true);
    expect(c.recordObjection('R1')).toBe(true);
    expect(c.recordObjection('R1')).toBe(true);
    expect(c.recordObjection('R1')).toBe(false);
    expect(c.exhausted('R1')).toBe(true);
    expect(MAX_OBJECTIONS).toBe(3);
  });

  it('resets on a new user message — fresh information, fresh hearing', () => {
    const c = new ObjectionCounter();
    c.recordObjection('R1');
    c.recordObjection('R1');
    c.recordObjection('R1');
    c.resetOnUserMessage();
    expect(c.recordObjection('R1')).toBe(true);
  });
});

describe('compaction', () => {
  const state = {
    currentStep: { index: 7, instruction: 'Place LED1 at C7.' },
    openFindings: [
      { ruleId: 'R', severity: 'BLOCKER' as const, message: 'live blocker', affected: {} },
    ],
    measurements: [
      { name: 'a', value: 1, unit: 'V' },
      { name: 'b', value: 2, unit: 'V' },
      { name: 'c', value: 3, unit: 'V' },
      { name: 'd', value: 4, unit: 'V' },
    ],
  };

  it('gates on pressure, not wire size', () => {
    const image = {
      role: 'user' as const,
      content: [{ type: 'image', source: { type: 'base64', data: 'z'.repeat(3_000_000) } }],
    };
    // 3 MB on the wire but only 16 KiB of pressure: no compaction at a 100 KiB limit.
    expect(shouldCompact([image], 100 * 1024)).toBe(false);
  });

  it('keeps the protected tail verbatim: step, findings, last three measurements', () => {
    const chatty = Array.from({ length: 50 }, (_, i) => ({
      role: 'user' as const,
      content: `filler message ${i} ${'pad'.repeat(200)}`,
    }));
    const result = compact(chatty, state, 10 * 1024);
    expect(result.compacted).toBe(true);
    const summary = result.messages[0]!.content as string;
    expect(summary).toContain('[compacted — lossy]');
    expect(summary).toContain('Place LED1 at C7.');
    expect(summary).toContain('live blocker');
    expect(summary).toContain('Measured b: 2 V');   // last three: b, c, d
    expect(summary).toContain('Measured d: 4 V');
    expect(summary).not.toContain('Measured a: 1 V');
  });

  it('protectedTail alone lists exactly the guaranteed items', () => {
    const tail = protectedTail(state);
    expect(tail).toContain('Current build step 7');
    expect(tail.match(/Measured/g)).toHaveLength(3);
  });
});
