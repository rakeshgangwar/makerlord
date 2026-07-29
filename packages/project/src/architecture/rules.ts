import type { Finding } from '@makerlord/circuit';
import type { ProjectContext, ProjectRule } from '../requirements/rules.js';
import { findBlock, findInterface, linksTouching } from './context.js';
import type { ComputedValue } from './power.js';
import { computePowerBudget, severityForComputed } from './power.js';
import { evaluateMetric } from './evaluators.js';

export const interfaceUnmetRule: ProjectRule = {
  id: 'ARCH_INTERFACE_UNMET',
  severity: 'BLOCKER',
  check(ctx) {
    const out: Finding[] = [];
    for (const block of ctx.project.architecture.blocks) {
      for (const iface of block.interfaces) {
        if (iface.direction !== 'consumes') continue;
        if (linksTouching(ctx, block.id, iface.id).length > 0) continue;
        out.push({
          ruleId: 'ARCH_INTERFACE_UNMET',
          severity: 'BLOCKER',
          message:
            `Block "${block.name}" (${block.id}) needs ${iface.kind} on port ` +
            `"${iface.id}", but nothing is connected to it.`,
          affected: { parts: [block.id] },
          suggestedFix:
            `Link "${iface.id}" to a block that provides ${iface.kind}, or ` +
            'remove the port if the block does not really need it.',
        });
      }
    }
    return out;
  },
};

export const voltageMismatchRule: ProjectRule = {
  id: 'ARCH_VOLTAGE_MISMATCH',
  severity: 'BLOCKER',
  check(ctx) {
    const out: Finding[] = [];
    for (const link of ctx.project.architecture.links) {
      const fromBlock = findBlock(ctx, link.from.blockId);
      const toBlock = findBlock(ctx, link.to.blockId);
      if (!fromBlock || !toBlock) continue;

      const a = findInterface(fromBlock, link.from.interfaceId);
      const b = findInterface(toBlock, link.to.interfaceId);
      if (!a || !b) continue;

      // Only power rails are checked here. Signal-level mismatches are a
      // circuit-stage concern (RULE_VOLTAGE_DOMAIN_MISMATCH, Slice 1).
      if (a.kind !== 'power' || b.kind !== 'power') continue;
      if (a.voltageV === undefined || b.voltageV === undefined) continue;
      if (a.voltageV === b.voltageV) continue;

      const provider = a.direction === 'provides' ? a : b;
      const consumer = a.direction === 'provides' ? b : a;

      out.push({
        ruleId: 'ARCH_VOLTAGE_MISMATCH',
        severity: 'BLOCKER',
        message:
          `"${fromBlock.name}" supplies ${provider.voltageV} V to ` +
          `"${toBlock.name}", which expects ${consumer.voltageV} V.`,
        affected: { parts: [fromBlock.id, toBlock.id] },
        suggestedFix:
          'Add a regulator block between them, or pick a supply at the ' +
          'voltage the load expects.',
      });
    }
    return out;
  },
};

/** Names the assumed inputs so a finding can report its own weakest link. */
export function assumedInputSummary(inputs: ComputedValue<number>[]): string {
  const assumed = inputs.filter((i) => i.provenance === 'assumed');
  if (assumed.length === 0) return '';
  const names = [...new Set(assumed.map((a) => a.source))].join('; ');
  return ` Assumed inputs: ${names}. Confirm before trusting the margin.`;
}

function providedCurrentMa(ctx: ProjectContext): number {
  let total = 0;
  for (const block of ctx.project.architecture.blocks) {
    for (const iface of block.interfaces) {
      if (iface.direction === 'provides' && iface.kind === 'power') {
        total += iface.currentMa ?? 0;
      }
    }
  }
  return total;
}

export const powerBudgetRule: ProjectRule = {
  id: 'ARCH_POWER_BUDGET_EXCEEDED',
  severity: 'BLOCKER',
  check(ctx) {
    const provided = providedCurrentMa(ctx);
    if (provided <= 0) return [];       // nothing declares a budget yet

    const budget = computePowerBudget(ctx);
    if (budget.averageMa <= provided) return [];

    return [
      {
        ruleId: 'ARCH_POWER_BUDGET_EXCEEDED',
        severity: severityForComputed(budget.anyAssumed),
        message:
          `This architecture draws about ${budget.averageMa.toFixed(2)} mA on ` +
          `average, but the supply provides ${provided} mA.` +
          assumedInputSummary(budget.inputs),
        affected: {
          parts: ctx.project.architecture.blocks.map((b) => b.id),
        },
        suggestedFix:
          'Reduce duty cycle, pick lower-power parts, or choose a supply ' +
          'that can deliver the current.',
      },
    ];
  },
};

export const requirementUnsatisfiedRule: ProjectRule = {
  id: 'ARCH_REQUIREMENT_UNSATISFIED',
  severity: 'BLOCKER',
  check(ctx) {
    const out: Finding[] = [];
    for (const r of ctx.project.requirements) {
      const result = evaluateMetric(ctx, r.metric);
      if (!result) continue;            // not computable — see spec §3.2

      const ok =
        r.comparator === '>=' ? result.value >= r.value
        : r.comparator === '<=' ? result.value <= r.value
        : r.comparator === '==' ? result.value === r.value
        : result.value >= r.value && result.value <= (r.max ?? Infinity);
      if (ok) continue;

      const anyAssumed = result.inputs.some((i) => i.provenance === 'assumed');
      out.push({
        ruleId: 'ARCH_REQUIREMENT_UNSATISFIED',
        severity: severityForComputed(anyAssumed),
        message:
          `Requirement "${r.statement}" is not met by this architecture: ` +
          `${result.workings}, against a target of ${r.comparator} ${r.value} ` +
          `${r.unit}.` + assumedInputSummary(result.inputs),
        affected: { parts: [r.id] },
        suggestedFix:
          'Change the architecture, or revise the requirement — but do not ' +
          'leave them disagreeing.',
      });
    }
    return out;
  },
};
