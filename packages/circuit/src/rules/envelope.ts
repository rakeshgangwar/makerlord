import { profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';
import { netVoltage } from './voltage.js';

export const MAX_SAFE_VOLTAGE = 48;

/**
 * Refused at EVERY tier. A breadboard has no creepage distance, spring contacts
 * rated ~1-2 A, and exposed conductors. No valve opens this.
 */
const BREADBOARD_FIX =
  'Mains never goes on a breadboard, at any experience level — there is no ' +
  'creepage distance and the contacts are exposed. Move the mains side onto a ' +
  'proper board with correct clearances, or better, use a sealed certified ' +
  'AC-DC module so you never design the mains side at all. I can help you ' +
  'pick one and design everything downstream of it.';

/** Refused until the maker opens a tier — but offer the valve, don't just close the door. */
const VALVE_FIX =
  'If you do need mains in this project, you can open the mains tier and I ' +
  'will help — with a stricter rule set covering clearance, creepage, fusing, ' +
  'earth bonding and isolation. Tier A (a certified AC-DC module, your own ' +
  'circuit entirely low-voltage) covers most products and is what I would ' +
  'recommend first.';

function isMains(ctx: RuleContext, ref: string): boolean {
  return profileFor(ctx, ref)?.hazardClass === 'mains';
}

export const envelopeRule: Rule = {
  id: 'RULE_OUT_OF_SAFE_ENVELOPE',
  severity: 'REFUSE',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];
    const tier = ctx.circuit.mainsTier ?? 'none';

    // Slice 1 builds on breadboards only, so any mains part here is the
    // absolute case. Phase 3 will pass a non-breadboard board id.
    const onBreadboard = true;

    const flagged = new Set<string>();
    const hazards: { ref?: string; net?: string; label: string }[] = [];

    for (const part of ctx.circuit.parts) {
      if (!isMains(ctx, part.ref) || flagged.has(part.ref)) continue;
      flagged.add(part.ref);
      hazards.push({ ref: part.ref, label: `${part.ref} carries mains voltage` });
    }

    for (const net of ctx.nets) {
      const v = netVoltage(ctx, net);
      if (v === undefined || v <= MAX_SAFE_VOLTAGE) continue;
      hazards.push({
        net: net.id,
        label: `net "${net.id}" runs at ${v} V, above the ${MAX_SAFE_VOLTAGE} V line`,
      });
    }

    for (const h of hazards) {
      const affected = h.ref ? { parts: [h.ref] } : { nets: [h.net!] };

      if (onBreadboard) {
        out.push({
          ruleId: 'RULE_OUT_OF_SAFE_ENVELOPE',
          severity: 'REFUSE',
          message: `Refused: ${h.label}, and this is a breadboard build.`,
          affected,
          suggestedFix: BREADBOARD_FIX,
        });
      } else if (tier === 'none') {
        out.push({
          ruleId: 'RULE_OUT_OF_SAFE_ENVELOPE',
          severity: 'REFUSE',
          message: `Refused: ${h.label}, and no mains tier is open on this project.`,
          affected,
          suggestedFix: VALVE_FIX,
        });
      }
      // Tier A/B/C on a non-breadboard board: allowed here, and handed to the
      // mains rule set (clearance, creepage, fusing, isolation) in Phase 3.
    }

    return out;
  },
};
