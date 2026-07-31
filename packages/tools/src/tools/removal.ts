import { z } from 'zod';
import { resolvePins } from '@makerlord/circuit';
import { board, profilesMap } from '../data.js';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { ok, refuse } from '../result.js';
import { circuitOf } from './circuit.js';

/**
 * D55: construction gets its inverse. Removal is an ordinary mutation —
 * check_circuit re-adjudicates after every one; removal can resolve
 * findings and can create them. Cascade semantics are normative (spec
 * §3): a half-removed part would be a lie in the model. There is still
 * no dismiss_finding — geometry is removable, verdicts are not.
 */

/** The holes a placed part's pins occupy — [] when unplaced/freeform. */
function occupiedHoles(s: ReturnType<typeof requireSession>, ref: string): Set<string> {
  const c = circuitOf(s);
  const inst = c.parts.find((p) => p.ref === ref);
  const footprint = inst && profilesMap().get(inst.defId)?.footprint;
  if (!inst || !footprint || !inst.placement) return new Set();
  return new Set(resolvePins(board(), inst, footprint).map((ph) => ph.hole));
}

function dropWiresTouching(c: { wires: { from: string; to: string }[] }, holes: Set<string>): number {
  const before = c.wires.length;
  c.wires = c.wires.filter((w) => !holes.has(w.from) && !holes.has(w.to));
  return before - c.wires.length;
}

const partRemove: ToolDef = {
  name: 'part_remove',
  summary:
    'Call this to take a part OUT of the circuit — it cascades: the part\'s ' +
    'placement, every wire touching its holes, and its intent-net ' +
    'memberships go with it (a net left under two members dies). Run ' +
    'check_circuit after, as with any mutation.',
  input: z.object({ ref: z.string().min(1) }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { ref } = input as { ref: string };
    const c = circuitOf(s);
    if (!c.parts.some((p) => p.ref === ref)) {
      return refuse('TOOL_ERROR', `no part "${ref}" in the circuit`);
    }
    const holes = occupiedHoles(s, ref);
    const wiresRemoved = dropWiresTouching(c, holes);
    const netsBefore = c.intent.length;
    c.intent = c.intent
      .map((n) => ({ ...n, members: n.members.filter((m) => m.ref !== ref) }))
      .filter((n) => n.members.length >= 2);
    c.parts = c.parts.filter((p) => p.ref !== ref);
    return ok({
      removed: ref,
      wiresRemoved,
      netsRemoved: netsBefore - c.intent.length,
      parts: c.parts.length,
    });
  },
};

const disconnect: ToolDef = {
  name: 'disconnect',
  summary:
    'Call this to undo a connect — removes the intent net whose two ' +
    'members are exactly these pins. The inverse of connect.',
  input: z.object({ from: z.string().min(1), to: z.string().min(1) }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { from, to } = input as { from: string; to: string };
    const c = circuitOf(s);
    const key = (r: string, p: string) => `${r}.${p}`;
    const wanted = new Set([from, to]);
    const idx = c.intent.findIndex((n) =>
      n.members.length === 2 &&
      n.members.every((m) => wanted.has(key(m.ref, m.pin))));
    if (idx === -1) {
      return refuse('TOOL_ERROR', `no intent net joins exactly ${from} and ${to}`);
    }
    c.intent.splice(idx, 1);
    return ok({ nets: c.intent.length });
  },
};

const wireRemove: ToolDef = {
  name: 'wire_remove',
  summary:
    'Call this to pull a physical jumper off the board — the exact hole ' +
    'pair, either order. The inverse of wire.',
  input: z.object({ from: z.string().min(1), to: z.string().min(1) }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { from, to } = input as { from: string; to: string };
    const c = circuitOf(s);
    const idx = c.wires.findIndex((w) =>
      (w.from === from && w.to === to) || (w.from === to && w.to === from));
    if (idx === -1) {
      return refuse('TOOL_ERROR', `no wire between ${from} and ${to}`);
    }
    c.wires.splice(idx, 1);
    return ok({ wires: c.wires.length });
  },
};

const unplace: ToolDef = {
  name: 'unplace',
  summary:
    'Call this to lift a part off the board — its placement and the wires ' +
    'serving it go; the part and its intent nets survive for re-placement.',
  input: z.object({ ref: z.string().min(1) }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { ref } = input as { ref: string };
    const c = circuitOf(s);
    const inst = c.parts.find((p) => p.ref === ref);
    if (!inst) return refuse('TOOL_ERROR', `no part "${ref}" in the circuit`);
    if (!inst.placement) return refuse('TOOL_ERROR', `${ref} is not placed`);
    const holes = occupiedHoles(s, ref);
    const wiresRemoved = dropWiresTouching(c, holes);
    delete inst.placement;
    return ok({ unplaced: ref, wiresRemoved });
  },
};

const blockRemove: ToolDef = {
  name: 'block_remove',
  summary:
    'Call this to remove an architecture block and its links. Refuses ' +
    'while circuit parts still carry this blockId — remove those first.',
  input: z.object({ id: z.string().min(1) }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { id } = input as { id: string };
    const arch = s.file.project.architecture;
    if (!arch.blocks.some((b) => b.id === id)) {
      return refuse('TOOL_ERROR', `no block "${id}"`);
    }
    const expanded = (s.file.project.circuit?.parts ?? [])
      .filter((p) => p.blockId === id).map((p) => p.ref);
    if (expanded.length > 0) {
      return refuse('TOOL_ERROR',
        `block "${id}" is expanded into the circuit (${expanded.join(', ')}) — part_remove those first`);
    }
    arch.blocks = arch.blocks.filter((b) => b.id !== id);
    arch.links = arch.links.filter((l) => l.from.blockId !== id && l.to.blockId !== id);
    return ok({ blocks: arch.blocks.length, links: arch.links.length });
  },
};

const blockUnlink: ToolDef = {
  name: 'block_unlink',
  summary: 'Call this to remove one block-to-block link. The inverse of block_link.',
  input: z.object({
    fromBlock: z.string().min(1), fromInterface: z.string().min(1),
    toBlock: z.string().min(1), toInterface: z.string().min(1),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const q = input as { fromBlock: string; fromInterface: string; toBlock: string; toInterface: string };
    const arch = s.file.project.architecture;
    const idx = arch.links.findIndex((l) =>
      l.from.blockId === q.fromBlock && l.from.interfaceId === q.fromInterface &&
      l.to.blockId === q.toBlock && l.to.interfaceId === q.toInterface);
    if (idx === -1) return refuse('TOOL_ERROR', 'no such link');
    arch.links.splice(idx, 1);
    return ok({ links: arch.links.length });
  },
};

export const REMOVAL_TOOLS: ToolDef[] = [
  partRemove, disconnect, wireRemove, unplace, blockRemove, blockUnlink,
];
