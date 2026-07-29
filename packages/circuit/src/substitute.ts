import type { SafetyProfile } from '@makerlord/parts';
import { makeContext } from './rules/context.js';
import type { Finding, RuleContext } from './rules/engine.js';
import { runRules } from './rules/engine.js';
import { ALL_RULES } from './rules/index.js';
import type { DcPrediction } from './solve/dc.js';
import { predictDc } from './solve/dc.js';

export interface SubstitutionVerdict {
  accepted: boolean;
  introduced: Finding[];
  resolved: Finding[];
  before: DcPrediction;
  after: DcPrediction;
}

function key(f: Finding): string {
  return `${f.ruleId}|${f.message}`;
}

/**
 * Answers "can I use what I already own?" by swapping the candidate profile in
 * and re-running the very same rules that gate the build, so the two can never
 * disagree.
 */
export function checkSubstitution(
  ctx: RuleContext,
  defId: string,
  candidate: SafetyProfile,
): SubstitutionVerdict {
  const swapped = new Map(ctx.profiles);
  swapped.set(defId, candidate);

  const after = makeContext(
    ctx.board,
    ctx.circuit,
    ctx.nets,
    ctx.divergences,
    ctx.defs,
    swapped,
  );

  const beforeFindings = runRules(ALL_RULES, ctx);
  const afterFindings = runRules(ALL_RULES, after);

  const beforeKeys = new Set(beforeFindings.map(key));
  const afterKeys = new Set(afterFindings.map(key));

  const introduced = afterFindings.filter((f) => !beforeKeys.has(key(f)));
  const resolved = beforeFindings.filter((f) => !afterKeys.has(key(f)));

  return {
    accepted: !introduced.some(
      (f) => f.severity === 'BLOCKER' || f.severity === 'REFUSE',
    ),
    introduced,
    resolved,
    before: predictDc(ctx),
    after: predictDc(after),
  };
}
