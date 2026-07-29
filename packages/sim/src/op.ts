import type { Finding } from '@makerlord/circuit';
import type { SafetyProfile } from '@makerlord/parts';
import { checkAbsMax, checkDissipation } from './findings.js';
import type { SpiceNetlist } from './netlist.js';
import { parseOpOutput } from './parse.js';
import { severityCeiling } from './provenance.js';
import { runNgspice, type RunArtifacts } from './run.js';

export interface OpResult {
  nodeVoltages: Record<string, number>;
  deviceDissipationW: Record<string, number>;
  findings: Finding[];
  rung: string;
  converged: boolean;
  artifacts: RunArtifacts;
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

  return {
    nodeVoltages,
    deviceDissipationW: Object.fromEntries(powerByRef),
    findings,
    rung: artifacts.outcome.rung?.name ?? 'default',
    converged: true,
    artifacts,
  };
}
