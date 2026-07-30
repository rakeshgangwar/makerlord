import type { Circuit, Finding, IntentNet } from '@makerlord/circuit';
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Firmware, Role } from '@makerlord/project';

/**
 * The cross-check family (spec §4): deterministic rules over circuit ×
 * firmware model — the D9 payoff, faults neither a hardware-only nor a
 * code-only tool can see. Same Finding shape, same severity ladder, and
 * the same absence of any dismiss path as every other rule in the engine.
 * All BLOCKERs stand on the hand-authored, datasheet-cited gpio facet
 * (D48) — verified provenance.
 */
export interface FwRuleContext {
  circuit: Circuit;
  defs: Map<string, PartDefinition>;
  profiles: Map<string, SafetyProfile>;
  firmware: Firmware;
  /** From derivePinPlan — behaviors naming roles no wiring supports. */
  unbound: { behaviorId: string; role: string }[];
  /** Predicted per-intent-net voltages (predict_dc), when available. */
  netVoltages?: Map<string, number>;
}

/** 'gnd' outranks 'supply': a net carrying both is a short, not a rail. */
function netRail(ctx: FwRuleContext, net: IntentNet): 'gnd' | 'supply' | 'signal' {
  let supply = false;
  for (const m of net.members) {
    const part = ctx.circuit.parts.find((p) => p.ref === m.ref);
    const role = part && ctx.defs.get(part.defId)?.pins.find((x) => x.name === m.pin)?.role;
    if (role === 'gnd') return 'gnd';
    if (role === 'supply') supply = true;
  }
  return supply ? 'supply' : 'signal';
}

function netOf(ctx: FwRuleContext, role: Role): IntentNet | undefined {
  return ctx.circuit.intent.find((n) =>
    n.members.some((m) => m.ref === ctx.firmware.target.ref && m.pin === role.mcuPin));
}

export function checkFirmware(ctx: FwRuleContext): Finding[] {
  const findings: Finding[] = [];
  const mcuRef = ctx.firmware.target.ref;
  const mcuPart = ctx.circuit.parts.find((p) => p.ref === mcuRef);
  const gpio = (mcuPart && ctx.profiles.get(mcuPart.defId)?.gpio) ?? {};

  for (const role of ctx.firmware.roles) {
    const pin = gpio[role.mcuPin];
    const net = netOf(ctx, role);
    const rail = net ? netRail(ctx, net) : 'signal';
    const affected = {
      pins: [{ ref: mcuRef, pin: role.mcuPin }],
      ...(net ? { nets: [net.name] } : {}),
    };

    // The D9 canonical MCU-killer: an OUTPUT fighting a rail loses the
    // die, not the argument.
    if (role.mode === 'OUTPUT' && net && rail !== 'signal') {
      findings.push({
        ruleId: 'RULE_FW_OUTPUT_INTO_RAIL',
        severity: 'BLOCKER',
        message:
          `${role.role} drives ${mcuRef}.${role.mcuPin} as OUTPUT, but its net ` +
          `"${net.name}" ties to ${rail === 'gnd' ? 'ground' : 'the supply rail'} — `
          + 'driving against a rail destroys the pin driver',
        affected,
        suggestedFix:
          'rewire the load off the rail, or make this role an input — an ' +
          'OUTPUT must never see a rail directly',
      });
    }

    if (role.mode === 'ANALOG_IN' && pin?.analogIn !== true) {
      findings.push({
        ruleId: 'RULE_FW_PIN_CAPABILITY',
        severity: 'BLOCKER',
        message:
          `${role.role} needs an analog input, but ${mcuRef}.${role.mcuPin} ` +
          'has no ADC',
        affected,
        suggestedFix:
          'move the wire to an ADC-capable pin (the pin plan re-derives on rewire)',
      });
    }
    if (role.mode === 'OUTPUT' && pin !== undefined && pin.digital !== true) {
      findings.push({
        ruleId: 'RULE_FW_PIN_CAPABILITY',
        severity: 'BLOCKER',
        message:
          `${role.role} drives ${mcuRef}.${role.mcuPin}, which is not a ` +
          'digital output pin',
        affected,
        suggestedFix: 'move the wire to a digital-capable pin',
      });
    }

    // Strapping: the chip reads this pin at reset; a net that pins it to
    // the wrong level means the board never boots (or boots into flash).
    if (pin?.strap && net && rail !== 'signal') {
      const level = rail === 'gnd' ? 'LOW' : 'HIGH';
      if (level !== pin.strap.atBoot) {
        findings.push({
          ruleId: 'RULE_FW_STRAP_PIN_CONFLICT',
          severity: 'BLOCKER',
          message:
            `${mcuRef}.${role.mcuPin} is a strapping pin (must be ` +
            `${pin.strap.atBoot} at boot${pin.strap.why ? ` — ${pin.strap.why}` : ''}), ` +
            `but net "${net.name}" holds it ${level}`,
          affected,
          suggestedFix:
            'move this connection to a non-strapping pin; strap pins are ' +
            'only safe for loads that leave the boot level alone',
        });
      }
    }

    if (
      role.mode === 'ANALOG_IN' && net &&
      pin?.analogMaxV !== undefined && ctx.netVoltages?.has(net.name)
    ) {
      const predicted = ctx.netVoltages.get(net.name)!;
      if (predicted > pin.analogMaxV) {
        findings.push({
          ruleId: 'RULE_FW_ANALOG_OVERVOLTAGE',
          severity: 'BLOCKER',
          message:
            `net "${net.name}" is predicted at ${predicted.toFixed(1)} V, over ` +
            `the ${pin.analogMaxV.toFixed(1)} V limit of ${mcuRef}.${role.mcuPin}`,
          affected,
          suggestedFix:
            'divide the signal down (two resistors) so the worst case stays ' +
            'under the pin limit',
        });
      }
    }

    if (role.mode === 'INPUT' && net && rail === 'signal') {
      findings.push({
        ruleId: 'RULE_FW_INPUT_FLOATING',
        severity: 'WARNING',
        message:
          `${role.role} reads ${mcuRef}.${role.mcuPin} as INPUT, but net ` +
          `"${net.name}" never reaches a rail — the pin floats and the ` +
          'reading is noise',
        affected,
        suggestedFix: 'add a pull-up or pull-down resistor to define the idle level',
      });
    }
  }

  for (const u of ctx.unbound) {
    findings.push({
      ruleId: 'RULE_FW_ROLE_UNBOUND',
      severity: 'BLOCKER',
      message:
        `behavior "${u.behaviorId}" names role ${u.role}, but no wiring ` +
        'supports it — the code would reference a pin that goes nowhere',
      affected: { parts: [ctx.firmware.target.ref] },
      suggestedFix:
        `wire the part ${u.role} should serve to the MCU (the pin plan ` +
        're-derives), or remove the behavior',
    });
  }

  return findings;
}
