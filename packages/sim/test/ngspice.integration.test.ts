import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ngspiceAvailable, runNgspice } from '../src/run.js';
import { parseOpOutput } from '../src/parse.js';

const available = await ngspiceAvailable();

if (!available) {
  // Spec §10: a missing binary skips LOUDLY rather than passing quietly.
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  ngspice is NOT installed — known-answer integration tests are ' +
      'SKIPPED.\n   Install it with: sudo apt install -y ngspice\n',
  );
}

describe.skipIf(!available)('ngspice integration — known answers', () => {
  it('resistive divider: node voltage exact to 0.1%', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-ng-'));
    const cir = [
      '* divider', 'V1 vin 0 DC 5', 'R1 vin mid 1k', 'R2 mid 0 1k',
      '.control', 'op', 'print v(mid)', '.endc', '.end', '',
    ].join('\n');
    const run = await runNgspice(dir, 'divider', cir);
    expect(run.outcome.converged).toBe(true);
    const op = parseOpOutput(run.stdout);
    expect(op.get('v(mid)')).toBeCloseTo(2.5, 3);
  });

  it('LED with series resistor: current within 5% of hand calculation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-ng-'));
    const cir = [
      '* led branch', 'V1 vcc 0 DC 5', 'R1 vcc a 220',
      'D1 a 0 DLED', '.model DLED D(Is=1e-20 N=2.857)',
      '.control', 'op', 'print i(V1)', '.endc', '.end', '',
    ].join('\n');
    const run = await runNgspice(dir, 'led', cir);
    expect(run.outcome.converged).toBe(true);
    const op = parseOpOutput(run.stdout);
    const amps = Math.abs(op.get('i(v1)') ?? 0);
    // Hand calculation: (5 − 2) / 220 ≈ 13.6 mA.
    expect(amps).toBeGreaterThan(0.0136 * 0.95);
    expect(amps).toBeLessThan(0.0136 * 1.15);
  });
});

describe.skipIf(available)('without ngspice', () => {
  it('runNgspice throws a clear, actionable error', async () => {
    await expect(runNgspice('/tmp', 'x', '.end')).rejects.toThrow(/ngspice is not installed/);
  });
});
