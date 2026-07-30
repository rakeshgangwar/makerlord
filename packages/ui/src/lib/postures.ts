/**
 * Four postures, not seventeen modes (UI spec §3). Each is a layout and a
 * set of interaction defaults, not a separate app.
 */
export type Posture = 'converse' | 'inspect' | 'bench' | 'decide';

const POSTURE_BY_STAGE: Record<number, Posture> = {
  1: 'converse', 2: 'converse', 3: 'converse', 4: 'converse',
  5: 'inspect', 9: 'inspect', 10: 'inspect',
  6: 'bench', 7: 'bench', 8: 'bench', 13: 'bench',
  11: 'decide', 12: 'decide', 14: 'decide', 15: 'decide',
  16: 'converse',
  17: 'decide',
};

export function postureFor(stage: number): Posture {
  const posture = POSTURE_BY_STAGE[stage];
  if (!posture) throw new Error(`no posture for stage ${stage} — stages are 1..17`);
  return posture;
}

export type Region = 'conversation' | 'workspace' | 'artifacts' | 'findingStrip';

export interface LayoutState {
  visible: Region[];
  /** Below ~700 px only the posture's primary region survives — plus the strip. */
  primary: Region;
  findingStripMode: 'full' | 'summary';
}

/**
 * §4: responsive regions. The finding strip NEVER collapses — it shrinks to
 * a severity summary and expands on tap, but it is never absent. A layout in
 * which a BLOCKER can be off-screen is a layout we don't ship.
 */
export function layoutFor(posture: Posture, widthPx: number): LayoutState {
  const primary: Region =
    posture === 'converse' ? 'conversation'
    : posture === 'inspect' ? 'workspace'
    : posture === 'bench' ? 'workspace'
    : 'workspace';

  if (widthPx < 700) {
    return { visible: [primary, 'findingStrip'], primary, findingStripMode: 'summary' };
  }
  if (widthPx < 1100) {
    return {
      visible: ['conversation', 'workspace', 'findingStrip'],
      primary,
      findingStripMode: 'full',
    };
  }
  return {
    visible: ['conversation', 'workspace', 'artifacts', 'findingStrip'],
    primary,
    findingStripMode: 'full',
  };
}

export interface StageRailEntry {
  stage: number;
  phase: 1 | 2 | 3 | 4;
  state: 'not-started' | 'in-progress' | 'complete' | 'blocked';
}

/**
 * Where the project actually is, inferred from its facets. The rail follows
 * this unless the maker pins a stage by clicking — a map that keeps up,
 * still never a wizard.
 */
export function inferStage(project: {
  feasibility?: unknown;
  requirements: unknown[];
  architecture: { blocks: unknown[] };
  circuit?: { parts: { placement?: unknown }[] };
} | null): number {
  if (!project) return 1;
  if (project.circuit) {
    const placed = project.circuit.parts.some((p) => p.placement !== undefined);
    return placed ? 6 : 5;
  }
  if (project.architecture.blocks.length > 0) return 4;
  if (project.requirements.length > 0) return 3;
  if (project.feasibility) return 2;
  return 1;
}

/** The rail is a map, not a wizard — makers loop and backtrack. */
export function stagePhase(stage: number): 1 | 2 | 3 | 4 {
  if (stage <= 4 || stage === 6) return 1;
  if (stage === 5 || stage === 7 || stage === 8) return 2;
  if (stage >= 9 && stage <= 12) return 3;
  return 4;
}

/** One line per stage: what talking/working here produces. Rendered as
 *  the empty-state so no stage ever opens onto a bare composer. */
export const STAGE_PURPOSE: Record<number, string> = {
  1: 'Say what you want to make — the project takes shape from your words.',
  2: 'Ask whether it can work — the verdict comes back with reasons and numbers.',
  3: 'Pin down what "done" means — requirements with units, not vibes.',
  4: 'Sketch the blocks and how they connect — parts come later.',
  5: 'Run the circuit on the virtual bench before touching hardware.',
  6: 'Build it for real — one safety-ordered step at a time.',
  7: 'Firmware from the circuit, never past it — pins derive from wiring.',
  8: 'One measurement at a time until the fault has nowhere left to hide.',
  9: 'From breadboard to board — the PCB stage arrives in a later release.',
  10: 'Enclosures and mounting — the mechanical stage arrives in a later release.',
  11: 'Choosing how it gets made — arrives in a later release.',
  12: 'Getting it fabricated — arrives in a later release.',
  13: 'Checking the first one built — arrives in a later release.',
  14: 'Proving it works every time — arrives in a later release.',
  15: 'Meeting the rules it must meet — arrives in a later release.',
  16: 'Writing it down so others can build it — arrives in a later release.',
  17: 'Making more than one — arrives in a later release.',
};
