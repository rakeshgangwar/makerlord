import type { Circuit } from '@makerlord/circuit';
import type { Block, BlockLink } from './architecture/types.js';
import type { Feasibility } from './feasibility/types.js';
import type { Requirement } from './requirements/types.js';

export interface InventoryItem {
  partId?: string;
  freeText?: string;
  quantity?: number;
}

export interface Project {
  intent: string;
  inventory: InventoryItem[];
  feasibility?: Feasibility;
  requirements: Requirement[];
  architecture: { blocks: Block[]; links: BlockLink[] };
  circuit?: Circuit;
}

export function emptyProject(intent: string): Project {
  if (intent.trim().length === 0) {
    throw new Error('emptyProject: intent must not be blank');
  }
  return {
    intent,
    inventory: [],
    requirements: [],
    architecture: { blocks: [], links: [] },
  };
}
