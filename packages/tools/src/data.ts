import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Bundle, HoleGrid, PartDefinition, SafetyProfile } from '@makerlord/parts';
import { buildBundle, listCorePartFiles, loadPart, loadProfiles, loadProposals, type PartTier } from '@makerlord/parts';
import type { Board } from '@makerlord/circuit';
import { makeBoard } from '@makerlord/circuit';

/**
 * The engine's reference data: the curated bundle (parts + safety profiles)
 * and the breadboard. Loaded once per process; paths overridable for tests.
 */
export function curatedPath(): string {
  return resolve(process.env.MAKERLORD_CURATED_PATH ?? './data/curated.json');
}

export function boardGridPath(): string {
  return resolve(
    process.env.MAKERLORD_BOARD_GRID_PATH ?? './data/boards/half-breadboard.json',
  );
}

let cachedBundle: Bundle | undefined;
let cachedBoard: Board | undefined;

export function resetDataCache(): void {
  cachedBundle = undefined;
  cachedBoard = undefined;
  cachedGeometryIndex = undefined;
}

export function bundle(): Bundle {
  if (!cachedBundle) {
    const curated = JSON.parse(readFileSync(curatedPath(), 'utf8')) as {
      file: string;
      partId: string;
    }[];
    cachedBundle = buildBundle(curated, loadProfiles(), undefined, loadProposals());
  }
  return cachedBundle;
}

/** D50: tier is location. verified/sourced from the bundle; anything
 *  else in the corpus is geometry — browse-only, never in a circuit. */
export function tierOf(partId: string): PartTier | 'geometry' {
  return bundle().tiers[partId] ?? 'geometry';
}

export interface GeometryHit {
  id: string;
  title: string;
  family: string;
  file: string;
}

let cachedGeometryIndex: GeometryHit[] | undefined;

/** The whole-corpus browse index (~1,800 parts) — built lazily, once. */
export function geometryIndex(): GeometryHit[] {
  if (!cachedGeometryIndex) {
    const hits: GeometryHit[] = [];
    for (const file of listCorePartFiles()) {
      try {
        const def = loadPart(file);
        hits.push({ id: def.id, title: def.title, family: def.family, file });
      } catch { /* unparseable corpus stragglers are not browsable */ }
    }
    cachedGeometryIndex = hits;
  }
  return cachedGeometryIndex;
}

export function board(): Board {
  if (!cachedBoard) {
    const grid = JSON.parse(readFileSync(boardGridPath(), 'utf8')) as HoleGrid;
    cachedBoard = makeBoard('half', grid, loadPart('core/halfBreadboard.fzp'));
  }
  return cachedBoard;
}

export function defsMap(): ReadonlyMap<string, PartDefinition> {
  return new Map(Object.entries(bundle().parts));
}

export function profilesMap(): ReadonlyMap<string, SafetyProfile> {
  return new Map(Object.entries(bundle().profiles));
}
