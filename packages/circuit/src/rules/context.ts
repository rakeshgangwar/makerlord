import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Board } from '../board.js';
import type { Circuit } from '../model.js';
import type { Divergence } from '../derive/diff.js';
import type { DerivedNet } from '../derive/netlist.js';
import type { RuleContext } from './engine.js';

export function makeContext(
  board: Board,
  circuit: Circuit,
  nets: readonly DerivedNet[],
  divergences: readonly Divergence[],
  defs: ReadonlyMap<string, PartDefinition>,
  profiles: ReadonlyMap<string, SafetyProfile>,
): RuleContext {
  return { board, circuit, nets, divergences, defs, profiles };
}

export function defIdOf(ctx: RuleContext, ref: string): string | undefined {
  return ctx.circuit.parts.find((p) => p.ref === ref)?.defId;
}

export function defFor(ctx: RuleContext, ref: string): PartDefinition | undefined {
  const id = defIdOf(ctx, ref);
  return id === undefined ? undefined : ctx.defs.get(id);
}

export function profileFor(ctx: RuleContext, ref: string): SafetyProfile | undefined {
  const id = defIdOf(ctx, ref);
  return id === undefined ? undefined : ctx.profiles.get(id);
}

/** Ground wins over supply: a net carrying both is a short, not a rail. */
export function netRole(
  ctx: RuleContext,
  net: DerivedNet,
): 'gnd' | 'supply' | 'signal' {
  let supply = false;
  for (const p of net.pins) {
    const role = defFor(ctx, p.ref)?.pins.find((x) => x.name === p.pin)?.role;
    if (role === 'gnd') return 'gnd';
    if (role === 'supply') supply = true;
  }
  return supply ? 'supply' : 'signal';
}
