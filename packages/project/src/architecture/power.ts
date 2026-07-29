import type { Severity } from '@makerlord/circuit';
import type { ProjectContext } from '../requirements/rules.js';
import type { Block } from './types.js';

export interface ComputedValue<T> {
  value: T;
  provenance: 'curated' | 'assumed';
  source: string;
}

export const DEFAULT_ACTIVE_MA = 50;
export const DEFAULT_SLEEP_MA = 0.01;

function profileFor(ctx: ProjectContext, block: Block) {
  if (block.sourcing.type === 'buy') {
    return ctx.profiles.get(block.sourcing.partId);
  }
  return undefined;
}

export function blockActiveMa(
  ctx: ProjectContext,
  block: Block,
): ComputedValue<number> {
  if (block.power?.activeMa !== undefined) {
    return {
      value: block.power.activeMa,
      provenance: 'curated',
      source: `block ${block.id}`,
    };
  }
  const quiescent = profileFor(ctx, block)?.quiescentMa;
  if (quiescent !== undefined) {
    return {
      value: quiescent,
      provenance: 'curated',
      source: `profile ${block.sourcing.type === 'buy' ? block.sourcing.partId : block.id}`,
    };
  }
  return {
    value: DEFAULT_ACTIVE_MA,
    provenance: 'assumed',
    source: `default for ${block.id}`,
  };
}

export function blockSleepMa(
  ctx: ProjectContext,
  block: Block,
): ComputedValue<number> {
  if (block.power?.sleepMa !== undefined) {
    return {
      value: block.power.sleepMa,
      provenance: 'curated',
      source: `block ${block.id}`,
    };
  }
  return {
    value: DEFAULT_SLEEP_MA,
    provenance: 'assumed',
    source: `default for ${block.id}`,
  };
}

function requirementValue(
  ctx: ProjectContext,
  metric: string,
): number | undefined {
  return ctx.project.requirements.find((r) => r.metric === metric)?.value;
}

/** Fraction of time the design is active. Spec §3.3. */
export function dutyCycle(ctx: ProjectContext): ComputedValue<number> {
  const interval = requirementValue(ctx, 'sample_interval');
  const active = requirementValue(ctx, 'active_duration');
  if (interval !== undefined && active !== undefined && interval > 0) {
    return {
      value: active / interval,
      provenance: 'curated',
      source: 'requirements sample_interval + active_duration',
    };
  }
  return { value: 1, provenance: 'assumed', source: 'assumed always-on' };
}

export interface PowerBudget {
  averageMa: number;
  inputs: ComputedValue<number>[];
  anyAssumed: boolean;
}

export function computePowerBudget(ctx: ProjectContext): PowerBudget {
  const duty = dutyCycle(ctx);
  const inputs: ComputedValue<number>[] = [duty];
  let averageMa = 0;

  for (const block of ctx.project.architecture.blocks) {
    const active = blockActiveMa(ctx, block);
    const sleep = blockSleepMa(ctx, block);
    inputs.push(active, sleep);
    averageMa += active.value * duty.value + sleep.value * (1 - duty.value);
  }

  return {
    averageMa,
    inputs,
    anyAssumed: inputs.some((i) => i.provenance === 'assumed'),
  };
}

/**
 * Spec §3.2 / §4: you may only gate on what you verified. A computed check
 * whose inputs are all curated may BLOCK; if any input was assumed it
 * degrades to a WARNING that names the assumption.
 */
export function severityForComputed(anyAssumed: boolean): Severity {
  return anyAssumed ? 'WARNING' : 'BLOCKER';
}
