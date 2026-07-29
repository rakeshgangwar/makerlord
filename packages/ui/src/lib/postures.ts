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

/** The rail is a map, not a wizard — makers loop and backtrack. */
export function stagePhase(stage: number): 1 | 2 | 3 | 4 {
  if (stage <= 4 || stage === 6) return 1;
  if (stage === 5 || stage === 7 || stage === 8) return 2;
  if (stage >= 9 && stage <= 12) return 3;
  return 4;
}
