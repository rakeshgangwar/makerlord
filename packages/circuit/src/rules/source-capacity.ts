import { profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';
import { loadOnNet } from './pin-current.js';

/**
 * A source can only deliver so much continuously. Loads that declare more
 * than the source's rated continuous current mean sag, brownouts, and a
 * battery running hot — a WARNING, not a BLOCKER: the board misbehaves
 * before anything burns, but a stalled motor on a PP3 is not a design.
 *
 * The source side carries `maxContinuousMa` (hand-authored, datasheet-cited
 * in the profile); the load side is the same declared-draw model the
 * pin-current rule uses.
 */
export const sourceCapacityRule: Rule = {
  id: 'RULE_SOURCE_OVER_CAPACITY',
  severity: 'WARNING',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];

    for (const part of ctx.circuit.parts) {
      const profile = profileFor(ctx, part.ref);
      if (profile?.maxContinuousMa === undefined) continue;
      const def = ctx.defs.get(part.defId);
      if (!def) continue;

      const supplyPinNames = def.pins
        .filter((p) => p.role === 'supply' || p.name === '+')
        .map((p) => p.name);
      const supplyNets = ctx.nets.filter((n) =>
        n.pins.some(
          (p) => p.ref === part.ref && supplyPinNames.includes(p.pin),
        ),
      );
      if (supplyNets.length === 0) continue;

      let totalMa = 0;
      for (const n of supplyNets) totalMa += loadOnNet(ctx, n.id, part.ref);
      if (totalMa <= profile.maxContinuousMa) continue;

      out.push({
        ruleId: 'RULE_SOURCE_OVER_CAPACITY',
        severity: 'WARNING',
        message:
          `${part.ref} is rated for ${profile.maxContinuousMa} mA continuous, ` +
          `but the connected loads declare up to ${totalMa} mA. Expect voltage ` +
          'sag, brownouts, and a hot source under load.',
        affected: { parts: [part.ref], nets: supplyNets.map((n) => n.id) },
        suggestedFix:
          'Use a source rated for the load (or reduce the load) — check the ' +
          'worst case: motors are declared at stall, not free-running.',
      });
    }

    return out;
  },
};
