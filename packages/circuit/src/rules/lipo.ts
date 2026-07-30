import { profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';

/**
 * The classic hobby fire: a bare LiPo feeding a circuit directly. No
 * charge control means over-charge; no protection means over-discharge
 * puffs it and a short torches it. A cell whose profile carries
 * hazardClass 'lipo' may reach ONLY parts hand-marked `managesLipo`
 * (the charger/protection module) — anything else on its nets is a
 * BLOCKER. Both marks are hand-authored curation (verified provenance),
 * so the BLOCKER stands on datasheets, not vibes.
 */
export const lipoUnmanagedRule: Rule = {
  id: 'RULE_LIPO_UNMANAGED',
  severity: 'BLOCKER',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];

    for (const cell of ctx.circuit.parts) {
      if (profileFor(ctx, cell.ref)?.hazardClass !== 'lipo') continue;

      const cellNets = ctx.nets.filter((n) =>
        n.pins.some((p) => p.ref === cell.ref));

      for (const n of cellNets) {
        const strangers = [...new Set(
          n.pins
            .filter((p) => p.ref !== cell.ref)
            .map((p) => p.ref),
        )].filter((ref) => profileFor(ctx, ref)?.managesLipo !== true);
        if (strangers.length === 0) continue;

        out.push({
          ruleId: 'RULE_LIPO_UNMANAGED',
          severity: 'BLOCKER',
          message:
            `LiPo cell ${cell.ref} connects directly to ${strangers.join(', ')} ` +
            'with no charge/protection module in between — over-discharge ' +
            'and shorts on a bare cell are a fire risk, not a glitch',
          affected: { nets: [n.id], parts: [cell.ref, ...strangers] },
          suggestedFix:
            'wire the cell ONLY to a charger/protection module (its B+/B- ' +
            'terminals); every load takes power from the module\'s output side',
        });
      }
    }
    return out;
  },
};
