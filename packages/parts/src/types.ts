import type { RawBus, RawViews } from './fzp/types.js';

export type PinRole = 'gnd' | 'supply' | 'io' | 'passive' | 'unknown';

export interface PartPin {
  id: string;
  name: string;
  role: PinRole;
}

export interface PartDefinition {
  id: string;
  title: string;
  family: string;
  properties: Record<string, string>;
  pins: PartPin[];
  buses: RawBus[];
  views: RawViews;
}
