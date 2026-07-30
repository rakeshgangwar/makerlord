import { z } from 'zod';
import type { Finding } from '@makerlord/circuit';
import { buildSequence } from '@makerlord/circuit';
import {
  architectureGateOpens, checkArchitecture, expandArchitecture,
  makeProjectContext,
} from '@makerlord/project';
import { defsMap, profilesMap } from '../data.js';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import type { RefusalCode, ToolResult } from '../result.js';
import { ok, refuse } from '../result.js';
import { circuitFindings, circuitRuleContext, unverifiedParts } from './checks.js';

/**
 * Maps live findings to the refusal a gated tool must return, or null when
 * nothing blocks. A mains REFUSE outranks ordinary blockers because its
 * remedy is different (D32: no tier opens mains on a breadboard).
 */
export function refusalFor(
  findings: Finding[],
): { code: RefusalCode; blocking: Finding[] } | null {
  const refusals = findings.filter((f) => f.severity === 'REFUSE');
  if (refusals.some((f) => f.ruleId === 'RULE_OUT_OF_SAFE_ENVELOPE')) {
    return { code: 'MAINS_ON_BREADBOARD', blocking: refusals };
  }
  const blockers = findings.filter(
    (f) => f.severity === 'BLOCKER' || f.severity === 'REFUSE',
  );
  if (blockers.length > 0) {
    return { code: 'BLOCKERS_UNRESOLVED', blocking: blockers };
  }
  return null;
}

const expand: ToolDef = {
  name: 'expand',
  summary:
    'Call this when the architecture is decided and clean — it expands blocks ' +
    'into circuit parts. Refuses while any block is undecided or any ' +
    'architecture BLOCKER stands.',
  input: z.object({}),
  mutates: true,
  gated: true,
  handler(_input, ctx): ToolResult<{ parts: number; intent: number }> {
    const s = requireSession(ctx);
    const undecided = s.file.project.architecture.blocks.filter(
      (b) => b.sourcing.type === 'undecided',
    );
    if (undecided.length > 0) {
      return refuse(
        'BLOCK_UNDECIDED',
        `blocks still undecided: ${undecided.map((b) => b.id).join(', ')} — ` +
          'set sourcing with block_sourcing first',
      );
    }
    const pctx = makeProjectContext(s.file.project, defsMap(), profilesMap());
    const findings = checkArchitecture(pctx);
    if (!architectureGateOpens(findings)) {
      return refuse(
        'BLOCKERS_UNRESOLVED',
        'the architecture has unresolved blockers — fix them before expanding',
        findings.filter((f) => f.severity === 'BLOCKER' || f.severity === 'REFUSE'),
      );
    }
    const circuit = expandArchitecture(s.file.project);
    s.file.project.circuit = circuit;
    return ok({ parts: circuit.parts.length, intent: circuit.intent.length });
  },
};

const advanceBuildStep: ToolDef = {
  name: 'advance_build_step',
  summary:
    'Call this when the maker completes a build step. Refuses while the ' +
    'circuit has live blockers, and will not cross the gate unopened.',
  input: z.object({ to: z.number().int().nonnegative() }),
  mutates: true,
  gated: true,
  handler(input, ctx): ToolResult<{ currentStep: number }> {
    const s = requireSession(ctx);
    const { to } = input as { to: number };

    const blocked = refusalFor(circuitFindings(s));
    if (blocked) {
      return refuse(
        blocked.code,
        blocked.code === 'MAINS_ON_BREADBOARD'
          ? 'mains on a breadboard is refused at every tier'
          : `refused: ${blocked.blocking.length} unresolved blocker(s) — fix them first`,
        blocked.blocking,
      );
    }

    const steps = buildSequence(circuitRuleContext(s));
    if (to >= steps.length) {
      throw new Error(
        `advance_build_step: step ${to} does not exist (${steps.length} steps)`,
      );
    }
    const gateIndex = steps.findIndex((x) => x.kind === 'GATE');
    if (gateIndex >= 0 && to > gateIndex && !s.file.build.gateOpen) {
      return refuse(
        'GATE_NOT_OPEN',
        'the power-up gate has not been opened — record measurements and call gate_open',
      );
    }
    s.file.build.currentStep = to;
    return ok({ currentStep: to });
  },
};

const measure: ToolDef = {
  name: 'measure',
  summary:
    'Call this when the maker reports a meter reading — record the value ' +
    'exactly as read, with its unit. The gate consumes these.',
  input: z.object({
    name: z.string().min(1),
    value: z.number(),
    unit: z.string().min(1),
  }),
  mutates: true,
  gated: true,
  handler(input, ctx): ToolResult<{ measurements: number }> {
    const s = requireSession(ctx);
    s.file.build.measurements.push(
      input as { name: string; value: number; unit: string },
    );
    return ok({ measurements: s.file.build.measurements.length });
  },
};

const gateOpen: ToolDef = {
  name: 'gate_open',
  summary:
    'Call this only after the maker has recorded the gate measurements. It ' +
    'refuses without measurements, and refuses while any blocker stands. It ' +
    'never accepts yes/no in place of a reading.',
  input: z.object({}),
  mutates: true,
  gated: true,
  handler(_input, ctx): ToolResult<{ gateOpen: boolean }> {
    const s = requireSession(ctx);
    const blocked = refusalFor(circuitFindings(s));
    if (blocked) {
      return refuse(
        blocked.code,
        blocked.code === 'MAINS_ON_BREADBOARD'
          ? 'mains on a breadboard is refused at every tier'
          : 'the circuit has unresolved blockers — the gate stays shut',
        blocked.blocking,
      );
    }
    if (s.file.build.measurements.length === 0) {
      return refuse(
        'MEASUREMENT_REQUIRED',
        'no measurements recorded — the gate collects readings, never consent. ' +
          'Use measure first.',
      );
    }
    // D50: nothing physical happens on sourced data. Design and sim ran;
    // POWER demands human-verified profiles for every part.
    const sourced = unverifiedParts(s);
    if (sourced.length > 0) {
      return refuse(
        'PROFILE_UNVERIFIED',
        `${sourced.join(', ')} carry sourced profiles — the power gate needs ` +
        'human-verified limits. Promote the proposals (maker curate) or swap ' +
        'in verified parts.',
      );
    }
    s.file.build.gateOpen = true;
    return ok({ gateOpen: true });
  },
};

export const GATED_TOOLS: ToolDef[] = [expand, advanceBuildStep, measure, gateOpen];
