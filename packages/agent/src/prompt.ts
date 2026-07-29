import type { Finding } from '@makerlord/circuit';
import type { Bundle } from '@makerlord/parts';
import type { PersonaPack } from './persona.js';
import { activePersona, personaNames } from './persona.js';

/**
 * The always-on epistemic stance (D38). The full fable-guide chapters become
 * persona prose per stage; this spine is the distilled, stage-independent
 * core. It is part of the STABLE prefix and must never vary per session.
 */
export const FABLE_GUIDE_SPINE = `# Operating stance
- Claims, not vibes: route claims through ground truth, away from your own sense of plausibility.
- The rules adjudicate; you explain. A Finding is engine fact — you may not soften, summarise away, or argue past it.
- Track known vs guessed: label estimates as estimates, assumptions as assumptions.
- The check is cheaper than the correction: prefer a measurement to a debate.
- Attack your own conclusion before presenting it.
- Answer first, then risk, then detail.`;

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface PromptInputs {
  pack: PersonaPack;
  stage: number;
  bundle: Bundle;
  projectSummary: string;
  openFindings: Finding[];
}

/** Families and counts only — 1,794 parts never enter a prompt whole (§6). */
export function corpusDigest(bundle: Bundle): string {
  const byFamily = new Map<string, number>();
  for (const part of Object.values(bundle.parts)) {
    byFamily.set(part.family, (byFamily.get(part.family) ?? 0) + 1);
  }
  const families = [...byFamily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, count]) => `${family} (${count})`)
    .join(', ');
  return `# Part library\nCurated families: ${families}.\nUse parts_search then parts_get — parts cannot be invented.`;
}

/**
 * Assembled for the cache boundary, not readability (spec §6):
 * stable (spine → persona → digest) | breakpoint | volatile (project → findings → conversation lives in messages).
 * Never interpolate a timestamp, project id or session id into the stable prefix.
 */
export function assemblePrompt(inputs: PromptInputs): SystemBlock[] {
  const persona = activePersona(inputs.pack, inputs.stage);
  const names = personaNames(inputs.pack);

  const stable = [
    FABLE_GUIDE_SPINE,
    persona ?? `# Stage ${inputs.stage}\nNo persona file for this stage yet; hold the operating stance.`,
    names.length > 0 ? `# Other stage personas (names only)\n${names.join('\n')}` : '',
    corpusDigest(inputs.bundle),
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

  // Findings are re-injected every turn from ENGINE state, not carried in
  // conversation — six turns of arguing does not erode a BLOCKER (D3).
  const findingLines =
    inputs.openFindings.length === 0
      ? 'No open findings.'
      : inputs.openFindings
          .map((f) => `${f.severity} ${f.ruleId}: ${f.message}`)
          .join('\n');

  const volatile = [
    `# Project state\n${inputs.projectSummary}`,
    `# Open findings (engine state, authoritative)\n${findingLines}`,
  ].join('\n\n');

  return [
    { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatile },
  ];
}

/** The stable prefix alone — what the cache-stability test asserts on. */
export function stablePrefix(inputs: PromptInputs): string {
  return assemblePrompt(inputs)[0]!.text;
}
