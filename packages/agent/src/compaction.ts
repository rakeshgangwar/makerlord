import type { Finding } from '@makerlord/circuit';
import type { CountableMessage } from './context.js';
import { totalPressure } from './context.js';
import { labelUntrusted } from './untrusted.js';

/**
 * Compaction is gated on contextPressureBytes, never estimatedBytes — that
 * is the entire point of the two-measure split (spec §5).
 *
 * Bench sessions get an extra guarantee: whatever else is compacted, the
 * current build step, the open findings, and the last three measurements
 * stay verbatim in the tail. Losing the measurement the maker just took is
 * a safety bug, not a UX one.
 */
export interface ProtectedState {
  currentStep?: { index: number; instruction: string };
  openFindings: Finding[];
  measurements: { name: string; value: number; unit: string }[];
}

export interface CompactionResult {
  messages: CountableMessage[];
  compacted: boolean;
}

export function shouldCompact(
  messages: CountableMessage[],
  pressureLimitBytes: number,
): boolean {
  return totalPressure(messages) > pressureLimitBytes;
}

export function protectedTail(state: ProtectedState): string {
  const lines: string[] = ['## Live bench state (never compacted)'];
  if (state.currentStep) {
    lines.push(
      `Current build step ${state.currentStep.index}: ${state.currentStep.instruction}`,
    );
  }
  for (const f of state.openFindings) {
    lines.push(`OPEN ${f.severity} ${f.ruleId}: ${f.message}`);
  }
  for (const m of state.measurements.slice(-3)) {
    lines.push(`Measured ${m.name}: ${m.value} ${m.unit}`);
  }
  return lines.join('\n');
}

/**
 * Local compaction: keep the most recent messages under the limit, replace
 * the head with a lossy-labelled summary block, and append the protected
 * tail verbatim. (Server-side compaction — beta compact-2026-01-12 — slots
 * in here later; the gating and the tail guarantee are what this owns.)
 */
export function compact(
  messages: CountableMessage[],
  state: ProtectedState,
  pressureLimitBytes: number,
): CompactionResult {
  if (!shouldCompact(messages, pressureLimitBytes)) {
    return { messages, compacted: false };
  }

  const kept: CountableMessage[] = [];
  let pressure = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]!;
    const p = totalPressure([msg]);
    if (pressure + p > pressureLimitBytes / 2) break;
    kept.unshift(msg);
    pressure += p;
  }

  // The cut must never orphan a tool_result from its tool_use: a window
  // whose head carries results for dropped calls is an invalid
  // conversation the API rejects outright (observed live on a heavy
  // research turn). Any results-bearing head IS an orphan — its
  // assistant partner sits before the window by construction.
  const carriesToolResults = (m: CountableMessage): boolean =>
    Array.isArray(m.content) &&
    (m.content as { type?: string }[]).some((b) => b.type === 'tool_result');
  while (kept.length > 0 && carriesToolResults(kept[0]!)) kept.shift();
  // Likewise a head assistant message whose tool_use has no following
  // result would dangle — but by construction results follow their calls,
  // so an assistant head keeps its pair inside the window.

  // Degenerate case: everything recent was orphaned results (a single
  // giant round). Keep the final messages and pull their calls in even
  // over budget — an over-budget request is survivable, an invalid
  // conversation is fatal.
  if (kept.length === 0) {
    let j = messages.length - 1;
    kept.push(messages[j]!);
    j -= 1;
    while (carriesToolResults(kept[0]!) && j >= 0) {
      kept.unshift(messages[j]!);
      j -= 1;
    }
  }

  const dropped = messages.length - kept.length;
  const summary: CountableMessage = {
    role: 'user',
    content: labelUntrusted(
      'compacted',
      `${dropped} earlier message(s) were compacted.\n${protectedTail(state)}`,
    ),
  };

  return { messages: [summary, ...kept], compacted: true };
}
