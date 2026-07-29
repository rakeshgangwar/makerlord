import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseFzp } from './fzp/parse.js';
import { normalize } from './normalize.js';
import type { PartDefinition } from './types.js';

export function corpusRoot(): string {
  return resolve(process.env.MAKERLORD_FRITZING_PATH ?? './vendor/fritzing-parts');
}

export function listCorePartFiles(root: string = corpusRoot()): string[] {
  return readdirSync(join(root, 'core'))
    .filter((f) => f.endsWith('.fzp'))
    .map((f) => join('core', f))
    .sort();
}

export function loadPart(file: string, root: string = corpusRoot()): PartDefinition {
  return normalize(parseFzp(readFileSync(join(root, file), 'utf8')));
}

export interface CorpusLoad {
  parts: PartDefinition[];
  failures: { file: string; error: string }[];
}

export function loadCorpus(root: string = corpusRoot()): CorpusLoad {
  const parts: PartDefinition[] = [];
  const failures: { file: string; error: string }[] = [];
  for (const file of listCorePartFiles(root)) {
    try {
      parts.push(loadPart(file, root));
    } catch (e) {
      failures.push({ file, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { parts, failures };
}
