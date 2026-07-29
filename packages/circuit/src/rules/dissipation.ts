import { predictDc } from '../solve/dc.js';
import { profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';

/** Breadboard spring contacts are a rule of thumb, not a datasheet figure. */
export const BREADBOARD_MAX_A = 1.5;

export const resistorDissipationRule: Rule = {
  id: 'RULE_RESISTOR_DISSIPATION',
  severity: 'WARNING',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];
    const dc = predictDc(ctx);

    for (const branch of dc.branches) {
      for (const ref of branch.parts) {
        const profile = profileFor(ctx, ref);
        const ohms = profile?.resistanceOhms;
        const rating = profile?.powerRatingW;
        if (ohms === undefined || rating === undefined) continue;

        const amps = branch.currentMa / 1000;
        const watts = amps * amps * ohms;
        if (watts <= rating) continue;

        out.push({
          ruleId: 'RULE_RESISTOR_DISSIPATION',
          severity: 'WARNING',
          message:
            `${ref} would dissipate about ${watts.toFixed(2)} W but is rated for ` +
            `${rating} W. It will run hot, drift in value, and may scorch.`,
          affected: { parts: [ref] },
          suggestedFix:
            `Use a higher resistance to cut the current, or fit a resistor rated ` +
            `for at least ${(watts * 2).toFixed(1)} W.`,
        });
      }
    }

    return out;
  },
};

export const breadboardCurrentRule: Rule = {
  id: 'RULE_BREADBOARD_CURRENT',
  severity: 'WARNING',

  check(ctx: RuleContext): Finding[] {
    const dc = predictDc(ctx);
    const amps = dc.totalCurrentMa / 1000;
    if (amps <= BREADBOARD_MAX_A) return [];

    return [
      {
        ruleId: 'RULE_BREADBOARD_CURRENT',
        severity: 'WARNING',
        message:
          `This circuit would draw about ${amps.toFixed(2)} A. Breadboard rails ` +
          `and spring contacts are good for roughly ${BREADBOARD_MAX_A} A — above ` +
          'that they heat up, the contacts soften, and connections go intermittent.',
        affected: {},
        suggestedFix:
          'Move the high-current path off the breadboard: solder it, use screw ' +
          'terminals, or feed the load directly from the supply rather than ' +
          'through the rails.',
      },
    ];
  },
};
