import { z } from 'zod';
import { defsMap } from '../data.js';
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

/**
 * The library/inventory split (D49): the LIBRARY is the curated catalog
 * — what exists; the INVENTORY is what this maker owns — per-project,
 * because it travels with the repo (D34). This tool derives the gap:
 * what the current circuit needs that the drawer does not hold.
 */
const inventoryGap: ToolDef = {
  name: 'inventory_gap',
  summary:
    'Call this to see what the build still needs: the circuit\'s bill of ' +
    'materials minus what the maker owns. Prefer closing the gap with ' +
    'owned parts before proposing purchases.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    const s = requireSession(ctx);
    const needed = new Map<string, number>();
    for (const part of s.file.project.circuit?.parts ?? []) {
      needed.set(part.defId, (needed.get(part.defId) ?? 0) + 1);
    }
    const owned = new Map<string, number>();
    for (const item of s.file.project.inventory) {
      if (item.partId !== undefined) {
        owned.set(item.partId, (owned.get(item.partId) ?? 0) + (item.quantity ?? 1));
      }
    }
    const toAcquire = [...needed.entries()]
      .map(([partId, need]) => ({
        partId,
        title: defsMap().get(partId)?.title ?? partId,
        needed: need,
        owned: Math.min(owned.get(partId) ?? 0, need),
      }))
      .filter((t) => t.owned < t.needed)
      .sort((a, b) => a.partId.localeCompare(b.partId));
    // Titles ride along (2026-07-30 audit): a maker owns "Red LED - 5mm",
    // not "5mmColorLEDModuleID" — ids stay for machines.
    const ownedTitled = s.file.project.inventory.map((item) => ({
      ...item,
      title: item.partId ? (defsMap().get(item.partId)?.title ?? item.partId) : undefined,
    }));
    return ok({ toAcquire, owned: ownedTitled });
  },
};

export const INVENTORY_TOOLS: ToolDef[] = [
  inventoryAdd, inventoryList, inventoryRemove, inventoryGap,
];
