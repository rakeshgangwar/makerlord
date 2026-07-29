import type { Finding } from '@makerlord/circuit';
import type { ProjectRule } from '../requirements/rules.js';
import { findBlock, findInterface, linksTouching } from './context.js';

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
