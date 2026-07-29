import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { LadderOutcome, LadderRung } from './ladder.js';
import { climbLadder } from './ladder.js';

const execFileAsync = promisify(execFile);

export async function ngspiceAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ngspice', ['--version'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export interface RunArtifacts {
  runId: string;
  dir: string;
  cirPath: string;
  stdout: string;
  outcome: LadderOutcome<string>;
}

/**
 * Run a netlist through ngspice in batch mode, climbing the convergence
 * ladder. Integration-layer only: unit tests never touch this (spec §10).
 */
export async function runNgspice(
  projectDir: string,
  runId: string,
  cir: string,
): Promise<RunArtifacts> {
  if (!(await ngspiceAvailable())) {
    throw new Error(
      'ngspice is not installed — install it (e.g. apt install ngspice) to ' +
        'run simulations. Netlist generation and parsing work without it.',
    );
  }

  const dir = join(projectDir, 'sim');
  mkdirSync(join(dir, 'results'), { recursive: true });
  const cirPath = join(dir, 'circuit.cir');

  let lastStdout = '';
  const outcome = await climbLadder<string>(async (rung: LadderRung) => {
    const patched = cir.replace(
      '.end',
      `${rung.options.join('\n')}\n.end`,
    );
    writeFileSync(cirPath, patched);
    try {
      const { stdout, stderr } = await execFileAsync(
        'ngspice', ['-b', cirPath],
        { timeout: 60_000, cwd: dir },
      );
      lastStdout = stdout + stderr;
      const failed = /no convergence|singular matrix|analysis.*failed|error/i.test(
        lastStdout,
      );
      return failed ? null : lastStdout;
    } catch (e) {
      lastStdout = e instanceof Error ? e.message : String(e);
      return null;
    }
  });

  return { runId, dir, cirPath, stdout: outcome.result ?? lastStdout, outcome };
}

export function writeReport(
  dir: string,
  runId: string,
  lines: string[],
): string {
  const path = join(dir, 'report.md');
  writeFileSync(path, [`# Simulation report — ${runId}`, '', ...lines, ''].join('\n'));
  return path;
}
