import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Firmware } from '@makerlord/project';
import type { SafetyProfile } from '@makerlord/parts';
import { renderPinsH } from './pins.js';
import { mergeApplicationRegion, renderMainCpp } from './scaffold.js';

const execFileAsync = promisify(execFile);

/** Slice 1 (D13): curated libraries only, pinned in the toolchain image.
 *  The full resolution chain (registry → headers → compile-verify →
 *  promote) is a named deferral. */
export const CURATED_LIBRARIES: readonly string[] = [
  'DHT sensor library@1.4.6',
  'Servo@1.2.2',
];

const LOG_LIMIT = 64 * 1024;
const COMPILE_TIMEOUT_MS = 180_000;

export async function arduinoCliAvailable(): Promise<boolean> {
  try {
    await execFileAsync('arduino-cli', ['version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export interface CompileResult {
  ok: boolean;
  /** Compiler output, verbatim, size-bounded — retriable data, never a
   *  Finding: a compile error is the arbiter speaking (D13), not a rule. */
  log: string;
  /** Present only when compilation succeeded. */
  binPath?: string;
}

function clip(text: string): string {
  return text.length > LOG_LIMIT
    ? `${text.slice(0, LOG_LIMIT)}\n… [log clipped at 64 kB]`
    : text;
}

/** Project the firmware sources into a sketch directory. arduino-cli
 *  wants the .ino named after its folder; ours only includes the real
 *  sources so pins.h/main.cpp stay the canonical projections. */
export function writeSketch(
  dir: string,
  fw: Firmware,
  fqbn: string,
  applicationRegion = '',
): { sketchDir: string } {
  const sketchDir = join(dir, 'firmware');
  mkdirSync(sketchDir, { recursive: true });
  writeFileSync(join(sketchDir, 'pins.h'), renderPinsH(fw.roles, fqbn));
  const scaffold = renderMainCpp(fw);
  writeFileSync(
    join(sketchDir, 'main.cpp'),
    applicationRegion.length > 0
      ? mergeApplicationRegion(scaffold, applicationRegion)
      : scaffold,
  );
  writeFileSync(
    join(sketchDir, 'firmware.ino'),
    '// arduino-cli entry — the real sources are pins.h and main.cpp\n',
  );
  return { sketchDir };
}

/**
 * The compile gate (spec §5): arduino-cli against the curated fqbn. It
 * either produced firmware.bin or it said exactly why not — "it
 * compiled, therefore the API is real" is the whole guarantee.
 */
export async function compileFirmware(
  sketchDir: string,
  profile: SafetyProfile,
): Promise<CompileResult> {
  if (profile.fqbn === undefined) {
    throw new Error(`compile: profile ${profile.partId} has no fqbn — not an MCU`);
  }
  if (!(await arduinoCliAvailable())) {
    throw new Error(
      'arduino-cli is not installed — the compile gate needs it. ' +
      'Codegen, rules and lint work without it.',
    );
  }
  const buildDir = join(sketchDir, 'build');
  try {
    const { stdout, stderr } = await execFileAsync(
      'arduino-cli',
      ['compile', '--fqbn', profile.fqbn, '--output-dir', buildDir, sketchDir],
      { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
    );
    const bin = existsSync(buildDir)
      ? readdirSync(buildDir).find((f) => f.endsWith('.bin') || f.endsWith('.hex'))
      : undefined;
    const result: CompileResult = { ok: true, log: clip(stdout + stderr) };
    if (bin !== undefined) result.binPath = join(buildDir, bin);
    return result;
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return {
      ok: false,
      log: clip(`${err.stdout ?? ''}${err.stderr ?? ''}` || err.message),
    };
  }
}
