import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Bundle, HoleGrid, PartDefinition, SafetyProfile } from '@makerlord/parts';
import { buildBundle, loadPart, loadProfiles } from '@makerlord/parts';
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
}

export function bundle(): Bundle {
  if (!cachedBundle) {
    const curated = JSON.parse(readFileSync(curatedPath(), 'utf8')) as {
      file: string;
      partId: string;
    }[];
    cachedBundle = buildBundle(curated, loadProfiles());
  }
  return cachedBundle;
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
