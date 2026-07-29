import { defFor, profileFor } from './rules/context.js';
import type { RuleContext } from './rules/engine.js';
import { predictDc } from './solve/dc.js';

export type StepKind =
  | 'POWER_OFF'
  | 'PLACE_MODULE'
  | 'PLACE_PASSIVE'
  | 'ROUTE_SIGNAL'
  | 'ROUTE_POWER'
  | 'GATE'
  | 'POWER_ON';

export interface BuildStep {
  index: number;
  kind: StepKind;
  instruction: string;
  holes: string[];
  measurement?: { prompt: string; expected: string };
}

/** A part is a "module" if it has more than two pins — ICs and boards. */
function isModule(ctx: RuleContext, ref: string): boolean {
  return (defFor(ctx, ref)?.pins.length ?? 0) > 2;
}

function railHoles(ctx: RuleContext): { supply: string[]; ground: string[] } {
  const supply: string[] = [];
  const ground: string[] = [];
  for (const n of ctx.nets) {
    for (const p of n.pins) {
      const role = defFor(ctx, p.ref)?.pins.find((x) => x.name === p.pin)?.role;
      if (role === 'supply') supply.push(...n.holes);
      if (role === 'gnd') ground.push(...n.holes);
    }
  }
  return { supply: [...new Set(supply)], ground: [...new Set(ground)] };
}

export function buildSequence(ctx: RuleContext): BuildStep[] {
  const steps: Omit<BuildStep, 'index'>[] = [];

  steps.push({
    kind: 'POWER_OFF',
    instruction:
      'Disconnect all power — unplug USB and remove any battery. Everything ' +
      'that follows happens on a dead board.',
    holes: [],
  });

  const placed = ctx.circuit.parts.filter((p) => p.placement !== undefined);

  for (const part of placed.filter((p) => isModule(ctx, p.ref))) {
    steps.push({
      kind: 'PLACE_MODULE',
      instruction:
        `Place ${part.ref} at ${part.placement!.originHole}. Check its ` +
        'orientation now — pin 1 or the notch must face as shown.',
      holes: [part.placement!.originHole],
    });
  }

  for (const part of placed.filter((p) => !isModule(ctx, p.ref))) {
    const polarity = profileFor(ctx, part.ref)?.polarity;
    steps.push({
      kind: 'PLACE_PASSIVE',
      instruction:
        `Place ${part.ref} at ${part.placement!.originHole}.` +
        (polarity === 'polarized'
          ? ' This part is polarised — the longer leg goes towards the positive rail.'
          : ''),
      holes: [part.placement!.originHole],
    });
  }

  const { supply, ground } = railHoles(ctx);
  const signalNets = ctx.nets.filter(
    (n) =>
      !n.holes.some((h) => supply.includes(h) || ground.includes(h)) &&
      n.holes.length > 0,
  );

  for (const n of signalNets) {
    steps.push({
      kind: 'ROUTE_SIGNAL',
      instruction: `Run the signal wire for net "${n.id}".`,
      holes: n.holes,
    });
  }

  steps.push({
    kind: 'ROUTE_POWER',
    instruction:
      'Now run the power wires — red to the positive rail, black to ground. ' +
      'These go on last so every mistake so far was made unpowered.',
    holes: [...supply, ...ground],
  });

  const dc = predictDc(ctx);

  steps.push({
    kind: 'GATE',
    instruction:
      'Before any power goes in: set your meter to continuity and probe the ' +
      'positive rail against the ground rail.',
    holes: [...supply.slice(0, 1), ...ground.slice(0, 1)],
    measurement: {
      prompt:
        'Probe the positive rail against the ground rail. What does it read?',
      expected: 'open circuit (no beep, OL on the display)',
    },
  });

  steps.push({
    kind: 'POWER_ON',
    instruction:
      'Connect power. This circuit should draw about ' +
      `${dc.totalCurrentMa.toFixed(0)} mA` +
      (dc.railVoltage !== undefined ? ` from the ${dc.railVoltage} V rail` : '') +
      '. Much more than that means a short — disconnect immediately.',
    holes: [],
  });

  return steps.map((s, index) => ({ ...s, index }));
}
