import { z } from 'zod';
import type { Finding, RuleContext } from '@makerlord/circuit';
import {
  ALL_RULES, deriveNetlist, diffNetlists, makeContext, predictDc, runRules,
} from '@makerlord/circuit';
import type { Footprint } from '@makerlord/parts';
import {
  checkArchitecture, checkRequirements, makeProjectContext,
} from '@makerlord/project';
import { board, bundle, defsMap, profilesMap, tierOf } from '../data.js';
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
  // D56: a freeform circuit HAS no geometry — the intent nets ARE the
  // netlist, so every electrical rule adjudicates them directly, and
  // there is no layout to diverge from.
  const nets = circuit.target === 'freeform'
    ? circuit.intent.map((n) => ({ id: n.name, holes: [], pins: n.members }))
    : deriveNetlist(board(), circuit, footprints);
  const divergences = circuit.target === 'freeform'
    ? []
    : diffNetlists(circuit.intent, nets);
  return makeContext(board(), circuit, nets, divergences, defsMap(), profilesMap());
}

/** D50: sourced parts design freely, but every check says so — and the
 *  gates refuse them (unverifiedParts below is what the gates read). */
export function unverifiedParts(s: Session): string[] {
  const circuit = s.file.project.circuit;
  if (!circuit) return [];
  return [...new Set(
    circuit.parts.filter((p) => tierOf(p.defId) !== 'verified').map((p) => p.ref),
  )];
}

export function circuitFindings(s: Session): Finding[] {
  const findings = runRules(ALL_RULES, circuitRuleContext(s));
  const sourced = unverifiedParts(s);
  if (sourced.length > 0) {
    findings.push({
      ruleId: 'PART_PROFILE_SOURCED',
      severity: 'NOTE',
      message:
        `${sourced.join(', ')} carr${sourced.length === 1 ? 'ies' : 'y'} a ` +
        'sourced (agent-researched) profile — cited, not human-verified. ' +
        'Design and simulation run as normal; the power gate will refuse ' +
        'until the proposal is promoted',
      affected: { parts: sourced },
      suggestedFix:
        'review the proposal with `maker curate show`, check its citations, ' +
        'and promote it — or swap in a verified part',
    });
  }
  return findings;
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
