import { profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';

/**
 * An inductor keeps its current flowing when switched off — the collapsing
 * field drives the voltage as high as it must to keep going, and that spike
 * kills the transistor or GPIO doing the switching. A reverse-biased diode
 * across the winding gives the current somewhere to go.
 *
 * Applies to BARE windings: an inductive-hazard part with exactly two
 * connected nets (motor, relay coil). A fully-wired module with more nets
 * (a servo — three wires, driver on board) manages its own coil.
 */
export const flybackRule: Rule = {
  id: 'RULE_FLYBACK_MISSING',
  severity: 'BLOCKER',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];

    for (const part of ctx.circuit.parts) {
      const profile = profileFor(ctx, part.ref);
      if (profile?.hazardClass !== 'inductive') continue;

      const partNets = ctx.nets.filter((n) =>
        n.pins.some((p) => p.ref === part.ref),
      );
      if (partNets.length !== 2) continue;

      const [a, b] = partNets;
      const bridged = ctx.circuit.parts.some((cand) => {
        if (cand.ref === part.ref) return false;
        const def = ctx.defs.get(cand.defId);
        if (!def) return false;
        // A flyback diode is a rectifier — an LED is not (family 'LED').
        if (!/diode|rectifier/i.test(`${def.family} ${def.title}`)) return false;
        return (
          a!.pins.some((p) => p.ref === cand.ref) &&
          b!.pins.some((p) => p.ref === cand.ref)
        );
      });
      if (bridged) continue;

      out.push({
        ruleId: 'RULE_FLYBACK_MISSING',
        severity: 'BLOCKER',
        message:
          `${part.ref} is an inductive load with no flyback diode across it. ` +
          'When it switches off, the collapsing field spikes the voltage and ' +
          'destroys whatever is driving it.',
        affected: { parts: [part.ref], nets: [a!.id, b!.id] },
        suggestedFix:
          `Add a rectifier diode (e.g. 1N4001) in parallel with ${part.ref}, ` +
          'reverse-biased: cathode to the supply side, anode to the return side.',
      });
    }

    return out;
  },
};
