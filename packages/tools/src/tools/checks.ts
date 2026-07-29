import { z } from 'zod';
import type { Finding, RuleContext } from '@makerlord/circuit';
import {
  ALL_RULES, deriveNetlist, diffNetlists, makeContext, predictDc, runRules,
} from '@makerlord/circuit';
import type { Footprint } from '@makerlord/parts';
import {
  checkArchitecture, checkRequirements, makeProjectContext,
} from '@makerlord/project';
import { board, bundle, defsMap, profilesMap } from '../data.js';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { ok } from '../result.js';
import type { Session } from '../session.js';

export function circuitRuleContext(s: Session): RuleContext {
  const circuit = s.file.project.circuit;
  if (!circuit) {
    throw new Error('no circuit yet — run expand, or add parts with part_add');
  }
  const footprints = new Map<string, Footprint>();
  for (const part of circuit.parts) {
    const profile = bundle().profiles[part.defId];
    if (profile) footprints.set(part.defId, profile.footprint);
  }
  const nets = deriveNetlist(board(), circuit, footprints);
  const divergences = diffNetlists(circuit.intent, nets);
  return makeContext(board(), circuit, nets, divergences, defsMap(), profilesMap());
}

export function circuitFindings(s: Session): Finding[] {
  return runRules(ALL_RULES, circuitRuleContext(s));
}

const checkRequirementsTool: ToolDef = {
  name: 'check_requirements',
  summary:
    'Call this after proposing or editing requirements — it reports which are ' +
    'unmeasurable, orphaned, or still assumed.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    const s = requireSession(ctx);
    const pctx = makeProjectContext(s.file.project, defsMap(), profilesMap());
    return ok({ findings: checkRequirements(pctx) });
  },
};

const checkArchitectureTool: ToolDef = {
  name: 'check_architecture',
  summary:
    'Call this after changing blocks or links, and always before expand — it ' +
    'runs the interface, voltage, power-budget and requirement checks.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    const s = requireSession(ctx);
    const pctx = makeProjectContext(s.file.project, defsMap(), profilesMap());
    return ok({ findings: checkArchitecture(pctx) });
  },
};

const checkCircuitTool: ToolDef = {
  name: 'check_circuit',
  summary:
    'Call this after every circuit mutation — it derives the netlist from the ' +
    'layout and runs all safety rules. Findings here gate the build.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    return ok({ findings: circuitFindings(requireSession(ctx)) });
  },
};

const predictDcTool: ToolDef = {
  name: 'predict_dc',
  summary:
    'Call this before the power-up gate — it predicts the rail voltage, total ' +
    'draw and branch currents the maker should measure.',
  input: z.object({}),
  mutates: false,
  gated: false,
  handler(_input, ctx) {
    return ok({ prediction: predictDc(circuitRuleContext(requireSession(ctx))) });
  },
};

export const CHECK_TOOLS: ToolDef[] = [
  checkRequirementsTool,
  checkArchitectureTool,
  checkCircuitTool,
  predictDcTool,
];
