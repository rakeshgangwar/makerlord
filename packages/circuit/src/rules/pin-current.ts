import { defFor, profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';

/** Total declared draw of every part on a net, excluding the driver itself. */
export function loadOnNet(
  ctx: RuleContext,
  netId: string,
  excludeRef: string,
): number {
  const net = ctx.nets.find((n) => n.id === netId);
  if (!net) return 0;
  const counted = new Set<string>();
  let total = 0;
  for (const p of net.pins) {
    if (p.ref === excludeRef || counted.has(p.ref)) continue;
    const ma = profileFor(ctx, p.ref)?.maxCurrentMa;
    if (ma !== undefined) {
      total += ma;
      counted.add(p.ref);
    }
  }
  return total;
}

export const pinCurrentRule: Rule = {
  id: 'RULE_PIN_CURRENT_EXCEEDED',
  severity: 'BLOCKER',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];

    for (const part of ctx.circuit.parts) {
      const profile = profileFor(ctx, part.ref);
      const def = defFor(ctx, part.ref);
      if (!profile || !def || profile.pinMaxMa === undefined) continue;

      const perPinLimit = profile.pinMaxMa;
      let portTotal = 0;

      for (const net of ctx.nets) {
        for (const p of net.pins) {
          if (p.ref !== part.ref) continue;
          const role = def.pins.find((x) => x.name === p.pin)?.role;
          if (role !== 'io') continue;

          const load = loadOnNet(ctx, net.id, part.ref);
          portTotal += load;

          const pinLimit = profile.pinLimits?.[p.pin]?.maxCurrentMa ?? perPinLimit;
          if (load > pinLimit) {
            out.push({
              ruleId: 'RULE_PIN_CURRENT_EXCEEDED',
              severity: 'BLOCKER',
              message:
                `${part.ref} pin ${p.pin} would drive ${load} mA, but it is rated ` +
                `for ${pinLimit} mA. The pin driver will overheat and fail.`,
              affected: { parts: [part.ref], nets: [net.id] },
              suggestedFix:
                'Drive the load through a transistor or MOSFET powered from the ' +
                'supply rail, and use the pin only as the control signal.',
            });
          }
        }
      }

      if (
        profile.portTotalMaxMa !== undefined &&
        portTotal > profile.portTotalMaxMa
      ) {
        out.push({
          ruleId: 'RULE_PIN_CURRENT_EXCEEDED',
          severity: 'BLOCKER',
          message:
            `${part.ref} would supply ${portTotal} mA in total across its I/O pins, ` +
            `over the ${profile.portTotalMaxMa} mA the whole port can deliver.`,
          affected: { parts: [part.ref] },
          suggestedFix:
            'Reduce the number of simultaneously driven loads, or power them from ' +
            'the supply rail through transistors rather than from the pins.',
        });
      }
    }

    return out;
  },
};
