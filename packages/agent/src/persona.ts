import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Effort follows how expensive and how silent a mistake is (spec §7,
 * fable-guide ch. 03). Starting points to sweep, not conclusions.
 */
const EFFORT_BY_STAGE: Record<number, Effort> = {
  1: 'medium',   // idea
  4: 'xhigh',    // architecture
  6: 'xhigh',    // prototype
  8: 'xhigh',    // debug
  9: 'xhigh',    // pcb
  16: 'medium',  // document
};

export interface PersonaPack {
  defaults: { effort?: Effort; tone?: string };
  /** stage number → persona body; only the active stage's body is loaded. */
  personas: Map<number, { name: string; file: string }>;
  dir: string;
}

export function personasDir(projectDir: string): string {
  return join(projectDir, '.makerlord', 'personas');
}

const PERSONA_FILE = /^(\d{2})-(.+)\.persona\.md$/;

/** Discover the pack: manifest defaults plus one file per stage. */
export function loadPack(projectDir: string): PersonaPack {
  const dir = personasDir(projectDir);
  const pack: PersonaPack = { defaults: {}, personas: new Map(), dir };
  if (!existsSync(dir)) return pack;

  const manifest = join(dir, 'pack.json');
  if (existsSync(manifest)) {
    pack.defaults = (
      JSON.parse(readFileSync(manifest, 'utf8')) as { defaults?: PersonaPack['defaults'] }
    ).defaults ?? {};
  }
  for (const file of readdirSync(dir)) {
    const m = PERSONA_FILE.exec(file);
    if (!m) continue;
    pack.personas.set(Number(m[1]), { name: m[2]!, file: join(dir, file) });
  }
  return pack;
}

/** Progressive disclosure: the active stage's body; the others are names. */
export function activePersona(pack: PersonaPack, stage: number): string | undefined {
  const entry = pack.personas.get(stage);
  if (!entry) return undefined;
  return readFileSync(entry.file, 'utf8');
}

export function personaNames(pack: PersonaPack): string[] {
  return [...pack.personas.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stage, p]) => `${stage}: ${p.name}`);
}

export function effortFor(stage: number, pack?: PersonaPack): Effort {
  return pack?.defaults.effort ?? EFFORT_BY_STAGE[stage] ?? 'high';
}
