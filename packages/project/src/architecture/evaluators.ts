import type { ProjectContext } from '../requirements/rules.js';
import type { ComputedValue } from './power.js';
import { computePowerBudget } from './power.js';

export interface EvaluationResult {
  value: number;
  unit: string;
  inputs: ComputedValue<number>[];
  workings: string;
}

export interface MetricEvaluator {
  metric: string;
  unit: string;
  evaluate(ctx: ProjectContext): EvaluationResult | null;
}

const HOURS_PER_MONTH = 730;

const batteryRuntime: MetricEvaluator = {
  metric: 'battery_runtime',
  unit: 'months',
  evaluate(ctx) {
    const capacity = ctx.project.requirements.find(
      (r) => r.metric === 'supply_capacity',
    );
    if (!capacity) return null;

    const budget = computePowerBudget(ctx);
    if (budget.averageMa <= 0) return null;

    const hours = capacity.value / budget.averageMa;
    const months = hours / HOURS_PER_MONTH;

    return {
      value: months,
      unit: 'months',
      inputs: budget.inputs,
      workings:
        `${capacity.value} mAh / ${budget.averageMa.toFixed(3)} mA ` +
        `= ${hours.toFixed(0)} h = ${months.toFixed(1)} months`,
    };
  },
};

export const EVALUATORS: ReadonlyMap<string, MetricEvaluator> = new Map([
  [batteryRuntime.metric, batteryRuntime],
]);

/** Returns null when the metric has no evaluator, or cannot be computed yet. */
export function evaluateMetric(
  ctx: ProjectContext,
  metric: string,
): EvaluationResult | null {
  return EVALUATORS.get(metric)?.evaluate(ctx) ?? null;
}
