import { netRole, profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';

export const POSITIVE_PINS: readonly string[] = ['anode', '+', 'vin', 'vcc'];
export const NEGATIVE_PINS: readonly string[] = ['cathode', '-', 'gnd'];

export const polarityRule: Rule = {
  id: 'RULE_POLARIZED_PART_REVERSED',
  severity: 'BLOCKER',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];

    for (const part of ctx.circuit.parts) {
      if (profileFor(ctx, part.ref)?.polarity !== 'polarized') continue;

      let positiveOn: 'gnd' | 'supply' | 'signal' | undefined;
      let negativeOn: 'gnd' | 'supply' | 'signal' | undefined;

      for (const n of ctx.nets) {
        for (const p of n.pins) {
          if (p.ref !== part.ref) continue;
          const name = p.pin.toLowerCase();
          if (POSITIVE_PINS.includes(name)) positiveOn = netRole(ctx, n);
          if (NEGATIVE_PINS.includes(name)) negativeOn = netRole(ctx, n);
        }
      }

      if (positiveOn === 'gnd' && negativeOn === 'supply') {
        out.push({
          ruleId: 'RULE_POLARIZED_PART_REVERSED',
          severity: 'BLOCKER',
          message:
            `${part.ref} is fitted backwards — its positive lead is on ground ` +
            'and its negative lead is on the supply rail.',
          affected: { parts: [part.ref] },
          suggestedFix:
            `Pull ${part.ref} out and turn it around. On an LED the longer leg ` +
            'is the anode and goes towards the positive rail; the flat notch on ' +
            'the rim marks the cathode.',
        });
      }
    }

    return out;
  },
};
