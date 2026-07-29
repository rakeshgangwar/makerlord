import { z } from 'zod';
import type { Block, Sourcing } from '@makerlord/project';
import { bundle } from '../data.js';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { ok } from '../result.js';

const interfaceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['power', 'i2c', 'spi', 'uart', 'gpio', 'analog', 'pwm']),
  direction: z.enum(['provides', 'consumes']),
  voltageV: z.number().optional(),
  currentMa: z.number().optional(),
});

const sourcingSchema = z.union([
  z.object({ type: z.literal('buy'), partId: z.string().min(1) }),
  z.object({ type: z.literal('build'), partIds: z.array(z.string().min(1)) }),
  z.object({ type: z.literal('undecided') }),
]);

/** Parts are never invented — sourcing may only name curated parts. */
function validateSourcing(sourcing: Sourcing): void {
  const ids =
    sourcing.type === 'buy' ? [sourcing.partId]
    : sourcing.type === 'build' ? sourcing.partIds
    : [];
  for (const id of ids) {
    if (!bundle().parts[id]) {
      throw new Error(
        `sourcing names part "${id}" which is not in the curated library — ` +
          'use parts_search',
      );
    }
  }
}

const blockAdd: ToolDef = {
  name: 'block_add',
  summary:
    'Call this while sketching the architecture — one block per functional ' +
    'unit (mcu, supply, sensor). Sourcing may stay undecided until expand.',
  input: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    sourcing: sourcingSchema.optional(),
    interfaces: z.array(interfaceSchema).optional(),
    power: z
      .object({ activeMa: z.number(), sleepMa: z.number().optional() })
      .optional(),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const i = input as {
      id: string; name: string; sourcing?: Sourcing;
      interfaces?: Block['interfaces']; power?: Block['power'];
    };
    if (s.file.project.architecture.blocks.some((b) => b.id === i.id)) {
      throw new Error(`block_add: block "${i.id}" already exists`);
    }
    const sourcing: Sourcing = i.sourcing ?? { type: 'undecided' };
    validateSourcing(sourcing);
    const block: Block = {
      id: i.id,
      name: i.name,
      sourcing,
      interfaces: i.interfaces ?? [],
    };
    if (i.power) block.power = i.power;
    s.file.project.architecture.blocks.push(block);
    return ok({ blocks: s.file.project.architecture.blocks.length });
  },
};

const blockLink: ToolDef = {
  name: 'block_link',
  summary:
    'Call this to connect two block interfaces — a provides port to a ' +
    'consumes port. Both blocks and both interfaces must already exist.',
  input: z.object({
    fromBlock: z.string().min(1),
    fromInterface: z.string().min(1),
    toBlock: z.string().min(1),
    toInterface: z.string().min(1),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const i = input as {
      fromBlock: string; fromInterface: string; toBlock: string; toInterface: string;
    };
    const blocks = s.file.project.architecture.blocks;
    for (const [blockId, ifaceId] of [
      [i.fromBlock, i.fromInterface],
      [i.toBlock, i.toInterface],
    ] as const) {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) throw new Error(`block_link: no block "${blockId}"`);
      if (!block.interfaces.some((x) => x.id === ifaceId)) {
        throw new Error(
          `block_link: block "${blockId}" has no interface "${ifaceId}"`,
        );
      }
    }
    s.file.project.architecture.links.push({
      from: { blockId: i.fromBlock, interfaceId: i.fromInterface },
      to: { blockId: i.toBlock, interfaceId: i.toInterface },
    });
    return ok({ links: s.file.project.architecture.links.length });
  },
};

const blockSourcing: ToolDef = {
  name: 'block_sourcing',
  summary:
    'Call this when a buy-or-build decision lands for a block. Every block ' +
    'must be decided before expand will run.',
  input: z.object({ id: z.string().min(1), sourcing: sourcingSchema }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { id, sourcing } = input as { id: string; sourcing: Sourcing };
    const block = s.file.project.architecture.blocks.find((b) => b.id === id);
    if (!block) throw new Error(`block_sourcing: no block "${id}"`);
    validateSourcing(sourcing);
    block.sourcing = sourcing;
    return ok({ id, sourcing });
  },
};

const archShow: ToolDef = {
  name: 'arch_show',
  summary:
    'Call this to read the current block architecture — blocks, interfaces ' +
    'and links — before checking or changing it.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    return ok({ architecture: requireSession(ctx).file.project.architecture });
  },
};

export const ARCHITECTURE_TOOLS: ToolDef[] = [
  blockAdd, blockLink, blockSourcing, archShow,
];
