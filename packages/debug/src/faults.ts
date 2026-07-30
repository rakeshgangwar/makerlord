import { humanNetName } from '@makerlord/circuit';
import type { Circuit, IntentNet } from '@makerlord/circuit';
import type { Fault, Symptom } from '@makerlord/project';

/**
 * A fault IS a deterministic mutation of the circuit model (spec §3):
 * apply it, and the mutated circuit is just a circuit — the netlist
 * projection and the op analysis compute what that fault would look
 * like on a meter. No heuristics, no prose pattern matching. Pure: the
 * input circuit is never mutated in place.
 *
 * Two faults don't change topology; they ride along as overrides the
 * signature layer applies: a wrong resistor value scales the profile's
 * resistance, a dead rail zeroes the supply stimulus.
 */

export interface FaultOverrides {
  resistanceFactor?: Record<string, number>;
  supplyVolts?: number;
}

export interface AppliedFault {
  circuit: Circuit;
  overrides: FaultOverrides;
  /** Original net name → the mutated circuit's name for it (a bridge
   *  folds netB into netA; a meter at netB still reads netA's node). */
  netAliases: Record<string, string>;
}

const clone = (c: Circuit): Circuit => JSON.parse(JSON.stringify(c)) as Circuit;

export function applyFault(circuit: Circuit, fault: Fault): AppliedFault {
  switch (fault.kind) {
    case 'no_fault':
      return { circuit: clone(circuit), overrides: {}, netAliases: {} };

    case 'open_joint': {
      const c = clone(circuit);
      const net = c.intent.find((n) => n.name === fault.net);
      if (net) {
        if (fault.member !== undefined) {
          const [ref, pin] = fault.member.split('.');
          net.members = net.members.filter((m) => !(m.ref === ref && m.pin === pin));
        } else {
          net.members = net.members.slice(0, -1);
        }
      }
      return { circuit: c, overrides: {}, netAliases: {} };
    }

    case 'bridge': {
      const c = clone(circuit);
      const a = c.intent.find((n) => n.name === fault.netA);
      const b = c.intent.find((n) => n.name === fault.netB);
      if (a && b) {
        a.members = [...a.members, ...b.members];
        c.intent = c.intent.filter((n) => n !== b);
      }
      return { circuit: c, overrides: {}, netAliases: { [fault.netB]: fault.netA } };
    }

    case 'reversed_part': {
      const c = clone(circuit);
      const nets = c.intent.filter((n) => n.members.some((m) => m.ref === fault.ref));
      const pins = nets.flatMap((n) => n.members.filter((m) => m.ref === fault.ref));
      if (pins.length === 2) {
        const [p0, p1] = [pins[0]!.pin, pins[1]!.pin];
        for (const n of nets) {
          for (const m of n.members) {
            if (m.ref === fault.ref) m.pin = m.pin === p0 ? p1! : p0!;
          }
        }
      }
      return { circuit: c, overrides: {}, netAliases: {} };
    }

    case 'wrong_value':
      return {
        circuit: clone(circuit),
        overrides: { resistanceFactor: { [fault.ref]: fault.factor } },
        netAliases: {},
      };

    case 'dead_rail':
      return { circuit: clone(circuit), overrides: { supplyVolts: 0 }, netAliases: {} };
  }
}

/** The nets an element touches. */
function netsOf(circuit: Circuit, ref: string): IntentNet[] {
  return circuit.intent.filter((n) => n.members.some((m) => m.ref === ref));
}

/**
 * Symptom-directed candidate generation — GENEROUS (spec §3): pruning is
 * the engine's job, and a quietly-too-small fault set is exactly the
 * fluent-but-wrong failure this stage exists to kill. Always includes
 * no_fault: exoneration is a verdict, not a failure. Deterministic:
 * stable order, stable ids.
 */
export function generateCandidates(
  circuit: Circuit,
  symptom: Symptom,
  polarizedRefs: ReadonlySet<string>,
  resistorRefs?: ReadonlySet<string>,
): Fault[] {
  const faults: Fault[] = [{ kind: 'no_fault' }, { kind: 'dead_rail' }];
  const isResistor = (ref: string): boolean =>
    resistorRefs?.has(ref) ?? /^R\d/.test(ref);

  const around = (refs: string[]): void => {
    const nets = [...new Set(refs.flatMap((r) => netsOf(circuit, r)))];
    for (const net of nets) {
      faults.push({ kind: 'open_joint', net: net.name });
      // Neighbouring elements on those nets are suspects too.
      for (const m of net.members) {
        if (polarizedRefs.has(m.ref) && !faults.some(
          (f) => f.kind === 'reversed_part' && f.ref === m.ref)) {
          faults.push({ kind: 'reversed_part', ref: m.ref });
        }
        if (isResistor(m.ref) && !faults.some(
          (f) => f.kind === 'wrong_value' && f.ref === m.ref)) {
          faults.push({ kind: 'wrong_value', ref: m.ref, factor: 10 });
        }
        // Second-degree: the parts on these nets pull in THEIR other nets.
        for (const other of netsOf(circuit, m.ref)) {
          if (!nets.includes(other)) nets.push(other);
        }
      }
    }
    // Adjacent-net bridges among the collected nets.
    for (let i = 0; i < nets.length; i += 1) {
      for (let j = i + 1; j < nets.length; j += 1) {
        faults.push({ kind: 'bridge', netA: nets[i]!.name, netB: nets[j]!.name });
      }
    }
  };

  switch (symptom.kind) {
    case 'element_dead':
    case 'wrong_reading':
      around(symptom.ref !== undefined ? [symptom.ref] : []);
      break;
    case 'no_serial':
    case 'board_dead':
      // Rail-focused: every part touching a rail-named net is in scope.
      around(circuit.parts.map((p) => p.ref));
      break;
  }
  return faults;
}

/** Maker-language description of a fault — every display surface
 *  (UI hypotheses, probe rationale, CLI) reads THIS, never the id. */
export function describeFault(fault: Fault): string {
  switch (fault.kind) {
    case 'no_fault': return 'nothing is wrong (the circuit is fine)';
    case 'open_joint': return `a connection at ${humanNetName(fault.net)} is not actually made`;
    case 'bridge': return `${humanNetName(fault.netA)} and ${humanNetName(fault.netB)} are touching`;
    case 'reversed_part': return `${fault.ref} is in backwards`;
    case 'wrong_value': return `${fault.ref} is a ×${fault.factor} wrong value`;
    case 'dead_rail': return 'the supply rail is dead';
  }
}

/** Stable id for a fault — the facet's candidate key. */
export function faultId(fault: Fault): string {
  switch (fault.kind) {
    case 'no_fault': return 'no-fault';
    case 'open_joint': return `open-${fault.net}`;
    case 'bridge': return `bridge-${fault.netA}-${fault.netB}`;
    case 'reversed_part': return `reversed-${fault.ref}`;
    case 'wrong_value': return `value-${fault.ref}-x${fault.factor}`;
    case 'dead_rail': return 'dead-rail';
  }
}
