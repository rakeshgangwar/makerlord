import { z } from 'zod';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { ok } from '../result.js';

const inventoryAdd: ToolDef = {
  name: 'inventory_add',
  summary:
    'Call this when the maker says they already own a part — "I have an ' +
    'Arduino", "there are some resistors in my drawer".',
  input: z
    .object({
      partId: z.string().optional(),
      freeText: z.string().optional(),
      quantity: z.number().int().positive().optional(),
    })
    .refine((i) => i.partId !== undefined || i.freeText !== undefined, {
      message: 'either partId or freeText is required',
    }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    s.file.project.inventory.push(input as never);
    return ok({ count: s.file.project.inventory.length });
  },
};

const inventoryList: ToolDef = {
  name: 'inventory_list',
  summary:
    'Call this before proposing parts to buy — prefer what the maker already owns.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    return ok({ items: requireSession(ctx).file.project.inventory });
  },
};

const inventoryRemove: ToolDef = {
  name: 'inventory_remove',
  summary:
    'Call this when the maker corrects the inventory — an item they said they ' +
    'had turns out to be missing or broken. Index is from inventory_list.',
  input: z.object({ index: z.number().int().nonnegative() }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { index } = input as { index: number };
    if (index >= s.file.project.inventory.length) {
      throw new Error(`inventory_remove: no item at index ${index}`);
    }
    s.file.project.inventory.splice(index, 1);
    return ok({ count: s.file.project.inventory.length });
  },
};

export const INVENTORY_TOOLS: ToolDef[] = [inventoryAdd, inventoryList, inventoryRemove];
