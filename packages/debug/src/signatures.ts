import type { Circuit } from '@makerlord/circuit';
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Fault, FaultCandidate } from '@makerlord/project';
import type { Stimulus } from '@makerlord/sim';
import { runOpAnalysis, spiceNetlist } from '@makerlord/sim';
import { applyFault, faultId } from './faults.js';

/**
 * Signatures via the REAL solver (spec §4): mutate → netlist → op run →
 * per-intent-net voltages, provenance carried (D43). Integration layer —
 * ngspice only ever appears here; the search logic upstream is pure.
 *
 * Two override mechanics:
 * - wrong_value re-homes the part on a synthetic defId with a scaled
 *   profile, so ONE ref changes even when a defId is shared.
 * - dead_rail zeroes every dc stimulus.
 * A candidate whose run does not converge keeps an EMPTY signature: it
 * can never be contradicted, so it stays honestly live rather than
 * silently vanishing.
 */
export async function computeSignatures(opts: {
  circuit: Circuit;
  faults: Fault[];
  defs: ReadonlyMap<string, PartDefinition>;
  profiles: ReadonlyMap<string, SafetyProfile>;
  stimuli: Stimulus[];
  workDir: string;
}): Promise<FaultCandidate[]> {
  const out: FaultCandidate[] = [];

  for (const fault of opts.faults) {
    const applied = applyFault(opts.circuit, fault);

    let defs = opts.defs;
    let profiles = opts.profiles;
    let circuit = applied.circuit;
    const factorByRef = applied.overrides.resistanceFactor ?? {};
    if (Object.keys(factorByRef).length > 0) {
      const d = new Map(opts.defs);
      const p = new Map(opts.profiles);
      circuit = structuredClone(circuit);
      for (const [ref, factor] of Object.entries(factorByRef)) {
        const part = circuit.parts.find((x) => x.ref === ref);
        const profile = part && opts.profiles.get(part.defId);
        if (!part || !profile?.resistanceOhms) continue;
        const synthetic = `${part.defId}#${ref}-x${factor}`;
        d.set(synthetic, { ...opts.defs.get(part.defId)!, id: synthetic });
        p.set(synthetic, {
          ...profile,
          partId: synthetic,
          resistanceOhms: profile.resistanceOhms * factor,
        });
        part.defId = synthetic;
      }
      defs = d;
      profiles = p;
    }

    let stimuli = opts.stimuli;
    if (applied.overrides.supplyVolts !== undefined) {
      stimuli = opts.stimuli.map((s) =>
        s.kind === 'dc'
          ? { ...s, params: { ...s.params, volts: applied.overrides.supplyVolts! } }
          : s);
    }

    const id = faultId(fault);
    // Extra-cards arg empty: runOpAnalysis injects the op control block.
    const netlist = spiceNetlist(circuit, defs, profiles, stimuli, []);
    const op = await runOpAnalysis(opts.workDir, `debug-${id}`, netlist,
      refProfiles(circuit, profiles));

    const netVoltages: Record<string, number> = {};
    if (op.converged) {
      for (const [net, v] of Object.entries(op.netVoltages)) netVoltages[net] = v;
      // A meter at a folded net reads the surviving node (bridge).
      for (const [original, alias] of Object.entries(applied.netAliases)) {
        const v = netVoltages[alias];
        if (v !== undefined) netVoltages[original] = v;
      }
    }

    out.push({
      id,
      fault,
      status: 'live',
      signature: { netVoltages, provenance: netlist.provenance },
    });
  }
  return out;
}

function refProfiles(
  circuit: Circuit,
  profiles: ReadonlyMap<string, SafetyProfile>,
): Map<string, SafetyProfile> {
  const byRef = new Map<string, SafetyProfile>();
  for (const part of circuit.parts) {
    const p = profiles.get(part.defId);
    if (p) byRef.set(part.ref, p);
  }
  return byRef;
}
