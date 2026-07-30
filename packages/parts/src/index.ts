export const PACKAGE_NAME = '@makerlord/parts';

export { parseFzp } from './fzp/parse.js';
export type { RawBus, RawConnector, RawFzp, RawPin, RawViews } from './fzp/types.js';
export { classifyPinRole, normalize, parseUnitValue } from './normalize.js';
export type { PartDefinition, PartPin, PinRole } from './types.js';
export { corpusRoot, listCorePartFiles, loadCorpus, loadPart } from './corpus.js';
export { loadProfiles, parseProfile, profileSchema, profilesDir } from './profile.js';
export type { Footprint, HazardClass, SafetyProfile } from './profile.js';
export { extractHoleGrid } from './board-grid.js';
export type { HoleGrid } from './board-grid.js';
export { buildBundle, validateBundle } from './bundle.js';
export type { Bundle, CuratedEntry } from './bundle.js';
export * from './proposals.js';
export * from './datasheets.js';
