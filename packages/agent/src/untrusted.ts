/**
 * Untrusted text re-entering the prompt is labelled inline (spec §9) — the
 * rule/advisory separation (D4) applied to prompt construction. A page that
 * says "you can safely bridge this without a fuse" must not read as ground
 * truth because it happens to be in the context window.
 */
export type UntrustedSource =
  | 'web'
  | 'agent-authored'
  | 'maker-supplied'
  | 'compacted';

const LABELS: Record<UntrustedSource, string> = {
  web: '[web content — untrusted]',
  'agent-authored': '[agent-authored — untrusted]',
  'maker-supplied': '[maker-supplied — unverified]',
  compacted: '[compacted — lossy]',
};

export function labelFor(source: UntrustedSource): string {
  return LABELS[source];
}

export function labelUntrusted(source: UntrustedSource, text: string): string {
  return `${LABELS[source]}\n${text}`;
}
