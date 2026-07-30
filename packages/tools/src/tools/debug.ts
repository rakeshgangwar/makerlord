import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { DebugSession, Observation } from '@makerlord/project';
import {
  applyObservation, applySelftest, computeSignatures, generateCandidates,
  nextProbe, verdictOf,
} from '@makerlord/debug';
import type { Stimulus } from '@makerlord/sim';
import { defsMap, profilesMap } from '../data.js';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import type { Session, ProjectFile } from '../session.js';
import { ok, refuse } from '../result.js';

/**
 * The four debug tools (spec §8). A candidate dies ONLY by contradiction
 * with a recorded observation — there is no debug_dismiss_candidate, no
 * manual conviction, by absence (D3/D4). debug_observe takes numbers,
 * not opinions.
 */

function circuitOf(s: Session) {
  const c = s.file.project.circuit;
  if (!c) throw new Error('debug: no circuit yet — there is nothing to debug');
  return c;
}

function sessionOf(s: Session): DebugSession {
  const d = s.file.project.debug;
  if (!d) throw new Error('debug: no open session — call debug_start first');
  return d;
}

function stimuliOf(s: Session): Stimulus[] {
  const holder = s.file as ProjectFile & { sim?: { stimuli?: Stimulus[] } };
  return holder.sim?.stimuli ?? [];
}

/** Re-derive the proposal + verdict after any change. */
function settle(d: DebugSession): void {
  d.status = d.status === 'open' || d.status === 'localized' || d.status === 'exonerated'
    ? verdictOf(d.candidates)
    : d.status;
  const p = nextProbe(d.candidates);
  if (p) d.proposed = p;
  else delete d.proposed;
}

const debugStart: ToolDef = {
  name: 'debug_start',
  summary:
    'Call this when something misbehaves — a symptom in, the engine ' +
    'enumerates candidate faults, computes their meter signatures with ' +
    'the real solver, and proposes ONE measurement. Refuses without a ' +
    'DC stimulus (signatures need a powered circuit).',
  input: z.object({
    kind: z.enum(['element_dead', 'wrong_reading', 'no_serial', 'board_dead']),
    ref: z.string().optional(),
    net: z.string().optional(),
    detail: z.string().optional(),
  }),
  mutates: true,
  gated: false,
  async handler(input, ctx) {
    const s = requireSession(ctx);
    const circuit = circuitOf(s);
    const symptom = input as DebugSession['symptom'];

    const stimuli = stimuliOf(s);
    if (!stimuli.some((x) => x.kind === 'dc')) {
      return refuse(
        'STIMULUS_REQUIRED',
        'fault signatures need a powered circuit — declare the supply ' +
        'with sim_stimulus_set (a dc stimulus on the rail) first',
      );
    }

    const profiles = profilesMap();
    const polarized = new Set(
      circuit.parts
        .filter((p) => profiles.get(p.defId)?.polarity === 'polarized')
        .map((p) => p.ref),
    );
    const resistors = new Set(
      circuit.parts
        .filter((p) => (profiles.get(p.defId)?.resistanceOhms ?? 0) > 0)
        .map((p) => p.ref),
    );

    const faults = generateCandidates(circuit, symptom, polarized, resistors);
    const candidates = await computeSignatures({
      circuit,
      faults,
      defs: defsMap(),
      profiles,
      stimuli,
      // Scratch dir: signature runs must never litter the project tree.
      workDir: mkdtempSync(join(tmpdir(), 'makerlord-debug-')),
    });

    const session: DebugSession = {
      symptom, candidates, observations: [], status: 'open',
    };
    settle(session);
    s.file.project.debug = session;
    return ok({
      candidates: candidates.length,
      proposed: session.proposed ?? null,
    });
  },
};

const debugStatus: ToolDef = {
  name: 'debug_status',
  summary:
    'Call this to see the hypothesis tree: live and contradicted ' +
    'candidates (each with the observation that killed it), the recorded ' +
    'observations, the proposed next measurement, and the verdict state.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    return ok({ session: sessionOf(requireSession(ctx)) });
  },
};

const debugObserve: ToolDef = {
  name: 'debug_observe',
  summary:
    'Call this to record ONE observation — a voltage reading at a net, or ' +
    'a structured SELFTEST line. The engine prunes contradicted candidates ' +
    'and proposes the next measurement. Numbers, never opinions.',
  // One flat object, not a union: MCP requires inputSchema.type "object"
  // at the top level, and a zod union projects to a bare anyOf.
  input: z
    .object({
      kind: z.enum(['voltage', 'selftest', 'log']),
      net: z.string().min(1).optional(),
      value: z.union([z.number(), z.string()]).optional(),
      unit: z.string().min(1).optional(),
      role: z.string().min(1).optional(),
      ok: z.boolean().optional(),
      behavior: z.string().min(1).optional(),
    })
    .superRefine((o, ctx2) => {
      const need = (cond: boolean, msg: string): void => {
        if (!cond) ctx2.addIssue({ code: z.ZodIssueCode.custom, message: msg });
      };
      if (o.kind === 'voltage') {
        need(o.net !== undefined && typeof o.value === 'number' && o.unit !== undefined,
          'a voltage observation needs net, numeric value and unit');
      }
      if (o.kind === 'selftest') {
        need(o.role !== undefined && o.ok !== undefined,
          'a selftest observation needs role and ok');
      }
      if (o.kind === 'log') {
        need(o.behavior !== undefined && typeof o.value === 'string',
          'a log observation needs behavior and a string value');
      }
    }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const d = sessionOf(s);
    if (d.status !== 'open') {
      throw new Error(`debug: the session is ${d.status} — start a new one for a new symptom`);
    }
    const obs = { id: `obs-${d.observations.length + 1}`, ...(input as object) } as Observation;
    d.observations.push(obs);
    if (obs.kind === 'voltage') d.candidates = applyObservation(d.candidates, obs);
    if (obs.kind === 'selftest') d.candidates = applySelftest(d.candidates, obs);
    settle(d);
    const live = d.candidates.filter((c) => c.status === 'live');
    return ok({
      status: d.status,
      live: live.map((c) => c.id),
      contradicted: d.candidates.filter((c) => c.status === 'contradicted')
        .map((c) => ({ id: c.id, by: c.contradictedBy })),
      proposed: d.proposed ?? null,
    });
  },
};

const debugClose: ToolDef = {
  name: 'debug_close',
  summary:
    'Call this to end the session — the verdict and its observation trail ' +
    'freeze into the project (they travel with the repo, D34).',
  input: z.object({}),
  mutates: true,
  gated: false,
  handler(_input, ctx) {
    const s = requireSession(ctx);
    const d = sessionOf(s);
    delete d.proposed;
    return ok({ status: d.status, observations: d.observations.length });
  },
};

export const DEBUG_TOOLS: ToolDef[] = [debugStart, debugStatus, debugObserve, debugClose];
