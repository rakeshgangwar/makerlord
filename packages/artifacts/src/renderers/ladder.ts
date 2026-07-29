import type { Circuit } from '@makerlord/circuit';
import type { PartDefinition } from '@makerlord/parts';

/**
 * The electrical-structure extractor behind schematic v3: recognise the
 * shape a human would draw specially — a source feeding parallel branches
 * of series elements (the "ladder") — so placement can follow electrical
 * convention instead of graph aesthetics. Anything that doesn't reduce to
 * a ladder returns null and the caller falls back to ELK. Pure and
 * deterministic: iteration is ref-sorted throughout.
 */

export interface LadderElement {
  ref: string;
  defId: string;
  /** True when current enters this polarized element at its cathode side —
   *  the glyph must be drawn flipped or the schematic lies. */
  flipped: boolean;
}

export interface LadderBranch {
  elements: LadderElement[];
  /** Net names bounding each element: nets[0] is the supply tap, nets[i]
   *  joins elements i-1 and i, nets[last] is the return. The virtual bench
   *  animates these segments by name. */
  nets: string[];
}

export interface LadderModel {
  source: { ref: string; defId: string; plusNet: string; minusNet: string };
  branches: LadderBranch[];
}

type Defs = ReadonlyMap<string, PartDefinition>;

function isSource(def: PartDefinition | undefined): boolean {
  const hay = `${def?.family ?? ''} ${def?.title ?? ''}`.toLowerCase();
  return /battery|power supply/.test(hay);
}

export function buildLadder(circuit: Circuit, defs: Defs): LadderModel | null {
  const parts = [...circuit.parts].sort((a, b) => a.ref.localeCompare(b.ref));

  // The source: exactly one battery-family part with +/− pins.
  const sources = parts.filter((p) => isSource(defs.get(p.defId)));
  if (sources.length !== 1) return null;
  const source = sources[0]!;
  const srcDef = defs.get(source.defId)!;
  const plusPin = srcDef.pins.find((p) => /\+|vcc|pos/i.test(p.name))?.name;
  const minusPin = srcDef.pins.find((p) => /-|gnd|neg/i.test(p.name))?.name;
  if (!plusPin || !minusPin) return null;

  // Real-world intent carries two artefacts the walk must survive: expand's
  // placeholder nets naming block-interface pins that don't exist on the
  // part (drop those members), and one physical node split across several
  // intent nets that share a pin (union-find them into one supernet).
  const isRealPin = (ref: string, pin: string): boolean => {
    const part = circuit.parts.find((p) => p.ref === ref);
    return !!defs.get(part?.defId ?? '')?.pins.some((p) => p.name === pin);
  };

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string): void => {
    const [ra, rb] = [find(a), find(b)].sort();
    parent.set(rb!, ra!);
  };

  const realNets = circuit.intent
    .map((net) => ({
      name: net.name,
      members: net.members.filter((m) => isRealPin(m.ref, m.pin)),
    }))
    .filter((net) => net.members.length >= 2)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const net of realNets) parent.set(net.name, net.name);
  const netsOfPin = new Map<string, string[]>();
  for (const net of realNets) {
    for (const m of net.members) {
      const key = `${m.ref}::${m.pin}`;
      if (!netsOfPin.has(key)) netsOfPin.set(key, []);
      netsOfPin.get(key)!.push(net.name);
    }
  }
  for (const names of netsOfPin.values()) {
    for (let i = 1; i < names.length; i += 1) union(names[0]!, names[i]!);
  }

  const netOf = new Map<string, string>();
  const pinsOnNet = new Map<string, { ref: string; pin: string }[]>();
  for (const net of realNets) {
    const canon = find(net.name);
    for (const m of net.members) {
      netOf.set(`${m.ref}::${m.pin}`, canon);
      if (!pinsOnNet.has(canon)) pinsOnNet.set(canon, []);
      pinsOnNet.get(canon)!.push({ ref: m.ref, pin: m.pin });
    }
  }

  const plusNet = netOf.get(`${source.ref}::${plusPin}`);
  const minusNet = netOf.get(`${source.ref}::${minusPin}`);
  if (!plusNet || !minusNet) return null;

  // Every non-source part must be a fully-wired two-pin element.
  const elements = new Map<string, { defId: string; pins: [string, string]; nets: [string, string] }>();
  for (const p of parts) {
    if (p.ref === source.ref) continue;
    const def = defs.get(p.defId);
    if (!def || def.pins.length !== 2) return null;
    const [a, b] = [def.pins[0]!.name, def.pins[1]!.name];
    const na = netOf.get(`${p.ref}::${a}`);
    const nb = netOf.get(`${p.ref}::${b}`);
    if (!na || !nb) return null;
    elements.set(p.ref, { defId: p.defId, pins: [a, b], nets: [na, nb] });
  }
  if (elements.size === 0) return null;

  /** Cathode-family pin names — current should LEAVE here, not enter. */
  const entersAtCathode = (defId: string, entryPin: string): boolean => {
    const def = defs.get(defId);
    if (!def) return false;
    return /cathode|^-$|neg/i.test(entryPin) && def.pins.some((p) => /anode|^\+$/i.test(p.name));
  };

  const consumed = new Set<string>();
  const branches: LadderBranch[] = [];

  const starters = (pinsOnNet.get(plusNet) ?? [])
    .filter((m) => m.ref !== source.ref)
    .sort((a, b) => a.ref.localeCompare(b.ref));

  for (const start of starters) {
    if (consumed.has(start.ref)) continue;
    const chain: LadderElement[] = [];
    const nets: string[] = [plusNet];
    let currentRef = start.ref;
    let entryNet = plusNet;
    for (;;) {
      const el = elements.get(currentRef);
      if (!el || consumed.has(currentRef)) return null;
      const entryIdx = el.nets[0] === entryNet ? 0 : el.nets[1] === entryNet ? 1 : -1;
      if (entryIdx === -1) return null;
      const entryPin = el.pins[entryIdx]!;
      const exitNet = el.nets[entryIdx === 0 ? 1 : 0]!;
      chain.push({ ref: currentRef, defId: el.defId, flipped: entersAtCathode(el.defId, entryPin) });
      consumed.add(currentRef);
      nets.push(exitNet);
      if (exitNet === minusNet) break;
      // Series continuation: the exit net must join exactly one other element.
      const others = (pinsOnNet.get(exitNet) ?? []).filter((m) => m.ref !== currentRef);
      if (others.length !== 1 || others[0]!.ref === source.ref) return null;
      currentRef = others[0]!.ref;
      entryNet = exitNet;
    }
    branches.push({ elements: chain, nets });
  }

  // A ladder must explain the WHOLE circuit — leftovers mean fallback.
  if (consumed.size !== elements.size) return null;
  if (branches.length === 0) return null;

  return {
    source: { ref: source.ref, defId: source.defId, plusNet, minusNet },
    branches,
  };
}
