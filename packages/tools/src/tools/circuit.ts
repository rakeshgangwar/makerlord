import { z } from 'zod';
import type { Circuit } from '@makerlord/circuit';
import { resolvePins } from '@makerlord/circuit';
import { board, bundle } from '../data.js';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { refuse, ok } from '../result.js';
import type { Session } from '../session.js';

function circuitOf(s: Session): Circuit {
  if (!s.file.project.circuit) {
    s.file.project.circuit = { boardId: 'half', parts: [], wires: [], intent: [] };
  }
  return s.file.project.circuit;
}

/** "LED1.anode" → { ref, pin }, validated against the part's definition. */
function parsePinRef(c: Circuit, text: string): { ref: string; pin: string } {
  const dot = text.indexOf('.');
  if (dot <= 0 || dot === text.length - 1) {
    throw new Error(`pin ref "${text}" must look like REF.pinName`);
  }
  const ref = text.slice(0, dot);
  const pin = text.slice(dot + 1);
  const inst = c.parts.find((p) => p.ref === ref);
  if (!inst) throw new Error(`no part with ref "${ref}" in the circuit`);
  const def = bundle().parts[inst.defId];
  if (!def) throw new Error(`part "${ref}" has unknown definition "${inst.defId}"`);
  if (!def.pins.some((p) => p.name === pin)) {
    throw new Error(
      `part "${ref}" (${def.title}) has no pin named "${pin}" — ` +
        `its pins are: ${def.pins.map((p) => p.name).join(', ')}`,
    );
  }
  return { ref, pin };
}

function requireHole(hole: string): void {
  if (!board().grid.holes[hole]) {
    throw new Error(`hole "${hole}" does not exist on board ${board().id}`);
  }
}

const partAdd: ToolDef = {
  name: 'part_add',
  summary:
    'Call this to put a curated part into the circuit. The defId must come ' +
    'from parts_search — hallucinated ids are rejected here.',
  input: z.object({ ref: z.string().min(1), defId: z.string().min(1) }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { ref, defId } = input as { ref: string; defId: string };
    if (!bundle().parts[defId]) {
      throw new Error(
        `part_add: "${defId}" is not in the curated library — use parts_search`,
      );
    }
    const c = circuitOf(s);
    if (c.parts.some((p) => p.ref === ref)) {
      throw new Error(`part_add: ref "${ref}" already in use`);
    }
    c.parts.push({ ref, defId });
    return ok({ parts: c.parts.length });
  },
};

const connect: ToolDef = {
  name: 'connect',
  summary:
    'Call this to declare that two pins should be electrically joined — ' +
    'intent, not layout. Use place and wire for the physical breadboard.',
  input: z.object({ from: z.string().min(1), to: z.string().min(1) }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { from, to } = input as { from: string; to: string };
    const c = circuitOf(s);
    const a = parsePinRef(c, from);
    const b = parsePinRef(c, to);
    c.intent.push({
      name: `net_${a.ref}_${a.pin}__${b.ref}_${b.pin}`,
      members: [a, b],
    });
    return ok({ nets: c.intent.length });
  },
};

const circuitTarget: ToolDef = {
  name: 'circuit_target',
  summary:
    'Call this to declare where the circuit lives: breadboard (default, ' +
    'placement and wiring on the board) or freeform — intent nets are the ' +
    'whole truth, for onboard-only firmware, module jumpers, perfboard (D56).',
  input: z.object({ target: z.enum(['breadboard', 'freeform']) }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const c = circuitOf(s);
    c.target = (input as { target: 'breadboard' | 'freeform' }).target;
    return ok({ target: c.target });
  },
};

const place: ToolDef = {
  name: 'place',
  summary:
    'Call this to seat a part on the breadboard at an origin hole with an ' +
    'orientation. Fails loudly if any pin would land off the board.',
  input: z.object({
    ref: z.string().min(1),
    hole: z.string().min(1),
    orientation: z
      .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
      .default(0),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    if (circuitOf(s).target === 'freeform') {
      return refuse('BOARD_TARGET',
        'this circuit is freeform — intent nets are the whole truth; there is no board to place on');
    }
    const { ref, hole, orientation } = input as {
      ref: string; hole: string; orientation: 0 | 90 | 180 | 270;
    };
    requireHole(hole);
    const c = circuitOf(s);
    const inst = c.parts.find((p) => p.ref === ref);
    if (!inst) throw new Error(`place: no part with ref "${ref}"`);
    const profile = bundle().profiles[inst.defId];
    if (!profile) {
      throw new Error(`place: part "${inst.defId}" has no footprint profile`);
    }
    inst.placement = { originHole: hole, orientation };
    // Validates every pin lands on a real hole; throws otherwise.
    resolvePins(board(), inst, profile.footprint);
    return ok({ ref, hole, orientation });
  },
};

const wire: ToolDef = {
  name: 'wire',
  summary:
    'Call this to route a physical jumper between two breadboard holes. Both ' +
    'holes must exist on the board.',
  input: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    color: z.string().default('red'),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    if (circuitOf(s).target === 'freeform') {
      return refuse('BOARD_TARGET',
        'this circuit is freeform — there is no board to route wires on');
    }
    const { from, to, color } = input as { from: string; to: string; color: string };
    requireHole(from);
    requireHole(to);
    const c = circuitOf(s);
    c.wires.push({ id: `w${c.wires.length + 1}`, from, to, color });
    return ok({ wires: c.wires.length });
  },
};

export const CIRCUIT_TOOLS: ToolDef[] = [
  circuitTarget,partAdd, connect, place, wire];
