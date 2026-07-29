import type { Circuit, Finding } from '@makerlord/circuit';
import { DisjointSet, pinKey } from '@makerlord/circuit';
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { DeviceModel } from './models.js';
import { deviceModel } from './models.js';
import type { ModelProvenance } from './provenance.js';
import { weakest } from './provenance.js';
import type { Stimulus } from './stimulus.js';
import { assumedStimulusFinding, stimulusLine } from './stimulus.js';

export interface SpiceNetlist {
  cir: string;
  nodeOf: Map<string, string>;      // pinKey -> node name
  models: DeviceModel[];
  provenance: ModelProvenance;      // weakest in the loop (D43)
  findings: Finding[];              // model-missing + assumed-stimulus notes
}

/**
 * Deterministic projection (D2): intent connectivity in, a readable and
 * hand-runnable circuit.cir out. Ground is any net carrying a gnd-role pin.
 */
export function spiceNetlist(
  circuit: Circuit,
  defs: ReadonlyMap<string, PartDefinition>,
  profiles: ReadonlyMap<string, SafetyProfile>,
  stimuli: Stimulus[],
  analyses: string[],
): SpiceNetlist {
  // 1. Union pins through intent nets.
  const ds = new DisjointSet();
  for (const net of circuit.intent) {
    const members = net.members.map(pinKey);
    for (const m of members) ds.add(m);
    for (let i = 1; i < members.length; i += 1) ds.union(members[0]!, members[i]!);
  }

  // 2. Name nodes: prefer the intent-net name; ground nets become node 0.
  const nodeOf = new Map<string, string>();
  const rootName = new Map<string, string>();
  for (const net of circuit.intent) {
    for (const member of net.members) {
      const key = pinKey(member);
      const root = ds.find(key);
      const inst = circuit.parts.find((p) => p.ref === member.ref);
      const role = inst
        ? defs.get(inst.defId)?.pins.find((x) => x.name === member.pin)?.role
        : undefined;
      if (role === 'gnd') rootName.set(root, '0');
      if (!rootName.has(root)) rootName.set(root, net.name.replace(/[^A-Za-z0-9_]/g, '_'));
    }
  }
  for (const net of circuit.intent) {
    for (const member of net.members) {
      const key = pinKey(member);
      nodeOf.set(key, rootName.get(ds.find(key))!);
    }
  }

  // 3. Devices with provenance.
  const findings: Finding[] = [];
  const models: DeviceModel[] = [];
  const lines: string[] = [
    '* MakerLord generated netlist — a projection of project.json (D2).',
    '* Readable and hand-runnable on purpose. Check our work.',
  ];
  const cards: string[] = [];

  for (const inst of circuit.parts) {
    const def = defs.get(inst.defId);
    const profile = profiles.get(inst.defId);
    const { model, finding } = deviceModel(inst.ref, def, profile);
    models.push(model);
    if (finding) findings.push(finding);

    const pins = def?.pins ?? [];
    const node = (pinName: string): string =>
      nodeOf.get(pinKey({ ref: inst.ref, pin: pinName })) ?? `nc_${inst.ref}_${pinName}`;

    switch (model.kind) {
      case 'resistor': {
        const [a, b] = [pins[0]?.name ?? 'a', pins[1]?.name ?? 'b'];
        lines.push(
          `R${inst.ref} ${node(a)} ${node(b)} ${model.params.ohms} ` +
            `; ${model.provenance}`,
        );
        break;
      }
      case 'diode': {
        const anode = pins.find((p) => p.name.toLowerCase().includes('anode'))?.name ?? pins[1]?.name ?? 'anode';
        const cathode = pins.find((p) => p.name.toLowerCase().includes('cathode'))?.name ?? pins[0]?.name ?? 'cathode';
        lines.push(
          `D${inst.ref} ${node(anode)} ${node(cathode)} ${model.modelName ?? `D_${inst.ref}`} ` +
            `; ${model.provenance}`,
        );
        if (model.card) cards.push(model.card);
        break;
      }
      case 'mcu-stub': {
        // The MCU boundary: a supply-current sink between rail and ground.
        const supply = pins.find((p) => p.role === 'supply')?.name;
        const gnd = pins.find((p) => p.role === 'gnd')?.name;
        if (supply && gnd) {
          lines.push(
            `I${inst.ref} ${node(supply)} ${node(gnd)} ` +
              `${(model.params.activeMa! / 1000).toPrecision(3)} ; mcu stub, ${model.provenance}`,
          );
        }
        break;
      }
      case 'stub':
        lines.push(`* ${inst.ref} (${model.partId}) stubbed — no model`);
        break;
    }
  }

  // 4. Stimulus sources. A target may be a pin reference ("U1.5V") — the
  //    ergonomic form — which resolves to that pin's node; otherwise it is
  //    taken as a net/node name.
  stimuli.forEach((s, i) => {
    const node =
      nodeOf.get(s.target) ?? s.target.replace(/[^A-Za-z0-9_]/g, '_');
    lines.push(`${stimulusLine(s, i, node)} ; ${s.provenance}`);
  });
  const assumed = assumedStimulusFinding(stimuli);
  if (assumed) findings.push(assumed);

  // 5. Cards and analyses.
  lines.push(...cards);
  lines.push(...analyses);
  lines.push('.end', '');

  const provenance = weakest([
    ...models.map((m) => m.provenance),
    ...stimuli.map((s): ModelProvenance =>
      s.provenance === 'assumed' ? 'assumed' : 'computed',
    ),
  ]);

  return { cir: lines.join('\n'), nodeOf, models, provenance, findings };
}
