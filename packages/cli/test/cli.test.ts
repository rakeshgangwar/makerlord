import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgv } from '../src/main.js';

const BIN = resolve('packages/cli/dist/main.js');
const REPO = resolve('.');

interface RunOut {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], cwd: string): RunOut {
  try {
    const stdout = execFileSync('node', [BIN, ...args], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        MAKERLORD_FRITZING_PATH: join(REPO, 'vendor/fritzing-parts'),
        MAKERLORD_PROFILES_PATH: join(REPO, 'data/profiles'),
        MAKERLORD_CURATED_PATH: join(REPO, 'data/curated.json'),
        MAKERLORD_BOARD_GRID_PATH: join(REPO, 'data/boards/half-breadboard.json'),
      },
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { status: err.status, stdout: String(err.stdout), stderr: String(err.stderr) };
  }
}

describe('parseArgv', () => {
  it('maps subcommand paths onto registry names', () => {
    expect(parseArgv(['req', 'propose', '--value', '6']).toolName).toBe('req_propose');
    expect(parseArgv(['project', 'init', '--intent', 'x']).toolName).toBe('project_init');
  });

  it('coerces JSON-looking values and keeps strings as strings', () => {
    const p = parseArgv(['req', 'propose', '--value', '6', '--unit', 'months']);
    expect(p.input.value).toBe(6);
    expect(p.input.unit).toBe('months');
  });

  it('parses nested JSON for object flags', () => {
    const p = parseArgv(['block', 'sourcing', '--id', 'b', '--sourcing',
      '{"type":"buy","partId":"x"}']);
    expect(p.input.sourcing).toEqual({ type: 'buy', partId: 'x' });
  });

  it('extracts --project and --expect-hash without passing them to the tool', () => {
    const p = parseArgv(['project', 'status', '--project', '/tmp/p.json',
      '--expect-hash', 'abc']);
    expect(p.project).toBe('/tmp/p.json');
    expect(p.expectHash).toBe('abc');
    expect(p.input).toEqual({});
  });
});

describe('maker CLI subprocess — the three exit codes', () => {
  it('success exits 0 with ok:true JSON on stdout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-cli-'));
    const init = run(['project', 'init', '--intent', 'a lamp'], dir);
    expect(init.status).toBe(0);
    expect(JSON.parse(init.stdout)).toMatchObject({ ok: true });

    const status = run(['project', 'status'], dir);
    expect(status.status).toBe(0);
    const parsed = JSON.parse(status.stdout) as { ok: boolean; data: { intent: string } };
    expect(parsed.data.intent).toBe('a lamp');
  });

  it('REFUSAL exits 0 — the tool did its job', () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-cli-'));
    run(['project', 'init', '--intent', 'x'], dir);
    run(['block', 'add', '--id', 'psu', '--name', 'psu'], dir);
    const out = run(['expand'], dir);
    expect(out.status).toBe(0);
    expect(JSON.parse(out.stdout)).toMatchObject({
      ok: false,
      refused: 'BLOCK_UNDECIDED',
    });
  });

  it('error exits 1 with JSON on stderr', () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-cli-'));
    const out = run(['project', 'status'], dir);   // no project.json anywhere? repo has none in tmp
    expect(out.status).toBe(1);
    expect(JSON.parse(out.stderr)).toHaveProperty('error');
  });

  it('unknown command errors with exit 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'makerlord-cli-'));
    const out = run(['frobnicate'], dir);
    expect(out.status).toBe(1);
    expect(JSON.parse(out.stderr).error).toMatch(/unknown command/);
  });

  it('help lists the catalogue and exits 0', () => {
    const out = run(['help'], mkdtempSync(join(tmpdir(), 'makerlord-cli-')));
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('req propose');
    expect(out.stdout).toContain('gate open');
  });
});
