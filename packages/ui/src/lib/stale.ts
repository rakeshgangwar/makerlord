/**
 * D34 means two writers (UI spec §10). Optimistic locking surfaces as a
 * specific, non-alarming state — not an error dialog, never a silent
 * overwrite. Git already solved divergence and we do not reimplement it.
 */
export interface StaleState {
  kind: 'stale-project';
  message: string;
  action: { label: string; effect: 'reload' };
  alarming: false;
}

export function staleProjectState(): StaleState {
  return {
    kind: 'stale-project',
    message: 'This project changed elsewhere — reload to see the latest.',
    action: { label: 'Reload', effect: 'reload' },
    alarming: false,
  };
}

export interface DivergedState {
  kind: 'diverged-tree';
  message: string;
  action: { label: string; effect: 'pull' };
  /** The web app never force-pushes. There is no such action to offer. */
  forcePushAvailable: false;
}

export function divergedTreeState(): DivergedState {
  return {
    kind: 'diverged-tree',
    message:
      'Your local clone and this project have diverged. Pull first — the web ' +
      'app will not overwrite work it cannot see.',
    action: { label: 'Pull first', effect: 'pull' },
    forcePushAvailable: false,
  };
}
