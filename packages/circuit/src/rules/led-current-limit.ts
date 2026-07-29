import { profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';

/** Assume a 5 V rail when sizing the suggested resistor. */
const ASSUMED_RAIL_V = 5;

export const ledCurrentLimitRule: Rule = {
  id: 'RULE_LED_NO_CURRENT_LIMIT',
  severity: 'BLOCKER',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];

    for (const part of ctx.circuit.parts) {
      const profile = profileFor(ctx, part.ref);
      if (profile?.forwardVoltageV === undefined) continue;

      const netsWithLed = ctx.nets.filter((n) =>
        n.pins.some((p) => p.ref === part.ref),
      );
      if (netsWithLed.length === 0) continue;

      const protectedByResistor = netsWithLed.some((n) =>
        n.pins.some((p) => {
          if (p.ref === part.ref) return false;
          return profileFor(ctx, p.ref)?.resistanceOhms !== undefined;
        }),
      );
      if (protectedByResistor) continue;

      const vf = profile.forwardVoltageV;
      const ima = profile.maxCurrentMa ?? 20;
      const ohms = Math.round(((ASSUMED_RAIL_V - vf) / (ima / 1000)) / 10) * 10;

      out.push({
        ruleId: 'RULE_LED_NO_CURRENT_LIMIT',
        severity: 'BLOCKER',
        message:
          `${part.ref} has no series resistor. An LED is not a resistor — ` +
          'connected directly it draws whatever the supply can give and burns out.',
        affected: { parts: [part.ref], nets: netsWithLed.map((n) => n.id) },
        suggestedFix:
          `Add a resistor in series with ${part.ref}. At ${ASSUMED_RAIL_V} V with a ` +
          `${vf} V forward drop and a ${ima} mA limit you need about ` +
          `(${ASSUMED_RAIL_V} − ${vf}) / ${ima / 1000} ≈ ${ohms} Ω.`,
      });
    }

    return out;
  },
};
