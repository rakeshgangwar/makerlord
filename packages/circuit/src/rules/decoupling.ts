import { profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';

/**
 * Digital modules yank supply current in nanosecond bursts; wire inductance
 * turns those bursts into rail dips, and rail dips into resets and flaky
 * behaviour that looks like anything but its cause. A ceramic capacitor
 * across the module's supply, close to the part, is the fix — cheap enough
 * that its absence is always worth a WARNING, never silence.
 *
 * "A module that computes" is one that declares a quiescent draw.
 */
export const decouplingRule: Rule = {
  id: 'RULE_DECOUPLING_MISSING',
  severity: 'WARNING',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];

    for (const part of ctx.circuit.parts) {
      const profile = profileFor(ctx, part.ref);
      if (profile?.quiescentMa === undefined) continue;
      const def = ctx.defs.get(part.defId);
      if (!def) continue;

      const supplyPinNames = def.pins
        .filter((p) => p.role === 'supply')
        .map((p) => p.name);
      const supplyNets = ctx.nets.filter((n) =>
        n.pins.some(
          (p) => p.ref === part.ref && supplyPinNames.includes(p.pin),
        ),
      );
      if (supplyNets.length === 0) continue;

      const decoupled = supplyNets.some((n) =>
        n.pins.some((p) => {
          if (p.ref === part.ref) return false;
          const candDef = ctx.defs.get(
            ctx.circuit.parts.find((c) => c.ref === p.ref)?.defId ?? '',
          );
          return /capacitor/i.test(`${candDef?.family ?? ''} ${candDef?.title ?? ''}`);
        }),
      );
      if (decoupled) continue;

      out.push({
        ruleId: 'RULE_DECOUPLING_MISSING',
        severity: 'WARNING',
        message:
          `${part.ref} has no decoupling capacitor on its supply. Digital ` +
          'parts draw current in bursts; without local decoupling the rail ' +
          'dips and the symptom is random resets, not a clean failure.',
        affected: { parts: [part.ref], nets: supplyNets.map((n) => n.id) },
        suggestedFix:
          `Add a 100 nF ceramic capacitor across ${part.ref}'s supply and ` +
          'ground, as close to the part as the board allows.',
      });
    }

    return out;
  },
};
