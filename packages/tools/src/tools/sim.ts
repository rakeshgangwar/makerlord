import { dirname } from 'node:path';
import { z } from 'zod';
import type { SafetyProfile } from '@makerlord/parts';
import {
  dischargePlan, notSimulable, ngspiceAvailable, runOpAnalysis, spiceNetlist,
  type Stimulus,
} from '@makerlord/sim';
import { defsMap, profilesMap } from '../data.js';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { ok } from '../result.js';
import type { ProjectFile } from '../session.js';

interface SimState {
  stimuli: Stimulus[];
  runs: Record<string, { name: string; provenance: string; findings: unknown[] }>;
}

function simState(file: ProjectFile): SimState {
  const holder = file as ProjectFile & { sim?: SimState };
  if (!holder.sim) holder.sim = { stimuli: [], runs: {} };
  return holder.sim;
}

/** The param keys each stimulus kind actually reads — enforced, not guessed. */
const REQUIRED_PARAMS: Record<string, string[]> = {
  dc: ['volts'],
  pulse: ['low', 'high'],
  sine: ['amplitude', 'freq'],
  pwl: [],
  load_step: ['activeMa'],
};

const stimulusSchema = z
  .object({
    id: z.string().min(1),
    target: z.string().min(1),
    kind: z.enum(['dc', 'pulse', 'pwl', 'sine', 'load_step']),
    params: z.record(z.number()),
    provenance: z.enum(['stated', 'derived', 'assumed']),
    rationale: z.string().min(1),
  })
  .superRefine((s, ctx) => {
    for (const key of REQUIRED_PARAMS[s.kind] ?? []) {
      if (s.params[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['params', key],
          message: `a "${s.kind}" stimulus requires params.${key} (e.g. {"${key}": 5})`,
        });
      }
    }
  });

const simStimulusSet: ToolDef = {
  name: 'sim_stimulus_set',
  summary:
    'Call this before a run to declare what the circuit is doing. target is ' +
    'a pin reference like "U1.5V" (preferred) or a net name. Param keys per ' +
    'kind: dc→volts; pulse→low,high[,delay,width,period]; sine→amplitude,' +
    'freq[,offset]; load_step→activeMa[,idleMa,delay,duration]. Provenance ' +
    'is honest: an assumed stimulus caps the run at NOTE.',
  input: stimulusSchema,
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const stimulus = input as Stimulus;
    const state = simState(s.file);
    state.stimuli = state.stimuli.filter((x) => x.id !== stimulus.id);
    state.stimuli.push(stimulus);
    return ok({ stimuli: state.stimuli.length });
  },
};

const simRun: ToolDef = {
  name: 'sim_run',
  summary:
    'Call this to simulate the circuit — .op always runs; add tran/ac when ' +
    'the question is time- or frequency-domain. Returns a run id, the run ' +
    'provenance, and findings; traces come from sim_results, never inline.',
  input: z.object({
    name: z.string().min(1),
    analyses: z.array(z.enum(['op', 'tran', 'ac'])).default(['op']),
    tranStop: z.number().optional(),
    /** Sandbox: solve without touching the record — no run entry, no files
     *  in the project, optional supply-volts override. Play stays play. */
    sandbox: z.boolean().default(false),
    volts: z.number().positive().optional(),
  }),
  mutates: true,
  gated: false,
  async handler(input, ctx) {
    const s = requireSession(ctx);
    const { name, analyses, tranStop, sandbox, volts } = input as {
      name: string; analyses: ('op' | 'tran' | 'ac')[]; tranStop?: number;
      sandbox: boolean; volts?: number;
    };
    const circuit = s.file.project.circuit;
    if (!circuit) throw new Error('sim_run: no circuit yet — expand or add parts first');

    const cards: string[] = [];
    if (analyses.includes('tran')) cards.push(`.tran 10u ${tranStop ?? 0.01}`);
    if (analyses.includes('ac')) cards.push('.ac dec 20 1 1e6');

    const state = simState(s.file);
    // Sandbox stimuli: override the supply (highest-volts dc) in a COPY.
    let effectiveStimuli = state.stimuli;
    if (sandbox && volts !== undefined) {
      const dcs = state.stimuli.filter((x) => x.kind === 'dc');
      const supply = [...dcs].sort(
        (a, b) => ((b.params.volts as number) ?? 0) - ((a.params.volts as number) ?? 0),
      )[0];
      effectiveStimuli = state.stimuli.map((x) =>
        x === supply ? { ...x, params: { ...x.params, volts } } : x,
      );
    }
    const net = spiceNetlist(
      circuit, defsMap(), profilesMap(), effectiveStimuli, cards,
    );

    if (!(await ngspiceAvailable())) {
      throw new Error(
        'ngspice is not installed on this host — the netlist was generated ' +
          'but cannot be solved. Install ngspice (apt install ngspice).',
      );
    }

    // Per-ref safety profiles for the op checks.
    const profilesByRef = new Map<string, SafetyProfile>();
    for (const part of circuit.parts) {
      const profile = profilesMap().get(part.defId);
      if (profile) profilesByRef.set(part.ref, profile);
    }

    const runId = sandbox ? 'sandbox' : `run-${Object.keys(state.runs).length + 1}-${name}`;
    // The op baseline always runs (spec §4.1) — solved, not just generated.
    // Sandbox runs solve in a scratch dir: the project tree stays untouched.
    const runDir = sandbox
      ? (await import('node:fs')).mkdtempSync(
          (await import('node:path')).join((await import('node:os')).tmpdir(), 'makerlord-sandbox-'),
        )
      : dirname(s.path);
    const op = await runOpAnalysis(runDir, runId, net, profilesByRef);

    const findings = [...net.findings, ...op.findings];
    if (!op.converged) {
      findings.push({
        ruleId: 'SIM_NO_CONVERGENCE',
        severity: 'NOTE',
        message:
          'The simulation could not solve this circuit — a statement about ' +
          `our tool, not your design. Rungs tried: ${op.artifacts.outcome.rungsTried.join(' → ')}.`,
        affected: {},
      });
    }

    if (!sandbox) {
      state.runs[runId] = {
        name,
        provenance: net.provenance,
        findings,
      };
    }
    return ok({
      runId,
      sandbox,
      provenance: net.provenance,
      converged: op.converged,
      rung: op.rung,
      nodeVoltages: op.nodeVoltages,
      netVoltages: op.netVoltages,
      branchCurrentsMa: op.branchCurrentsMa,
      elementMeta: op.elementMeta,
      deviceDissipationW: op.deviceDissipationW,
      findings,
      cir: net.cir,
    });
  },
};

const simResults: ToolDef = {
  name: 'sim_results',
  summary:
    'Call this after sim_run to fetch a named trace, downsampled — the ' +
    'progressive-disclosure pair of sim_run, so megabytes of numbers never ' +
    'enter a prompt.',
  input: z.object({ runId: z.string().min(1) }),
  mutates: false,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { runId } = input as { runId: string };
    const state = simState(s.file);
    const run = state.runs[runId];
    if (!run) throw new Error(`sim_results: no run "${runId}"`);
    return ok({ run });
  },
};

const simCheckRequirements: ToolDef = {
  name: 'sim_check_requirements',
  summary:
    'Call this to check every requirement a simulation can measure — and to ' +
    'get an explicit not-simulable verdict for the rest. Never silence.',
  input: z.object({}),
  mutates: false,
  gated: false,
  async handler(_input, ctx) {
    const s = requireSession(ctx);
    const plan = dischargePlan(s.file.project.requirements);
    const available = await ngspiceAvailable();
    const verdicts = plan.map((p) => {
      if (p.analysis === 'not-simulable') return notSimulable(p.requirement);
      if (!available) {
        return {
          requirementId: p.requirement.id,
          verdict: 'no-result' as const,
          detail:
            `simulable by .${p.analysis}, but ngspice is not installed on ` +
            'this host — no result is not a pass.',
        };
      }
      return {
        requirementId: p.requirement.id,
        verdict: 'no-result' as const,
        detail: `run sim_run with ${p.analysis} and re-check`,
      };
    });
    return ok({ verdicts });
  },
};

export const SIM_TOOLS: ToolDef[] = [
  simStimulusSet, simRun, simResults, simCheckRequirements,
];
