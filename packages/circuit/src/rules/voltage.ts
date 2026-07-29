import type { DerivedNet } from '../derive/netlist.js';
import { profileFor } from './context.js';
import type { Finding, Rule, RuleContext } from './engine.js';

/** "5V" → 5, "3V3" → 3.3, "12V" → 12. Returns undefined if not a rail name. */
export function pinNameToVolts(name: string): number | undefined {
  const m = /^(\d+)v(\d*)$/i.exec(name.trim());
  if (!m) return undefined;
  const whole = m[1]!;
  const frac = m[2] ?? '';
  return Number(frac.length > 0 ? `${whole}.${frac}` : whole);
}

export function netVoltage(ctx: RuleContext, net: DerivedNet): number | undefined {
  let max: number | undefined;
  for (const p of net.pins) {
    const v = pinNameToVolts(p.pin);
    if (v !== undefined && (max === undefined || v > max)) max = v;
  }
  return max;
}

export const voltageDomainRule: Rule = {
  id: 'RULE_VOLTAGE_DOMAIN_MISMATCH',
  severity: 'BLOCKER',

  check(ctx: RuleContext): Finding[] {
    const out: Finding[] = [];

    for (const net of ctx.nets) {
      const volts = netVoltage(ctx, net);
      if (volts === undefined) continue;

      const seen = new Set<string>();
      for (const p of net.pins) {
        if (seen.has(p.ref)) continue;
        const limit = profileFor(ctx, p.ref)?.absMaxVoltageV;
        if (limit === undefined || volts <= limit) continue;
        seen.add(p.ref);
        out.push({
          ruleId: 'RULE_VOLTAGE_DOMAIN_MISMATCH',
          severity: 'BLOCKER',
          message:
            `${p.ref} is rated to ${limit} V but net "${net.id}" sits at ${volts} V. ` +
            'Powering it will destroy the part, usually instantly.',
          affected: { parts: [p.ref], nets: [net.id] },
          suggestedFix:
            `Move ${p.ref} to the 3V3 rail, or add a level shifter between the ` +
            `${volts} V side and the part.`,
        });
      }
    }

    return out;
  },
};
