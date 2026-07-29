import { defFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';

export const railShortRule: Rule = {
  id: 'RULE_SUPPLY_RAIL_SHORT',
  severity: 'BLOCKER',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];
    for (const net of ctx.nets) {
      let hasGnd = false;
      let hasSupply = false;
      for (const p of net.pins) {
        const role = defFor(ctx, p.ref)?.pins.find((x) => x.name === p.pin)?.role;
        if (role === 'gnd') hasGnd = true;
        if (role === 'supply') hasSupply = true;
      }
      if (hasGnd && hasSupply) {
        out.push({
          ruleId: 'RULE_SUPPLY_RAIL_SHORT',
          severity: 'BLOCKER',
          message:
            `Net "${net.id}" connects a supply pin directly to ground. ` +
            'That is a dead short across your power supply.',
          affected: { nets: [net.id], pins: net.pins },
          suggestedFix:
            'Disconnect power now. Put your meter in continuity mode and probe ' +
            'the red rail against the blue rail — it should read open, not beep. ' +
            'Trace the wire joining them and remove it.',
        });
      }
    }
    return out;
  },
};
