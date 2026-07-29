import type { Finding } from '@makerlord/circuit';
import type { SafetyProfile } from '@makerlord/parts';
import { checkAbsMax, checkDissipation } from './findings.js';
import type { SpiceNetlist } from './netlist.js';
import { parseOpOutput } from './parse.js';
import { severityCeiling } from './provenance.js';
import { runNgspice, type RunArtifacts } from './run.js';

export interface OpResult {
  nodeVoltages: Record<string, number>;
  /** Keyed by INTENT net name — what the schematic's data-net attrs use. */
  netVoltages: Record<string, number>;
  /** Per-element current, mA. Resistors from ΔV/R; series neighbours
   *  inherit their chain's current. Solver-derived, never estimated. */
  branchCurrentsMa: Record<string, number>;
  /** What the virtual bench needs to judge each element. */
  elementMeta: Record<string, { kind: string; maxCurrentMa?: number; powerRatingW?: number }>;
  deviceDissipationW: Record<string, number>;
  findings: Finding[];
  rung: string;
  converged: boolean;
  artifacts: RunArtifacts;
}

/**
 * Pure: per-element branch currents from solved node voltages. Resistors
 * compute directly; every other two-node element inherits through series
 * junctions (nodes touching exactly two elements) until fixed point.
 */
export function computeBranchCurrents(
  elements: { ref: string; kind: string; ohms?: number; nodes: [string, string] }[],
  voltageOf: (node: string) => number,
): Map<string, number> {
  const currents = new Map<string, number>();
  const byNode = new Map<string, string[]>();
  for (const el of elements) {
    for (const n of el.nodes) {
      if (!byNode.has(n)) byNode.set(n, []);
      byNode.get(n)!.push(el.ref);
    }
  }
  for (const el of elements) {
    if (el.kind === 'resistor' && el.ohms) {
      const drop = Math.abs(voltageOf(el.nodes[0]) - voltageOf(el.nodes[1]));
      currents.set(el.ref, (drop / el.ohms) * 1000);
    }
  }
  for (let pass = 0; pass < elements.length; pass += 1) {
    let changed = false;
    for (const el of elements) {
      if (currents.has(el.ref)) continue;
      for (const n of el.nodes) {
        const touching = byNode.get(n) ?? [];
        if (touching.length !== 2) continue;
        const other = touching.find((r) => r !== el.ref);
        if (other && currents.has(other)) {
          currents.set(el.ref, currents.get(other)!);
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return currents;
}

/**
 * The baseline analysis (spec §4.1): runs on every sim_run. Node voltages
 * and per-device dissipation checked against the safety overlay, with
 * severity capped by the weakest model in the loop (D43).
 */
export async function runOpAnalysis(
  projectDir: string,
  runId: string,
  netlist: SpiceNetlist,
  profilesByRef: Map<string, SafetyProfile>,
): Promise<OpResult> {
  // Batch op with printed node table — the shape parseOpOutput reads.
  const cir = netlist.cir.replace(
    '.end',
    '.control\nop\nprint all\n.endc\n.end',
  );
  const artifacts = await runNgspice(projectDir, runId, cir);

  if (!artifacts.outcome.converged) {
    return {
      nodeVoltages: {},
      netVoltages: {},
      branchCurrentsMa: {},
      elementMeta: {},
      deviceDissipationW: {},
      findings: [],
      rung: 'none',
      converged: false,
      artifacts,
    };
  }

  const op = parseOpOutput(artifacts.stdout);
  // ngspice's `print all` emits bare node names; `print v(x)` wraps them.
  const voltageOf = (node: string): number => {
    if (node === '0') return 0;
    const key = node.toLowerCase();
    return op.get(key) ?? op.get(`v(${key})`) ?? 0;
  };

  const nodeVoltages: Record<string, number> = {};
  for (const node of new Set(netlist.nodeOf.values())) {
    nodeVoltages[node] = voltageOf(node);
  }

  // CSV is canonical (spec §2): the trace a human can open in five years.
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  writeFileSync(
    join(artifacts.dir, 'results', `${runId}-op.csv`),
    ['node,volts', ...Object.entries(nodeVoltages).map(([n, v]) => `${n},${v}`), ''].join('\n'),
  );

  // Per-part net voltages, and resistor dissipation from V²/R.
  const ceiling = severityCeiling(netlist.provenance);
  const voltageByRef = new Map<string, number>();
  const powerByRef = new Map<string, number>();

  for (const model of netlist.models) {
    const nodes = [...netlist.nodeOf.entries()]
      .filter(([pin]) => pin.startsWith(`${model.ref}.`))
      .map(([, node]) => node);
    if (nodes.length === 0) continue;
    const volts = nodes.map(voltageOf);
    voltageByRef.set(model.ref, Math.max(...volts.map(Math.abs)));
    if (model.kind === 'resistor' && nodes.length >= 2) {
      const drop = Math.abs(volts[0]! - volts[1]!);
      powerByRef.set(model.ref, (drop * drop) / model.params.ohms!);
    }
  }

  const findings = [
    ...checkAbsMax(voltageByRef, profilesByRef, ceiling),
    ...checkDissipation(powerByRef, profilesByRef, ceiling),
  ];

  // Intent-net voltages + branch currents + judgement metadata for the bench.
  const netVoltages: Record<string, number> = {};
  for (const [netName, node] of netlist.netNodes) {
    netVoltages[netName] = voltageOf(node);
  }
  const twoNode: { ref: string; kind: string; nodes: [string, string]; ohms?: number }[] = [];
  for (const m of netlist.models) {
    const nodes = [...netlist.nodeOf.entries()]
      .filter(([pin]) => pin.startsWith(`${m.ref}.`))
      .map(([, node]) => node);
    if (nodes.length !== 2) continue;
    const el: { ref: string; kind: string; nodes: [string, string]; ohms?: number } =
      { ref: m.ref, kind: m.kind, nodes: [nodes[0]!, nodes[1]!] };
    if (m.params.ohms !== undefined) el.ohms = m.params.ohms;
    twoNode.push(el);
  }
  const currents = computeBranchCurrents(twoNode, voltageOf);
  const elementMeta: Record<string, { kind: string; maxCurrentMa?: number; powerRatingW?: number }> = {};
  for (const m of netlist.models) {
    const profile = profilesByRef.get(m.ref) as
      | { maxCurrentMa?: number; powerRatingW?: number }
      | undefined;
    const meta: { kind: string; maxCurrentMa?: number; powerRatingW?: number } = { kind: m.kind };
    if (profile?.maxCurrentMa !== undefined) meta.maxCurrentMa = profile.maxCurrentMa;
    if (profile?.powerRatingW !== undefined) meta.powerRatingW = profile.powerRatingW;
    elementMeta[m.ref] = meta;
  }

  return {
    nodeVoltages,
    netVoltages,
    branchCurrentsMa: Object.fromEntries(currents),
    elementMeta,
    deviceDissipationW: Object.fromEntries(powerByRef),
    findings,
    rung: artifacts.outcome.rung?.name ?? 'default',
    converged: true,
    artifacts,
  };
}
