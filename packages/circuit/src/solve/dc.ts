import { profileFor } from '../rules/context.js';
import type { RuleContext } from '../rules/engine.js';
import { netVoltage } from '../rules/voltage.js';

export interface Branch {
  parts: string[];
  currentMa: number;
}

export interface DcPrediction {
  railVoltage?: number;
  totalCurrentMa: number;
  branches: Branch[];
}

/**
 * Resistive DC only, with a fixed LED forward drop. Not a general solver —
 * it exists to produce the numbers the power-up gate asks the maker to
 * confirm with a meter.
 */
export function predictDc(ctx: RuleContext): DcPrediction {
  let railVoltage: number | undefined;
  for (const n of ctx.nets) {
    const v = netVoltage(ctx, n);
    if (v !== undefined && (railVoltage === undefined || v > railVoltage)) {
      railVoltage = v;
    }
  }

  let total = 0;
  for (const part of ctx.circuit.parts) {
    total += profileFor(ctx, part.ref)?.quiescentMa ?? 0;
  }

  const branches: Branch[] = [];
  if (railVoltage !== undefined) {
    for (const part of ctx.circuit.parts) {
      const resistor = profileFor(ctx, part.ref);
      const ohms = resistor?.resistanceOhms;
      if (ohms === undefined || ohms <= 0) continue;

      // Find an LED sharing a net with this resistor.
      const sharedNets = ctx.nets.filter((n) =>
        n.pins.some((p) => p.ref === part.ref),
      );
      let ledRef: string | undefined;
      let vf: number | undefined;
      for (const n of sharedNets) {
        for (const p of n.pins) {
          if (p.ref === part.ref) continue;
          const forward = profileFor(ctx, p.ref)?.forwardVoltageV;
          if (forward !== undefined) {
            ledRef = p.ref;
            vf = forward;
          }
        }
      }
      if (ledRef === undefined || vf === undefined) continue;

      const currentMa = ((railVoltage - vf) / ohms) * 1000;
      if (currentMa <= 0) continue;
      branches.push({ parts: [part.ref, ledRef], currentMa });
      total += currentMa;
    }
  }

  const prediction: DcPrediction = { totalCurrentMa: total, branches };
  if (railVoltage !== undefined) prediction.railVoltage = railVoltage;
  return prediction;
}

export function expectedContinuity(
  ctx: RuleContext,
  holeA: string,
  holeB: string,
): 'short' | 'open' {
  const node = ctx.nets.find((n) => n.holes.includes(holeA));
  return node?.holes.includes(holeB) ? 'short' : 'open';
}
