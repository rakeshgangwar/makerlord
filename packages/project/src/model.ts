import type { Circuit } from '@makerlord/circuit';
import type { Block, BlockLink } from './architecture/types.js';
import type { Feasibility } from './feasibility/types.js';
import type { Firmware } from './firmware/types.js';
import type { Requirement } from './requirements/types.js';

export interface InventoryItem {
  partId?: string;
  freeText?: string;
  quantity?: number;
}

/**
 * The history facet (D29): what was tried, what failed, and why a part was
 * chosen — recorded as the project moves, because it cannot be retro-fitted.
 * The rejected options are the most valuable part; without them the next
 * person re-derives the same dead ends.
 */
export interface Decision {
  id: string;
  date: string;                 // YYYY-MM-DD, stamped when recorded
  title: string;
  decision: string;
  rejected: { option: string; reason: string }[];
  consequence?: string;
  stage?: number;               // 1–17, when the decision belongs to a stage
}

export interface Project {
  intent: string;
  inventory: InventoryItem[];
  feasibility?: Feasibility;
  requirements: Requirement[];
  architecture: { blocks: Block[]; links: BlockLink[] };
  circuit?: Circuit;
  firmware?: Firmware;
  /** Optional so pre-facet project files stay valid; treat absent as empty. */
  history?: Decision[];
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
