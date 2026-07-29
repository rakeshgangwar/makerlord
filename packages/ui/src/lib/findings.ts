import type { Finding, Severity } from '@makerlord/circuit';
import type { ProvenanceBadge } from './severity.js';

export interface FindingCard {
  readonly finding: Finding;
  readonly provenance: ProvenanceBadge;
  /** Where the engine data came from — never 'agent-prose'. */
  readonly source: 'tool-result' | 'ui-check';
}

/**
 * The finding surface (UI spec §7). Populated ONLY by ToolResult payloads
 * carried verbatim through SessionEvent, and by the UI's own check_* calls.
 * The agent does not write it, cannot summarise it, cannot reorder it.
 *
 * THERE IS NO DISMISS. D3's Finding has no suppression field, the tool
 * surface has no dismiss_finding, and this store completes the line: a
 * blocker leaves the screen when the circuit changes and the rule stops
 * firing. That is the only way — reconcile() with fresh engine findings.
 */
export class FindingSurface {
  private cards: FindingCard[] = [];
  private announcements: string[] = [];

  /** Engine findings in, from a tool.end payload or a check_* call. */
  reconcile(
    findings: Finding[],
    source: FindingCard['source'],
    provenanceOf: (f: Finding) => ProvenanceBadge = () => 'computed',
  ): void {
    const before = new Set(this.cards.map((c) => c.finding.ruleId + c.finding.message));
    this.cards = findings
      .slice()
      .sort((a, b) => rank(a.severity) - rank(b.severity))
      .map((finding) => ({ finding, provenance: provenanceOf(finding), source }));
    // Findings are live regions: a NEW blocker is announced, not just drawn.
    for (const card of this.cards) {
      const key = card.finding.ruleId + card.finding.message;
      if (!before.has(key) && card.finding.severity === 'BLOCKER') {
        this.announcements.push(
          `New blocker: ${card.finding.ruleId}. ${card.finding.message}`,
        );
      }
    }
  }

  list(): readonly FindingCard[] {
    return this.cards;
  }

  /** The strip's collapsed form: a severity summary, never nothing. */
  summary(): { severity: Severity; count: number }[] {
    const counts = new Map<Severity, number>();
    for (const c of this.cards) {
      counts.set(c.finding.severity, (counts.get(c.finding.severity) ?? 0) + 1);
    }
    return [...counts.entries()].map(([severity, count]) => ({ severity, count }));
  }

  hasBlocker(): boolean {
    return this.cards.some(
      (c) => c.finding.severity === 'BLOCKER' || c.finding.severity === 'REFUSE',
    );
  }

  drainAnnouncements(): string[] {
    return this.announcements.splice(0);
  }
}

function rank(s: Severity): number {
  return { REFUSE: 0, BLOCKER: 1, WARNING: 2, NOTE: 3 }[s];
}
